"""
FastAPI dependencies for the auth module.

``get_current_user`` is the single dependency that protected routes
should declare.  It:

  1. Extracts the ``Authorization: Bearer <token>`` header.
  2. Decodes and validates the JWT (signature, expiry, type).
  3. Loads the corresponding user from the database.
  4. Returns the user ``dict`` – or raises a 401 if anything is wrong.
"""

import asyncpg
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import dao
from app.auth.security import decode_token
from app.db import get_pool

_bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict:
    """Dependency that resolves the authenticated user from the JWT.

    Raises:
        HTTPException 401: if the token is missing, expired, invalid, or
        does not correspond to an existing user.
    """
    token = credentials.credentials

    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    user = await dao.find_user_by_id(pool, user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user
