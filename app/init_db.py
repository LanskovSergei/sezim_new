"""Создание схемы для локальной разработки (в проде — Alembic).

Запуск: python -m app.init_db
"""

import asyncio
import logging

from sqlalchemy import text

from app.db import engine
from app.models import Base

logger = logging.getLogger(__name__)


async def main() -> None:
    """Включает btree_gist и создаёт таблицы, индексы и ENUM-типы."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()
    logger.info("Схема создана")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
