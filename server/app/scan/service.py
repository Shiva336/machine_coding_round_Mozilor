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

import logging
from urllib.parse import urljoin

import asyncpg
import httpx
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

from app.scan import dao

logger = logging.getLogger(__name__)

# Constants 

_HTTPX_TIMEOUT = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
_MAX_REDIRECTS = 5
_USER_AGENT = "MozilorAltChecker/1.0 (accessibility scanner)"
_MAX_RESPONSE_BYTES = 10 * 1024 * 1024  # 10 MB


# Public API (called by the router) 


async def create_pending_scan(
    conn: asyncpg.Connection,
    url: str,
    user_id: int,
) -> dict:
    """Insert a scan row with ``status='pending'`` and return it.

    This is called synchronously during the request.  The actual
    scraping happens in :func:`process_scan` as a background task.
    """
    return await dao.insert_scan(conn, user_id, url)


async def process_scan(pool: asyncpg.Pool, scan_id: int, url: str) -> None:
    """Fetch a URL, extract images, and persist results.

    This function is intended to be run as a ``BackgroundTask``.  It
    acquires its own connection from *pool* because the request-scoped
    connection has already been released by the time this executes.

    On success the scan row is updated to ``status='completed'`` with
    image counts, and individual image rows are inserted.  On failure
    the scan is marked ``status='failed'`` with an error message.
    """
    try:
        images = await _fetch_and_extract_images(url)

        total = len(images)
        with_alt = sum(1 for img in images if img["has_alt"])
        without_alt = total - with_alt

        async with pool.acquire() as conn:
            async with conn.transaction():
                await dao.update_scan_results(
                    conn, scan_id, total, with_alt, without_alt
                )
                await dao.insert_scan_images(conn, scan_id, images)

        logger.info(
            "Scan %d completed: %d images (%d with alt, %d without)",
            scan_id,
            total,
            with_alt,
            without_alt,
        )

    except httpx.TimeoutException:
        await _fail_scan(pool, scan_id, "Target URL timed out.")
    except httpx.ConnectError:
        await _fail_scan(pool, scan_id, "Could not connect to the target URL.")
    except httpx.TooManyRedirects:
        await _fail_scan(pool, scan_id, "Too many redirects while fetching URL.")
    except _ScanError as exc:
        await _fail_scan(pool, scan_id, str(exc))
    except Exception as exc:
        logger.exception("Unexpected error processing scan %d", scan_id)
        await _fail_scan(pool, scan_id, f"Scan failed: {exc}")


async def get_user_scans(
    conn: asyncpg.Connection,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """Return a paginated list of scans belonging to *user_id*."""
    scans = await dao.get_scans_by_user(conn, user_id, limit, offset)
    total = await dao.get_scan_count_by_user(conn, user_id)
    return {"scans": scans, "total": total}


async def get_scan_detail(
    conn: asyncpg.Connection,
    scan_id: int,
    user_id: int,
) -> dict:
    """Return a single scan with its image details.

    Raises:
        HTTPException 404: if the scan does not exist.
        HTTPException 403: if the scan does not belong to *user_id*.
    """
    scan = await dao.get_scan_by_id(conn, scan_id)

    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found.",
        )

    if scan["user_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this scan.",
        )

    images: list[dict] = []
    if scan["status"] == "completed":
        images = await dao.get_scan_images(conn, scan_id)

    return {**scan, "images": images}


# Private helpers


class _ScanError(Exception):
    """Raised for expected scraping failures (bad status, non-HTML, etc.)."""


async def _fail_scan(pool: asyncpg.Pool, scan_id: int, message: str) -> None:
    """Mark a scan as failed.  Used by ``process_scan`` error handlers."""
    logger.warning("Scan %d failed: %s", scan_id, message)
    async with pool.acquire() as conn:
        await dao.update_scan_failed(conn, scan_id, message)


async def _fetch_and_extract_images(url: str) -> list[dict]:
    """Fetch a page and return a list of image dicts.

    Each dict has keys: ``src`` (absolute URL), ``alt`` (str or None),
    ``has_alt`` (bool).

    Raises:
        _ScanError: on non-2xx responses or non-HTML content types.
        httpx.*: on network-level failures (propagated to caller).
    """
    async with httpx.AsyncClient(
        timeout=_HTTPX_TIMEOUT,
        follow_redirects=True,
        max_redirects=_MAX_REDIRECTS,
    ) as client:
        response = await client.get(url, headers={"User-Agent": _USER_AGENT})

    # Validate response 

    if response.status_code >= 400:
        raise _ScanError(f"Target server returned HTTP {response.status_code}.")

    content_type = response.headers.get("content-type", "")
    if "text/html" not in content_type:
        raise _ScanError(f"URL returned content type '{content_type}', expected HTML.")

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

    return images
