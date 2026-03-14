from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth.router import router as auth_router
from app.db import close_db, init_db


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


@app.get("/health")
async def health_check():
    return {"status": "ok"}
