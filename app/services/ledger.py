"""Внутренний баланс: журнал операций с блокировкой на пользователя."""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import InsufficientBalanceError
from app.models import LedgerEntry, LedgerKind

logger = logging.getLogger(__name__)


async def lock_balance(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Сериализует операции по балансу пользователя до конца транзакции.

    Args:
        session: Сессия БД.
        user_id: Пользователь.
    """
    await session.execute(select(func.pg_advisory_xact_lock(func.hashtextextended(str(user_id), 0))))


async def get_balance(session: AsyncSession, user_id: uuid.UUID) -> int:
    """Текущий баланс пользователя.

    Args:
        session: Сессия БД.
        user_id: Пользователь.

    Returns:
        int: Баланс в тенге.
    """
    total = await session.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount_kzt), 0)).where(LedgerEntry.user_id == user_id)
    )
    return int(total or 0)


async def credit(
    session: AsyncSession,
    user_id: uuid.UUID,
    amount_kzt: int,
    kind: LedgerKind,
    **refs: uuid.UUID | int | None,
) -> None:
    """Зачисляет средства на баланс.

    Args:
        session: Сессия БД.
        user_id: Пользователь.
        amount_kzt: Сумма (> 0).
        kind: Тип операции.
        **refs: Ссылки booking_id / certificate_id / payment_id.

    Raises:
        ValueError: Если сумма не положительная.
    """
    if amount_kzt <= 0:
        raise ValueError("Сумма зачисления должна быть положительной")
    session.add(LedgerEntry(user_id=user_id, amount_kzt=amount_kzt, kind=kind, **refs))
    logger.info("Баланс %s: +%d (%s)", user_id, amount_kzt, kind.value)


async def debit(
    session: AsyncSession,
    user_id: uuid.UUID,
    amount_kzt: int,
    kind: LedgerKind,
    **refs: uuid.UUID | int | None,
) -> None:
    """Списывает средства с проверкой остатка.

    Args:
        session: Сессия БД.
        user_id: Пользователь.
        amount_kzt: Сумма (> 0).
        kind: Тип операции.
        **refs: Ссылки booking_id / certificate_id / payment_id.

    Raises:
        ValueError: Если сумма не положительная.
        InsufficientBalanceError: Если средств недостаточно.
    """
    if amount_kzt <= 0:
        raise ValueError("Сумма списания должна быть положительной")
    await lock_balance(session, user_id)
    if await get_balance(session, user_id) < amount_kzt:
        raise InsufficientBalanceError("Недостаточно средств на балансе")
    session.add(LedgerEntry(user_id=user_id, amount_kzt=-amount_kzt, kind=kind, **refs))
    await session.flush()
    logger.info("Баланс %s: -%d (%s)", user_id, amount_kzt, kind.value)
