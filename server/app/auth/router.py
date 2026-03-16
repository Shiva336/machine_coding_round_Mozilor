"""
Auth router – thin HTTP layer.

Each endpoint:
  - Deserialises the request body via Pydantic schemas.
  - Receives a database connection via ``Depends(get_connection)`` where needed.
  - Delegates **all** business logic to ``service.py``.
  - Sets / clears HttpOnly cookies instead of returning tokens in the body.

No SQL, no password hashing, no token logic lives here.

Cookie strategy
---------------
``access_token``
  - Path: ``/``  (sent with every request)
  - Max-Age: matches ``access_token_expire_minutes``
  - HttpOnly, Secure (prod), SameSite=Lax

``refresh_token``
  - Path: ``/api/auth``  (only sent to auth endpoints – defence in depth)
  - Max-Age: matches ``refresh_token_expire_days``
  - HttpOnly, Secure (prod), SameSite=Lax
"""

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.auth import service
from app.auth.dependencies import get_current_user
from app.auth.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.config import settings
from app.db import get_connection

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Helpers

_ACCESS_MAX_AGE = settings.access_token_expire_minutes * 60
_REFRESH_MAX_AGE = settings.refresh_token_expire_days * 24 * 60 * 60


def _set_auth_cookies(
    response: Response, access_token: str, refresh_token: str
) -> None:
    """Attach both token cookies to *response*."""
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=_ACCESS_MAX_AGE,
        path="/",
        httponly=settings.cookie_httponly,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=_REFRESH_MAX_AGE,
        # Restrict to auth endpoints only – the browser won't send this
        # cookie to /api/scans or any other route.
        path="/api/auth",
        httponly=settings.cookie_httponly,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire both token cookies on *response*.

    The attributes (httponly, secure, samesite) must match the original
    Set-Cookie headers exactly.  Without them, some browsers (especially on
    HTTPS with the Secure flag) will not honour the Max-Age=0 expiry and the
    cookies will persist until they naturally expire.
    """
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=settings.cookie_httponly,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )
    response.delete_cookie(
        key="refresh_token",
        path="/api/auth",
        httponly=settings.cookie_httponly,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


# Endpoints


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    body: RegisterRequest,
    response: Response,
    conn: asyncpg.Connection = Depends(get_connection),
):
    result = await service.register_user(conn, body.email, body.password)
    _set_auth_cookies(
        response, result["tokens"]["access_token"], result["tokens"]["refresh_token"]
    )
    return {"user": result["user"]}


@router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
)
async def login(
    body: LoginRequest,
    response: Response,
    conn: asyncpg.Connection = Depends(get_connection),
):
    result = await service.login_user(conn, body.email, body.password)
    _set_auth_cookies(
        response, result["tokens"]["access_token"], result["tokens"]["refresh_token"]
    )
    return {"user": result["user"]}


@router.post(
    "/refresh",
    response_model=MessageResponse,
    summary="Rotate refresh token and get a new token pair",
)
async def refresh(
    request: Request,
    response: Response,
    conn: asyncpg.Connection = Depends(get_connection),
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing.",
        )
    tokens = await service.refresh_access_token(conn, refresh_token)
    _set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return {"detail": "Token refreshed."}


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke the refresh token and clear auth cookies",
)
async def logout(
    request: Request,
    response: Response,
    _user: dict = Depends(get_current_user),
    conn: asyncpg.Connection = Depends(get_connection),
):
    refresh_token = request.cookies.get("refresh_token")
    if refresh_token:
        await service.logout_user(conn, refresh_token)
    _clear_auth_cookies(response)
    return {"detail": "Successfully logged out."}


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the current authenticated user",
)
async def me(user: dict = Depends(get_current_user)):
    """Return the authenticated user's profile.

    The user dict is already fetched from the database by the
    ``get_current_user`` dependency — no second query needed.
    """
    return user
