"""
Service (business-logic) layer for the scan module.

This layer sits between the **router** (HTTP) and the **DAO** (SQL).
It owns:
  - Orchestration of URL fetching, HTML parsing, and image extraction.
  - Persisting scan results to the database.
  - Access-control checks (user can only view their own scans).
  - HTTP error semantics (raises ``HTTPException`` where appropriate).

It does **not** touch raw SQL – that is delegated entirely to the DAO.

``process_scan`` is designed to run as a FastAPI ``BackgroundTask``.
Because the request-scoped connection is released before background tasks
execute, it receives the **pool** and acquires its own connection.
"""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urljoin, urlparse

import asyncpg
import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

from app.scan.dao import scan_dao

logger = logging.getLogger(__name__)

# Module-level constants used by the scraper

_HTTPX_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
_MAX_REDIRECTS = 5
_USER_AGENT = "MozilorAltChecker/1.0 (accessibility scanner)"
_MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 10 MB


class _ScanError(Exception):
    """Raised for expected scraping failures (bad status, non-HTML, etc.)."""


class ScanService:
    """Business logic layer for URL scanning operations."""

    def __init__(self) -> None:
        self.dao = scan_dao

    # Public API (called by the router)

    async def create_pending_scan(
        self,
        conn: asyncpg.Connection,
        url: str,
        user_id: int,
    ) -> dict:
        """Insert a scan row with ``status='pending'`` and return it.

        This is called synchronously during the request.  The actual
        scraping happens in :meth:`process_scan` as a background task.
        """
        scan = await self.dao.insert_scan(conn, user_id, url)
        logger.info(
            "Scan created: scan_id=%d user_id=%d url=%s",
            scan["id"],
            user_id,
            url,
        )
        return scan

    async def process_scan(
        self,
        pool: asyncpg.Pool,
        scan_id: int,
        url: str,
    ) -> None:
        """Fetch a URL, extract images, and persist results.

        This method is intended to be run as a ``BackgroundTask``.  It
        acquires its own connection from *pool* because the request-scoped
        connection has already been released by the time this executes.

        On success the scan row is updated to ``status='completed'`` with
        image counts, and individual image rows are inserted.  On failure
        the scan is marked ``status='failed'`` with an error message.
        """
        logger.info("Background scan started: scan_id=%d url=%s", scan_id, url)

        try:
            images = await self._fetch_and_extract_images(url)

            total = len(images)
            with_alt = sum(1 for img in images if img["has_alt"])
            without_alt = total - with_alt

            async with pool.acquire() as conn:
                async with conn.transaction():
                    await self.dao.update_scan_results(
                        conn, scan_id, total, with_alt, without_alt
                    )
                    await self.dao.insert_scan_images(conn, scan_id, images)

            logger.info(
                "Scan completed: scan_id=%d url=%s total_images=%d "
                "with_alt=%d without_alt=%d",
                scan_id,
                url,
                total,
                with_alt,
                without_alt,
            )

        except httpx.TimeoutException:
            await self._fail_scan(pool, scan_id, url, "Target URL timed out.")
        except httpx.ConnectError:
            await self._fail_scan(
                pool, scan_id, url, "Could not connect to the target URL."
            )
        except httpx.TooManyRedirects:
            await self._fail_scan(
                pool, scan_id, url, "Too many redirects while fetching URL."
            )
        except _ScanError as exc:
            await self._fail_scan(pool, scan_id, url, str(exc))
        except Exception:
            logger.exception(
                "Unexpected error processing scan_id=%d url=%s", scan_id, url
            )
            await self._fail_scan(
                pool, scan_id, url, "An internal error occurred during the scan."
            )

    async def get_user_scans(
        self,
        conn: asyncpg.Connection,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """Return a paginated list of scans belonging to *user_id*."""
        scans = await self.dao.get_scans_by_user(conn, user_id, limit, offset)
        total = await self.dao.get_scan_count_by_user(conn, user_id)
        return {"scans": scans, "total": total}

    async def get_scan_detail(
        self,
        conn: asyncpg.Connection,
        scan_id: int,
        user_id: int,
    ) -> dict:
        """Return a single scan with its image details.

        Raises:
            HTTPException 404: if the scan does not exist.
            HTTPException 403: if the scan does not belong to *user_id*.
        """
        scan = await self.dao.get_scan_by_id(conn, scan_id)

        if scan is None:
            logger.warning(
                "Scan not found: scan_id=%d requested_by=user_id=%d",
                scan_id,
                user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scan not found.",
            )

        if scan["user_id"] != user_id:
            logger.warning(
                "Unauthorised scan access: scan_id=%d owner_id=%d requester_id=%d",
                scan_id,
                scan["user_id"],
                user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this scan.",
            )

        images: list[dict] = []
        if scan["status"] == "completed":
            images = await self.dao.get_scan_images(conn, scan_id)

        return {**scan, "images": images}

    async def delete_user_scan(
        self,
        conn: asyncpg.Connection,
        scan_id: int,
        user_id: int,
    ) -> None:
        """Delete a scan owned by *user_id*.

        Raises:
            HTTPException 404: if the scan does not exist.
            HTTPException 403: if the scan belongs to a different user.
            HTTPException 409: if the scan is still ``pending`` (background
                task is in progress — deleting now would leave an orphaned
                background task attempting to write to a deleted row).
        """
        scan = await self.dao.get_scan_by_id(conn, scan_id)

        if scan is None:
            logger.warning(
                "Delete attempted on non-existent scan: scan_id=%d user_id=%d",
                scan_id,
                user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scan not found.",
            )

        if scan["user_id"] != user_id:
            logger.warning(
                "Unauthorised scan deletion attempt: scan_id=%d owner_id=%d requester_id=%d",
                scan_id,
                scan["user_id"],
                user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this scan.",
            )

        if scan["status"] == "pending":
            logger.warning(
                "Attempted to delete pending scan: scan_id=%d user_id=%d",
                scan_id,
                user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete a scan that is still processing.",
            )

        await self.dao.delete_scan(conn, scan_id)
        logger.info(
            "Scan deleted: scan_id=%d user_id=%d url=%s",
            scan_id,
            user_id,
            scan["url"],
        )

    # Private helpers

    def _validate_url_for_ssrf(self, url: str) -> None:
        """Reject URLs that would cause the server to contact internal resources.

        Blocks:
        - Non-HTTP(S) schemes (file://, ftp://, etc.)
        - Loopback addresses (127.0.0.0/8, ::1)
        - Private RFC-1918 ranges (10.x, 172.16–31.x, 192.168.x)
        - Link-local / APIPA addresses (169.254.x.x — AWS/GCP metadata)
        - Multicast and "unspecified" addresses

        Raises:
            _ScanError: with a user-facing message if the URL is unsafe.
        """
        try:
            parsed = urlparse(url)
        except Exception:
            raise _ScanError("Invalid URL format.")

        if parsed.scheme not in ("http", "https"):
            raise _ScanError("Only HTTP and HTTPS URLs are supported.")

        hostname = parsed.hostname
        if not hostname:
            raise _ScanError("URL has no hostname.")

        # Resolve hostname → IP address(es).
        # This catches "localhost", "localtest.me", split-horizon DNS tricks, etc.
        try:
            addr_infos = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise _ScanError(f"Could not resolve hostname '{hostname}'.")

        for _, _, _, _, sockaddr in addr_infos:
            raw_ip = sockaddr[0]
            try:
                ip = ipaddress.ip_address(raw_ip)
            except ValueError:
                continue

            if (
                ip.is_loopback
                or ip.is_private
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_unspecified
            ):
                logger.warning("SSRF blocked: url=%s resolved_ip=%s", url, raw_ip)
                raise _ScanError(
                    "Scanning private, loopback, or link-local addresses is not allowed."
                )

    async def _fail_scan(
        self,
        pool: asyncpg.Pool,
        scan_id: int,
        url: str,
        message: str,
    ) -> None:
        """Mark a scan as failed.  Used by ``process_scan`` error handlers."""
        logger.warning(
            "Scan failed: scan_id=%d url=%s reason=%s", scan_id, url, message
        )
        async with pool.acquire() as conn:
            await self.dao.update_scan_failed(conn, scan_id, message)

    async def _fetch_and_extract_images(self, url: str) -> list[dict]:
        """Fetch a page and return a list of image dicts.

        Each dict has keys: ``src`` (absolute URL), ``alt`` (str or None),
        ``has_alt`` (bool).

        Raises:
            _ScanError: on non-2xx responses or non-HTML content types.
            httpx.*: on network-level failures (propagated to caller).
        """
        logger.debug("Fetching URL: %s", url)

        self._validate_url_for_ssrf(url)

        async with httpx.AsyncClient(
            timeout=_HTTPX_TIMEOUT,
            follow_redirects=True,
            max_redirects=_MAX_REDIRECTS,
        ) as client:
            response = await client.get(url, headers={"User-Agent": _USER_AGENT})

        logger.debug(
            "Fetch complete: url=%s status=%d content_length=%d",
            url,
            response.status_code,
            len(response.content),
        )

        # Validate response

        if response.status_code >= 400:
            raise _ScanError(f"Target server returned HTTP {response.status_code}.")

        content_type = response.headers.get("content-type", "")
        if "text/html" not in content_type:
            raise _ScanError(
                f"URL returned content type '{content_type}', expected HTML."
            )

        if len(response.content) > _MAX_RESPONSE_BYTES:
            raise _ScanError("Response too large (exceeds 10 MB limit).")

        # Parse and extract

        soup = BeautifulSoup(response.text, "lxml")
        base_url = str(response.url)
        img_tags = soup.find_all("img")

        images: list[dict] = []
        for img in img_tags:
            raw_src = img.get("src", "")
            src = urljoin(base_url, raw_src) if raw_src else ""

            alt = img.get("alt")  # None if attribute is missing entirely
            has_alt = alt is not None  # empty alt="" is valid per WCAG

            images.append({"src": src, "alt": alt, "has_alt": has_alt})

        logger.debug("Parsed %d image(s) from %s", len(images), url)
        return images


scan_service: ScanService = ScanService()
