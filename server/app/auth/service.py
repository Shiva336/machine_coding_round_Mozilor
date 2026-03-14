"""
Service (business-logic) layer for the auth module.

This layer sits between the **router** (HTTP) and the **DAO** (SQL).
It owns:
  - Orchestration of password hashing, token generation, and DB writes.
  - All authorisation / validation rules that go beyond Pydantic schemas.
  - HTTP error semantics (raises ``HTTPException`` with appropriate codes).

It does **not** touch raw SQL – that is delegated entirely to the DAO.

Every public function receives a database ``connection`` as its first
argument (injected by the router via ``Depends(get_connection)``).
This keeps dependencies explicit and makes the service easy to unit-test
with a mock connection.
"""

from datetime import datetime, timezone

import asyncpg
from fastapi import HTTPException, status

from app.auth import dao
from app.auth.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


# Helpers 


async def _generate_and_store_tokens(
    conn: asyncpg.Connection,
    user_id: int,
) -> dict:
    """Create an access + refresh token pair, persist the refresh token,
    and return both tokens in a dict ready for the ``TokenResponse`` schema.
    """
    access_token = create_access_token(user_id)
    refresh_token, jti, expires_at = create_refresh_token(user_id)
    await dao.insert_refresh_token(conn, user_id, jti, expires_at)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# ── Public API ────────────────────────────────────────────────────────


async def register_user(conn: asyncpg.Connection, email: str, password: str) -> dict:
    """Register a new user and return an initial token pair.

    Raises:
        HTTPException 409: if the e-mail is already registered.
    """
    hashed = hash_password(password)

    try:
        user = await dao.insert_user(conn, email, hashed)
    except asyncpg.UniqueViolationError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    tokens = await _generate_and_store_tokens(conn, user["id"])
    return {"user": user, "tokens": tokens}


async def login_user(conn: asyncpg.Connection, email: str, password: str) -> dict:
    """Authenticate by e-mail + password and return a token pair.

    Raises:
        HTTPException 401: on invalid credentials (deliberately vague to
        prevent user-enumeration attacks).
    """
    user = await dao.find_user_by_email(conn, email)

    if user is None or not verify_password(password, user["password_hashed"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    tokens = await _generate_and_store_tokens(conn, user["id"])
    # Strip the hashed password before returning the user object.
    user_safe = {k: v for k, v in user.items() if k != "password_hashed"}
    return {"user": user_safe, "tokens": tokens}


async def refresh_access_token(
    conn: asyncpg.Connection, refresh_token_str: str
) -> dict:
    """Validate and rotate a refresh token, issuing a new token pair.

    Implements **refresh-token rotation**: every refresh token is
    single-use.  Using it produces a fresh pair and revokes the old one.

    Raises:
        HTTPException 401: if the token is expired, invalid, revoked, or
        not of the ``refresh`` type.
    """
    # 1. Decode the JWT (checks signature + expiry).
    try:
        payload = decode_token(refresh_token_str)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    # 2. Ensure this is actually a refresh token.
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    jti: str = payload["jti"]
    user_id = int(payload["sub"])

    # 3. Check that the token exists in the DB and hasn't been revoked.
    token_row = await dao.find_refresh_token(conn, jti)
    if token_row is None:
        # Possible token reuse – revoke all tokens for this user as a
        # precaution (refresh-token reuse detection).
        await dao.revoke_all_user_refresh_tokens(conn, user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked.",
        )

    # 4. Check DB-level expiry (belt-and-suspenders with JWT exp).
    if token_row["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(
        timezone.utc
    ):
        await dao.revoke_refresh_token(conn, jti)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired.",
        )

    # 5. Revoke old token and issue a new pair.
    await dao.revoke_refresh_token(conn, jti)
    return await _generate_and_store_tokens(conn, user_id)


async def logout_user(conn: asyncpg.Connection, refresh_token_str: str) -> None:
    """Revoke the supplied refresh token.

    This endpoint is lenient: if the token is already revoked or invalid
    the call still succeeds (idempotent).  This avoids leaking token state
    to callers.
    """
    try:
        payload = decode_token(refresh_token_str)
    except Exception:
        # Token is garbage or expired – nothing to revoke.
        return

    jti: str | None = payload.get("jti")
    if jti:
        await dao.revoke_refresh_token(conn, jti)


async def get_current_user_profile(conn: asyncpg.Connection, user_id: int) -> dict:
    """Return the public profile of the user identified by *user_id*.

    Raises:
        HTTPException 401: if the user no longer exists (e.g. deleted
        after the token was issued).
    """
    user = await dao.find_user_by_id(conn, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return user
