"""
Centralised logging configuration for the application.

Call ``setup_logging()`` once at startup (in ``main.py``) before any
other module creates a logger.  After that, every module obtains its
logger the standard way:

    import logging
    logger = logging.getLogger(__name__)

Or use the convenience helper:

    from app.logging_config import get_logger
    logger = get_logger(__name__)

Log format (human-readable, suited to local development and Docker logs):

    [2026-03-16 10:00:00,123] INFO  [app.auth.service:98] User logged in: user@example.com

Set the LOG_LEVEL environment variable to change verbosity at runtime:
    LOG_LEVEL=DEBUG   — verbose, shows all debug output
    LOG_LEVEL=INFO    — (default) normal operational messages
    LOG_LEVEL=WARNING — only warnings and errors
"""

import logging
import os
import sys


def setup_logging() -> None:
    """Configure the root logger and suppress noisy third-party loggers.

    Must be called once at application startup, before any logger is used.
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    formatter = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)-8s [%(name)s:%(lineno)d] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    # Avoid adding duplicate handlers if setup_logging() is called more
    # than once (e.g. during testing).
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(level)

    # Suppress uvicorn's built-in access log — we replace it with our
    # RequestLoggingMiddleware so every request is logged in one place
    # alongside the application logs.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    # Keep uvicorn's error log at INFO so startup/shutdown messages appear.
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

    # Reduce noise from third-party libraries.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    logging.getLogger(__name__).info("Logging configured: level=%s", level_name)


def get_logger(name: str) -> logging.Logger:
    """Convenience wrapper around ``logging.getLogger``.

    Prefer standard ``logging.getLogger(__name__)`` when you want to be
    explicit; use this helper when you want a single import.
    """
    return logging.getLogger(name)
