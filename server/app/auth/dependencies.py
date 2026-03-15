"""
FastAPI dependencies for the auth module.

``get_current_user`` is the single dependency that protected routes
should declare.  It:

  1. Reads the ``access_token`` HttpOnly cookie from the request.
  2. Decodes and validates the JWT (signature, expiry, type).
  3. Loads the corresponding user from the database.
  4. Returns the user ``dict`` – or raises a 401 if anything is wrong.

Tokens are no longer carried in the ``Authorization`` header; they live
exclusively in HttpOnly cookies that JavaScript cannot read, eliminating
the XSS token-theft vector.
"""

import asyncpg
import jwt
from fastapi import Depends, HTTPException, Request, status

from app.auth import dao
from app.auth.security import decode_token
from app.db import get_connection


async def get_current_user(
    request: Request,
    conn: asyncpg.Connection = Depends(get_connection),
) -> dict:
    """Dependency that resolves the authenticated user from the JWT cookie.

    Raises:
        HTTPException 401: if the cookie is missing, the token is expired
        or invalid, or the user no longer exists in the database.
    """
    token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
        )

    user_id = int(payload["sub"])
    user = await dao.find_user_by_id(conn, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    return user
