"""
HTTP request logging middleware.

Logs every incoming request and its response in JSON format so they are
easy to parse by log aggregators (ELK, Datadog, CloudWatch, etc.) while
the application logs remain human-readable.

Example output (one line per request/response):

    {"event": "request", "method": "POST", "path": "/api/auth/login",
     "request_id": "a1b2c3d4", "client": "172.18.0.1"}

    {"event": "response", "method": "POST", "path": "/api/auth/login",
     "status": 200, "duration_ms": 212, "request_id": "a1b2c3d4"}

The ``request_id`` is a short (8-char) UUID hex prefix.  It is also
attached to ``request.state.request_id`` so that route handlers and
service functions can include it in their own log messages if needed.

Health-check endpoint (/health) is logged at DEBUG level to avoid
cluttering logs during container health checks.
"""

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Paths to log at DEBUG instead of INFO (reduces noise from health checks).
_QUIET_PATHS = frozenset({"/health"})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs each HTTP request and response with timing and a request ID."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Generate a short, unique ID for this request so log lines from
        # the same request can be correlated even in concurrent traffic.
        request_id = uuid.uuid4().hex[:8]
        request.state.request_id = request_id

        path = request.url.path
        method = request.method
        client = request.client.host if request.client else "unknown"
        log_level = logging.DEBUG if path in _QUIET_PATHS else logging.INFO

        # Incoming request
        logger.log(
            log_level,
            json.dumps(
                {
                    "event": "request",
                    "method": method,
                    "path": path,
                    "request_id": request_id,
                    "client": client,
                }
            ),
        )

        start = time.perf_counter()

        try:
            response: Response = await call_next(request)
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000)
            logger.error(
                json.dumps(
                    {
                        "event": "request_error",
                        "method": method,
                        "path": path,
                        "request_id": request_id,
                        "duration_ms": duration_ms,
                        "error": str(exc),
                    }
                ),
            )
            raise

        duration_ms = round((time.perf_counter() - start) * 1000)

        # Choose log level based on HTTP status code.
        if response.status_code >= 500:
            resp_level = logging.ERROR
        elif response.status_code >= 400:
            resp_level = logging.WARNING
        else:
            resp_level = log_level  # INFO or DEBUG (quiet paths)

        # Outgoing response
        logger.log(
            resp_level,
            json.dumps(
                {
                    "event": "response",
                    "method": method,
                    "path": path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                }
            ),
        )

        return response
