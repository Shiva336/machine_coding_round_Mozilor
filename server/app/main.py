import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.db import close_db, init_db
from app.logging_config import setup_logging
from app.middleware import RequestLoggingMiddleware
from app.scan.router import router as scan_router

# Initialise logging before anything else so the first log messages from
# modules imported below are captured with the correct format.
setup_logging()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Application starting up...")
    await init_db()
    logger.info("Database pool initialised and schema applied.")
    yield
    logger.info("Application shutting down...")
    await close_db()
    logger.info("Database pool closed.")


app = FastAPI(
    title="Mozilor Image Alt Checker",
    version="0.1.0",
    lifespan=lifespan,
)

# RequestLoggingMiddleware must be added before CORSMiddleware so every
# request — including pre-flight OPTIONS — is timed and logged.
app.add_middleware(RequestLoggingMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(scan_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
