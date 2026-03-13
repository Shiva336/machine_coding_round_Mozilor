import os
from pathlib import Path

import asyncpg

_pool: asyncpg.Pool | None = None


async def get_pool() -> asyncpg.Pool:
    """Return the existing connection pool. Raises if not initialised."""
    if _pool is None:
        raise RuntimeError("Database pool is not initialised. Call init_db() first.")
    return _pool


def _dsn() -> str:
    user = os.getenv("POSTGRES_USER", "mozilor")
    password = os.getenv("POSTGRES_PASSWORD", "mozilor_secret")
    host = os.getenv("POSTGRES_HOST", "db")
    port = os.getenv("POSTGRES_PORT", "5432")
    db = os.getenv("POSTGRES_DB", "mozilor_db")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


async def init_db() -> None:
    """Create the connection pool and run schema.sql to ensure tables exist."""
    global _pool
    _pool = await asyncpg.create_pool(dsn=_dsn(), min_size=5, max_size=20)

    schema_path = Path(__file__).parent / "schema.sql"
    schema_sql = schema_path.read_text()

    async with _pool.acquire() as conn:
        await conn.execute(schema_sql)


async def close_db() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
