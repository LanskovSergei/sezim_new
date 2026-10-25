"""Асинхронное подключение к PostgreSQL."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings

engine = create_async_engine(get_settings().database_url, pool_size=20, max_overflow=10, pool_pre_ping=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI-зависимость: сессия БД на время запроса.

    Незакоммиченные изменения откатываются при закрытии сессии.

    Yields:
        AsyncSession: Сессия SQLAlchemy.
    """
    async with SessionFactory() as session:
        yield session
