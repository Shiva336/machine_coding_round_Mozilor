"""
Pydantic request / response schemas for the scan module.

These models handle validation of incoming scan requests and
serialisation of scan results returned to the client.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, HttpUrl


# Requests 


class ScanRequest(BaseModel):
    url: HttpUrl


# Responses 


class ImageDetail(BaseModel):
    """A single image extracted from a scanned page."""

    id: int
    src: str
    alt: str | None
    has_alt: bool

    model_config = {"from_attributes": True}


class ScanSummaryResponse(BaseModel):
    """Scan metadata without individual image details.

    Used in list endpoints and as the immediate response from POST
    (while the scan is still ``pending``).
    """

    id: int
    url: str
    status: str
    total_images: int
    images_with_alt: int
    images_without_alt: int
    error_message: str | None
    scanned_at: datetime

    model_config = {"from_attributes": True}


class ScanResponse(ScanSummaryResponse):
    """Full scan result including individual image details.

    Returned by the detail endpoint once the scan is ``completed``.
    The ``images`` list is empty while the scan is ``pending`` or
    ``failed``.
    """

    images: list[ImageDetail] = []


class ScanHistoryResponse(BaseModel):
    """Paginated list of scan summaries for the current user."""

    scans: list[ScanSummaryResponse]
    total: int
