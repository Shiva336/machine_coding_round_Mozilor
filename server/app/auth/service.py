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

import logging
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

logger = logging.getLogger(__name__)


# Helpers


async def _generate_and_store_tokens(
    conn: asyncpg.Connection,
    user_id: int,
) -> dict:
    """Create an access + refresh token pair, persist the refresh token,
    and return both tokens in a dict consumed by the router to set cookies.
    """
    access_token = create_access_token(user_id)
    refresh_token, jti, expires_at = create_refresh_token(user_id)
    await dao.insert_refresh_token(conn, user_id, jti, expires_at)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


# Public API


async def register_user(conn: asyncpg.Connection, email: str, password: str) -> dict:
    """Register a new user and return an initial token pair.

    Raises:
        HTTPException 409: if the e-mail is already registered.
    """
    hashed = hash_password(password)

    try:
        user = await dao.insert_user(conn, email, hashed)
    except asyncpg.UniqueViolationError:
        logger.warning("Registration attempt for already-registered email: %s", email)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists.",
        )

    logger.info("New user registered: user_id=%d email=%s", user["id"], email)
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
        # Log at WARNING — failed logins are worth monitoring for brute-force
        # attempts without leaking which part failed (user not found vs bad pw).
        logger.warning("Failed login attempt for email: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    logger.info("User logged in: user_id=%d email=%s", user["id"], email)
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
        logger.warning("Invalid or expired refresh token submitted.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    # 2. Ensure this is actually a refresh token.
    if payload.get("type") != "refresh":
        logger.warning(
            "Wrong token type '%s' presented as refresh token.", payload.get("type")
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    jti: str = payload["jti"]
    user_id = int(payload["sub"])

    # 3. Check that the token exists in the DB and hasn't been revoked.
    token_row = await dao.find_refresh_token(conn, jti)
    if token_row is None:
        # The JTI was not found — this token was already consumed or
        # never existed.  This is a refresh-token reuse attack: revoke
        # ALL sessions for the user immediately as a precaution.
        logger.critical(
            "SECURITY — TOKEN REUSE DETECTED: user_id=%d jti=%s "
            "All refresh tokens for this user have been revoked.",
            user_id,
            jti,
        )
        await dao.revoke_all_user_refresh_tokens(conn, user_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked.",
        )

    # 4. Check DB-level expiry (belt-and-suspenders with JWT exp).
    if token_row["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(
        timezone.utc
    ):
        logger.warning("Expired refresh token used: user_id=%d jti=%s", user_id, jti)
        await dao.revoke_refresh_token(conn, jti)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has expired.",
        )

    # 5. Revoke old token and issue a new pair.
    await dao.revoke_refresh_token(conn, jti)
    logger.info("Token rotated: user_id=%d", user_id)
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
        # Token is garbage or expired — nothing to revoke, still a clean logout.
        logger.debug(
            "Logout with unparseable/expired refresh token — nothing to revoke."
        )
        return

    jti: str | None = payload.get("jti")
    user_id: int | None = int(payload["sub"]) if payload.get("sub") else None

    if jti:
        await dao.revoke_refresh_token(conn, jti)
        logger.info("User logged out: user_id=%s jti=%s", user_id, jti)
    else:
        logger.debug("Logout token had no jti claim — nothing to revoke.")


async def get_current_user_profile(conn: asyncpg.Connection, user_id: int) -> dict:
    """Return the public profile of the user identified by *user_id*.

    Raises:
        HTTPException 401: if the user no longer exists (e.g. deleted
        after the token was issued).
    """
    user = await dao.find_user_by_id(conn, user_id)
    if user is None:
        logger.warning(
            "Profile requested for non-existent user_id=%d (deleted after token issued?)",
            user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    return user
