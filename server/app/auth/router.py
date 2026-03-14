"""
Auth router – thin HTTP layer.

Each endpoint:
  - Deserialises the request body via Pydantic schemas.
  - Receives the database pool via ``Depends(get_pool)``.
  - Delegates **all** business logic to ``service.py``.
  - Returns a Pydantic response model.

No SQL, no password hashing, no token logic lives here.
"""

import asyncpg
from fastapi import APIRouter, Depends, status

from app.auth import service
from app.auth.dependencies import get_current_user
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.db import get_pool

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
async def register(
    body: RegisterRequest,
    pool: asyncpg.Pool = Depends(get_pool),
):
    result = await service.register_user(pool, body.email, body.password)
    return result["tokens"]


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
)
async def login(
    body: LoginRequest,
    pool: asyncpg.Pool = Depends(get_pool),
):
    result = await service.login_user(pool, body.email, body.password)
    return result["tokens"]


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate refresh token and get a new token pair",
)
async def refresh(
    body: RefreshRequest,
    pool: asyncpg.Pool = Depends(get_pool),
):
    tokens = await service.refresh_access_token(pool, body.refresh_token)
    return tokens


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke a refresh token",
)
async def logout(
    body: LogoutRequest,
    _user: dict = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
):
    await service.logout_user(pool, body.refresh_token)
    return {"detail": "Successfully logged out."}


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get the current authenticated user",
)
async def me(
    user: dict = Depends(get_current_user),
    pool: asyncpg.Pool = Depends(get_pool),
):
    return await service.get_current_user_profile(pool, user["id"])
