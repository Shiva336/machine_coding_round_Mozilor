"""
Data-Access Object layer for the scan module.

Every function in this module:
  - Accepts an ``asyncpg.Connection`` as its first argument.
  - Executes a **raw, parameterised** SQL query (``$1``, ``$2`` …).
  - Returns plain ``dict`` / ``list[dict]`` / ``int`` / ``None`` –
    no business logic, no HTTP exceptions.
"""

from __future__ import annotations

from typing import Any

import asyncpg


# Scans


async def insert_scan(
    conn: asyncpg.Connection,
    user_id: int,
    url: str,
    total_images: int,
    images_with_alt: int,
    images_without_alt: int,
) -> dict:
    """Insert a new scan record and return the created row."""
    query = """
        INSERT INTO scans (user_id, url, total_images, images_with_alt, images_without_alt)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, url, total_images, images_with_alt,
                  images_without_alt, scanned_at
    """
    row = await conn.fetchrow(
        query, user_id, url, total_images, images_with_alt, images_without_alt
    )
    return dict(row)


async def get_scans_by_user(
    conn: asyncpg.Connection,
    user_id: int,
    limit: int = 20,
    offset: int = 0,
) -> list[dict]:
    """Return a page of scans for *user_id*, newest first."""
    query = """
        SELECT id, user_id, url, total_images, images_with_alt,
               images_without_alt, scanned_at
        FROM scans
        WHERE user_id = $1
        ORDER BY scanned_at DESC
        LIMIT $2 OFFSET $3
    """
    rows = await conn.fetch(query, user_id, limit, offset)
    return [dict(r) for r in rows]


async def get_scan_count_by_user(conn: asyncpg.Connection, user_id: int) -> int:
    """Return the total number of scans belonging to *user_id*.

    Useful for pagination metadata on the frontend.
    """
    query = """
        SELECT COUNT(*) AS cnt
        FROM scans
        WHERE user_id = $1
    """
    row = await conn.fetchrow(query, user_id)
    return row["cnt"]


async def get_scan_by_id(
    conn: asyncpg.Connection,
    scan_id: int,
) -> dict | None:
    """Return a single scan row, or ``None`` if it does not exist."""
    query = """
        SELECT id, user_id, url, total_images, images_with_alt,
               images_without_alt, scanned_at
        FROM scans
        WHERE id = $1
    """
    row = await conn.fetchrow(query, scan_id)
    return dict(row) if row else None


# Scan images 


async def insert_scan_images(
    conn: asyncpg.Connection,
    scan_id: int,
    images: list[dict[str, Any]],
) -> None:
    """Batch-insert image detail rows for a given scan.

    Each dict in *images* must contain the keys ``src``, ``alt``, and
    ``has_alt``.  Uses ``executemany`` for efficient parameterised
    batch insertion.
    """
    if not images:
        return

    query = """
        INSERT INTO scan_images (scan_id, src, alt, has_alt)
        VALUES ($1, $2, $3, $4)
    """
    args = [(scan_id, img["src"], img["alt"], img["has_alt"]) for img in images]
    await conn.executemany(query, args)


async def get_scan_images(
    conn: asyncpg.Connection,
    scan_id: int,
) -> list[dict]:
    """Return all image detail rows belonging to *scan_id*."""
    query = """
        SELECT id, scan_id, src, alt, has_alt
        FROM scan_images
        WHERE scan_id = $1
        ORDER BY id
    """
    rows = await conn.fetch(query, scan_id)
    return [dict(r) for r in rows]
