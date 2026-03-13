from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db, close_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialise the database pool and create tables
    await init_db()
    yield
    # Shutdown: close the database pool
    await close_db()


app = FastAPI(
    title="Mozilor Image Alt Checker",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
