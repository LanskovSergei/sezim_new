"""Короткоживущий кэш в Redis с безопасным откатом на прямой расчёт."""

import asyncio
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings

logger = logging.getLogger(__name__)

_redis: Redis | None = None


def get_redis() -> Redis:
    """Ленивое подключение к Redis.

    Returns:
        Redis: Асинхронный клиент.
    """
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, socket_timeout=0.2, socket_connect_timeout=0.2)
    return _redis


def make_key(prefix: str, payload: Any) -> str:
    """Стабильный ключ кэша по JSON-представлению параметров.

    Args:
        prefix: Пространство имён.
        payload: Параметры запроса.

    Returns:
        str: Ключ вида prefix:sha1.
    """
    raw = json.dumps(payload, sort_keys=True, default=str)
    return f"{prefix}:{hashlib.sha1(raw.encode()).hexdigest()}"  # noqa: S324 — не криптография


LOCK_TTL_SECONDS = 10
WAIT_STEP_SECONDS = 0.05


async def cached_json(key: str, ttl: int, compute: Callable[[], Awaitable[Any]]) -> Any:
    """Возвращает JSON из кэша или вычисляет его ровно один раз (single-flight).

    Пока один процесс считает значение, остальные ждут его в кэше, а не
    нагружают базу тем же тяжёлым запросом. Недоступность Redis не ломает
    запрос: значение считается напрямую.

    Args:
        key: Ключ кэша.
        ttl: Время жизни, секунды.
        compute: Корутина, возвращающая JSON-сериализуемое значение.

    Returns:
        Any: Значение.
    """
    redis = get_redis()
    lock_key = f"{key}:lock"
    try:
        for _ in range(int(LOCK_TTL_SECONDS / WAIT_STEP_SECONDS)):
            hit = await redis.get(key)
            if hit is not None:
                return json.loads(hit)
            if await redis.set(lock_key, "1", nx=True, ex=LOCK_TTL_SECONDS):
                break
            await asyncio.sleep(WAIT_STEP_SECONDS)
    except RedisError:
        logger.warning("Redis недоступен, считаем без кэша")
        return await compute()

    try:
        value = await compute()
        await redis.set(key, json.dumps(value, default=str), ex=ttl)
        return value
    except RedisError:
        logger.warning("Не удалось записать в кэш %s", key)
        return value
    finally:
        try:
            await redis.delete(lock_key)
        except RedisError:
            logger.warning("Не удалось снять блокировку %s", lock_key)
