"""
Scan router – thin HTTP layer.

Each endpoint:
  - Deserialises the request body via Pydantic schemas.
  - Receives a database connection via ``Depends(get_connection)``.
  - Delegates **all** business logic to ``service.py``.
  - Returns a Pydantic response model.

No SQL, no scraping logic, no HTML parsing lives here.
"""

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.auth.dependencies import get_current_user
from app.auth.schemas import MessageResponse
from app.db import get_connection, get_pool
from app.scan import service
from app.scan.schemas import (
    ScanHistoryResponse,
    ScanRequest,
    ScanResponse,
    ScanSummaryResponse,
)

router = APIRouter(prefix="/api/scans", tags=["Scans"])


@router.post(
    "",
    response_model=ScanSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a URL for accessibility scanning",
)
async def create_scan(
    body: ScanRequest,
    background_tasks: BackgroundTasks,
    conn: asyncpg.Connection = Depends(get_connection),
    pool: asyncpg.Pool = Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    scan = await service.create_pending_scan(conn, str(body.url), user["id"])
    background_tasks.add_task(service.process_scan, pool, scan["id"], str(body.url))
    return scan


@router.get(
    "",
    response_model=ScanHistoryResponse,
    summary="List the authenticated user's scan history",
)
async def list_scans(
    conn: asyncpg.Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await service.get_user_scans(conn, user["id"], limit, offset)


@router.get(
    "/{scan_id}",
    response_model=ScanResponse,
    summary="Get full scan results including image details",
)
async def get_scan(
    scan_id: int,
    conn: asyncpg.Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    return await service.get_scan_detail(conn, scan_id, user["id"])


@router.delete(
    "/{scan_id}",
    response_model=MessageResponse,
    summary="Delete a scan and its image records",
)
async def delete_scan(
    scan_id: int,
    conn: asyncpg.Connection = Depends(get_connection),
    user: dict = Depends(get_current_user),
):
    await service.delete_user_scan(conn, scan_id, user["id"])
    return {"detail": "Scan deleted."}
