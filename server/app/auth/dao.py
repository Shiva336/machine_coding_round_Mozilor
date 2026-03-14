"""
Data-Access Object layer for the auth module.

Every function in this module:
  - Accepts an ``asyncpg.Connection`` as its first argument.
  - Executes a **raw, parameterised** SQL query (``$1``, ``$2`` …).
  - Returns plain ``dict`` objects (or ``None``) – no business logic.
  - Never raises HTTP exceptions – that responsibility belongs to the
    service layer.
"""

from datetime import datetime

import asyncpg


# Users 


async def insert_user(
    conn: asyncpg.Connection,
    email: str,
    hashed_password: str,
) -> dict:
    """Insert a new user and return their record.

    Raises ``asyncpg.UniqueViolationError`` if *email* already exists –
    the service layer is expected to handle that.
    """
    query = """
        INSERT INTO users (email, password_hashed)
        VALUES ($1, $2)
        RETURNING id, email, created_at
    """
    row = await conn.fetchrow(query, email, hashed_password)
    return dict(row)


async def find_user_by_email(conn: asyncpg.Connection, email: str) -> dict | None:
    """Return the full user record (including hashed password) or ``None``."""
    query = """
        SELECT id, email, password_hashed, created_at
        FROM users
        WHERE email = $1
    """
    row = await conn.fetchrow(query, email)
    return dict(row) if row else None


async def find_user_by_id(conn: asyncpg.Connection, user_id: int) -> dict | None:
    """Return a user record *without* the password hash, or ``None``."""
    query = """
        SELECT id, email, created_at
        FROM users
        WHERE id = $1
    """
    row = await conn.fetchrow(query, user_id)
    return dict(row) if row else None


# Refresh tokens


async def insert_refresh_token(
    conn: asyncpg.Connection,
    user_id: int,
    token_jti: str,
    expires_at: datetime,
) -> None:
    """Persist a refresh-token's ``jti`` so it can later be validated or
    revoked."""
    query = """
        INSERT INTO refresh_tokens (user_id, token_jti, expires_at)
        VALUES ($1, $2, $3)
    """
    await conn.execute(query, user_id, token_jti, expires_at)


async def find_refresh_token(
    conn: asyncpg.Connection,
    token_jti: str,
) -> dict | None:
    """Return the refresh-token row if it exists and has **not** been
    revoked, otherwise ``None``."""
    query = """
        SELECT id, user_id, token_jti, expires_at, revoked, created_at
        FROM refresh_tokens
        WHERE token_jti = $1 AND revoked = FALSE
    """
    row = await conn.fetchrow(query, token_jti)
    return dict(row) if row else None


async def revoke_refresh_token(conn: asyncpg.Connection, token_jti: str) -> None:
    """Mark a single refresh token as revoked."""
    query = """
        UPDATE refresh_tokens
        SET revoked = TRUE
        WHERE token_jti = $1
    """
    await conn.execute(query, token_jti)


async def revoke_all_user_refresh_tokens(
    conn: asyncpg.Connection,
    user_id: int,
) -> None:
    """Revoke every active refresh token belonging to *user_id*.

    Useful for a "log-out everywhere" feature.
    """
    query = """
        UPDATE refresh_tokens
        SET revoked = TRUE
        WHERE user_id = $1 AND revoked = FALSE
    """
    await conn.execute(query, user_id)
