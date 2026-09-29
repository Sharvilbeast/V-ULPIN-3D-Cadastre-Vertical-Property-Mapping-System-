"""Optional async PostGIS connection; the demo runs without a GIS server."""

from __future__ import annotations

import os
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "")
engine = create_async_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionFactory = async_sessionmaker(engine, expire_on_commit=False) if engine else None


async def get_session() -> AsyncGenerator[Optional[AsyncSession], None]:
    if SessionFactory is None:
        yield None
        return
    async with SessionFactory() as session:
        yield session


async def initialize_postgis() -> None:
    if engine is None:
        return
    from .models import Base

    async with engine.begin() as connection:
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        await connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis_sfcgal"))
        await connection.run_sync(Base.metadata.create_all)


async def close_database() -> None:
    if engine is not None:
        await engine.dispose()