"""Жизненный цикл записи: холд → оплата → подтверждение → отмена/перенос.

От пересечений защищает exclusion constraint ex_booking_overlap:
две активные записи одного психолога физически не могут пересечься.
Возвраты по отменам зачисляются на внутренний баланс.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, func, select, update
from sqlalchemy.dialects.postgresql import Range
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.errors import InsufficientBalanceError, NotFoundError, PolicyViolationError, SlotUnavailableError
from app.models import (
    Booking,
    BookingStatus,
    LedgerEntry,
    LedgerKind,
    Payment,
    PaymentPurpose,
    Psychologist,
    SessionFormat,
)
from app.payments import get_gateway
from app.schemas import CheckoutIn, CheckoutOut
from app.services import ledger
from app.services.availability import format_spec, is_start_available, utcnow

logger = logging.getLogger(__name__)

EXCLUSION_VIOLATION = "23P01"
NO_SYNC: dict[str, Any] = {"synchronize_session": False}


@dataclass(frozen=True, slots=True)
class CancellationPolicy:
    """Условия отмены, зафиксированные в заказе.

    Attributes:
        free_hours: За сколько часов отмена/перенос бесплатны.
        late_refund_percent: Процент возврата при поздней отмене.
    """

    free_hours: int
    late_refund_percent: int


POLICIES: dict[str, CancellationPolicy] = {
    "v2_24h": CancellationPolicy(free_hours=24, late_refund_percent=0),
    "legacy_12h": CancellationPolicy(free_hours=12, late_refund_percent=0),
}
CURRENT_POLICY = "v2_24h"


def get_policy(version: str) -> CancellationPolicy:
    """Правила по версии из заказа.

    Args:
        version: Версия условий.

    Returns:
        CancellationPolicy: Правила.

    Raises:
        PolicyViolationError: Если версия неизвестна.
    """
    try:
        return POLICIES[version]
    except KeyError as exc:
        raise PolicyViolationError(f"Неизвестная версия условий: {version}") from exc


def is_overlap_error(exc: IntegrityError) -> bool:
    """Проверяет, что ошибка — нарушение exclusion constraint.

    Args:
        exc: Ошибка целостности.

    Returns:
        bool: True для пересечения записей.
    """
    return getattr(exc.orig, "sqlstate", None) == EXCLUSION_VIOLATION


def _hours_left(booking: Booking, now: datetime) -> float:
    """Часы до начала сессии."""
    return (booking.starts_at - now).total_seconds() / 3600


async def _expire_holds(session: AsyncSession, *conditions: ColumnElement[bool]) -> int:
    """Переводит холды в EXPIRED и возвращает оплаченное балансом.

    Args:
        session: Сессия БД.
        *conditions: Дополнительные условия отбора холдов.

    Returns:
        int: Количество истёкших холдов.
    """
    rows = (
        await session.execute(
            update(Booking)
            .where(Booking.status == BookingStatus.HELD, *conditions)
            .values(status=BookingStatus.EXPIRED, balance_paid_kzt=0)
            .returning(Booking.id, Booking.client_id)
            .execution_options(**NO_SYNC)
        )
    ).all()
    for booking_id, client_id in rows:
        paid = await _balance_paid_for(session, booking_id)
        if paid:
            await ledger.credit(session, client_id, paid, LedgerKind.HOLD_RELEASE, booking_id=booking_id)
    return len(rows)


async def _balance_paid_for(session: AsyncSession, booking_id: uuid.UUID) -> int:
    """Нетто списаний с баланса по записи (без учёта возвратов отмены).

    Args:
        session: Сессия БД.
        booking_id: Запись.

    Returns:
        int: Сумма, списанная и ещё не возвращённая.
    """
    net = await session.scalar(
        select(func.coalesce(func.sum(LedgerEntry.amount_kzt), 0)).where(
            LedgerEntry.booking_id == booking_id,
            LedgerEntry.kind.in_((LedgerKind.BOOKING_DEBIT, LedgerKind.HOLD_RELEASE)),
        )
    )
    return max(0, -int(net or 0))


async def _lock_booking(session: AsyncSession, booking_id: uuid.UUID) -> Booking:
    """SELECT ... FOR UPDATE по записи.

    Args:
        session: Сессия БД.
        booking_id: Запись.

    Returns:
        Booking: Заблокированная запись.

    Raises:
        NotFoundError: Если запись не найдена.
    """
    booking = await session.scalar(
        select(Booking)
        .where(Booking.id == booking_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if booking is None:
        raise NotFoundError("Запись не найдена")
    return booking


async def _lock_own_booking(session: AsyncSession, booking_id: uuid.UUID, client_id: uuid.UUID) -> Booking:
    """Блокирует запись и проверяет владельца.

    Raises:
        NotFoundError: Если запись чужая или не найдена.
    """
    booking = await _lock_booking(session, booking_id)
    if booking.client_id != client_id:
        raise NotFoundError("Запись не найдена")
    return booking


def _period(starts_at: datetime, session_format: SessionFormat) -> tuple[Range[datetime], datetime]:
    """Занятый интервал и конец сессии.

    Args:
        starts_at: Старт.
        session_format: Формат.

    Returns:
        tuple[Range[datetime], datetime]: (период занятости, конец сессии).
    """
    spec = format_spec(session_format)
    return Range(starts_at, starts_at + spec.occupied, bounds="[)"), starts_at + spec.session


async def hold_slot(
    session: AsyncSession,
    client_id: uuid.UUID,
    psychologist_id: uuid.UUID,
    starts_at: datetime,
    session_format: SessionFormat,
) -> Booking:
    """Удерживает время у психолога на период оплаты.

    Args:
        session: Сессия БД.
        client_id: Клиент.
        psychologist_id: Психолог.
        starts_at: Старт сессии.
        session_format: Формат.

    Returns:
        Booking: Запись в статусе HELD.

    Raises:
        NotFoundError: Если психолог не найден.
        PolicyViolationError: Если формат не оказывается.
        SlotUnavailableError: Если время занято или нерабочее.
    """
    psychologist = await session.get(Psychologist, psychologist_id)
    if psychologist is None or not psychologist.is_active:
        raise NotFoundError("Психолог не найден")
    price = psychologist.price_for(session_format)
    if price is None:
        raise PolicyViolationError("Специалист не проводит сессии в этом формате")
    if not await is_start_available(session, psychologist_id, starts_at, format_spec(session_format)):
        raise SlotUnavailableError("Это время недоступно, выберите другое")

    now = utcnow()
    period, session_ends_at = _period(starts_at, session_format)
    await _expire_holds(session, Booking.client_id == client_id)
    await _expire_holds(
        session,
        Booking.psychologist_id == psychologist_id,
        Booking.hold_expires_at <= now,
        Booking.period.overlaps(period),
    )
    booking = Booking(
        client_id=client_id,
        psychologist_id=psychologist_id,
        format=session_format,
        starts_at=starts_at,
        session_ends_at=session_ends_at,
        period=period,
        status=BookingStatus.HELD,
        price_kzt=price,
        policy_version=CURRENT_POLICY,
        hold_expires_at=now + timedelta(minutes=get_settings().hold_minutes),
    )
    session.add(booking)
    try:
        await session.flush()
    except IntegrityError as exc:
        if is_overlap_error(exc):
            raise SlotUnavailableError("Это время уже заняли, выберите другое") from exc
        raise
    await session.commit()
    logger.info("Холд %s: психолог %s, %s", booking.id, psychologist_id, starts_at)
    return booking


def _confirm(booking: Booking) -> None:
    """Подтверждает запись."""
    booking.status = BookingStatus.CONFIRMED
    booking.hold_expires_at = None


async def checkout(
    session: AsyncSession,
    booking_id: uuid.UUID,
    client_id: uuid.UUID,
    data: CheckoutIn,
) -> CheckoutOut:
    """Оплачивает запись балансом и/или создаёт внешний платёж.

    Args:
        session: Сессия БД.
        booking_id: Запись.
        client_id: Клиент.
        data: Способ оплаты.

    Returns:
        CheckoutOut: Статус и, при необходимости, ссылка на оплату.

    Raises:
        PolicyViolationError: Если холд истёк или не выбран провайдер.
        PaymentGatewayError: При ошибке провайдера.
    """
    booking = await _lock_own_booking(session, booking_id, client_id)
    now = utcnow()
    if booking.status != BookingStatus.HELD or (booking.hold_expires_at and booking.hold_expires_at <= now):
        raise PolicyViolationError("Время удержания истекло, выберите время заново")

    if data.use_balance and booking.balance_paid_kzt == 0:
        await ledger.lock_balance(session, client_id)
        part = min(await ledger.get_balance(session, client_id), booking.price_kzt)
        if part > 0:
            await ledger.debit(session, client_id, part, LedgerKind.BOOKING_DEBIT, booking_id=booking.id)
            booking.balance_paid_kzt = part

    to_pay = booking.price_kzt - booking.balance_paid_kzt
    redirect_url = None
    if to_pay == 0:
        _confirm(booking)
    elif data.provider is None:
        raise PolicyViolationError("Выберите способ оплаты")
    else:
        payment = Payment(
            user_id=client_id,
            provider=data.provider,
            purpose=PaymentPurpose.BOOKING,
            booking_id=booking.id,
            amount_kzt=to_pay,
        )
        session.add(payment)
        await session.flush()
        init = await get_gateway(data.provider).create_payment(payment, f"Сессия sez.im, заказ {payment.id}")
        payment.provider_payment_id = init.provider_payment_id
        redirect_url = init.redirect_url

    await session.commit()
    return CheckoutOut(
        booking_id=booking.id,
        status=booking.status,
        balance_paid_kzt=booking.balance_paid_kzt,
        to_pay_kzt=to_pay,
        redirect_url=redirect_url,
    )


async def settle_booking_payment(session: AsyncSession, payment: Payment) -> None:
    """Применяет успешный внешний платёж к записи. Не коммитит.

    Если запись истекла, но время свободно — подтверждает её (недостающее
    берётся с баланса). Иначе сумма зачисляется на баланс клиента.

    Args:
        session: Сессия БД.
        payment: Успешный платёж (заблокирован вызывающим).
    """
    booking = await _lock_booking(session, payment.booking_id)
    booking_id, client_id = booking.id, booking.client_id
    payment_id, amount = payment.id, payment.amount_kzt
    match booking.status:
        case BookingStatus.HELD:
            _confirm(booking)
            return
        case BookingStatus.EXPIRED:
            gap = booking.price_kzt - amount
            # Фиксируем изменения платежа до SAVEPOINT, чтобы откат их не затронул.
            await session.flush()
            try:
                async with session.begin_nested():
                    if gap > 0:
                        await ledger.debit(session, client_id, gap, LedgerKind.BOOKING_DEBIT, booking_id=booking_id)
                    booking.balance_paid_kzt = max(gap, 0)
                    _confirm(booking)
                    await session.flush()
                logger.info("Запись %s подтверждена после истечения холда", booking_id)
                return
            except InsufficientBalanceError:
                logger.info("Запись %s: не хватает баланса для доплаты %d", booking_id, gap)
            except IntegrityError as exc:
                if not is_overlap_error(exc):
                    raise
                logger.info("Запись %s: время уже занято", booking_id)
        case status:
            logger.warning("Платёж %s по записи %s в статусе %s", payment_id, booking_id, status.value)

    await ledger.credit(
        session, client_id, amount, LedgerKind.UNAPPLIED_PAYMENT, booking_id=booking_id, payment_id=payment_id
    )


async def cancel_booking(session: AsyncSession, booking_id: uuid.UUID, client_id: uuid.UUID) -> int:
    """Отменяет запись; возврат зачисляется на баланс.

    Args:
        session: Сессия БД.
        booking_id: Запись.
        client_id: Клиент.

    Returns:
        int: Сумма возврата на баланс.

    Raises:
        NotFoundError: Если запись чужая.
        PolicyViolationError: Если отмена невозможна.
    """
    booking = await _lock_own_booking(session, booking_id, client_id)
    now = utcnow()
    match booking.status:
        case BookingStatus.HELD:
            refund = await _balance_paid_for(session, booking.id)
            kind = LedgerKind.HOLD_RELEASE
        case BookingStatus.CONFIRMED if _hours_left(booking, now) > 0:
            policy = get_policy(booking.policy_version)
            percent = 100 if _hours_left(booking, now) >= policy.free_hours else policy.late_refund_percent
            refund = booking.price_kzt * percent // 100
            kind = LedgerKind.CANCEL_REFUND
        case _:
            raise PolicyViolationError("Эту запись уже нельзя отменить")

    booking.status = BookingStatus.CANCELLED
    booking.refund_kzt = refund
    if refund:
        await ledger.credit(session, client_id, refund, kind, booking_id=booking.id)
    await session.commit()
    logger.info("Запись %s отменена, возврат %d на баланс", booking.id, refund)
    return refund


async def reschedule_booking(
    session: AsyncSession,
    booking_id: uuid.UUID,
    client_id: uuid.UUID,
    new_start: datetime,
) -> Booking:
    """Переносит подтверждённую запись к тому же психологу.

    Args:
        session: Сессия БД.
        booking_id: Запись.
        client_id: Клиент.
        new_start: Новый старт.

    Returns:
        Booking: Обновлённая запись.

    Raises:
        NotFoundError: Если запись чужая.
        PolicyViolationError: Если перенос запрещён правилами.
        SlotUnavailableError: Если новое время занято.
    """
    booking = await _lock_own_booking(session, booking_id, client_id)
    now = utcnow()
    if booking.status != BookingStatus.CONFIRMED:
        raise PolicyViolationError("Перенести можно только подтверждённую запись")
    if _hours_left(booking, now) < get_policy(booking.policy_version).free_hours:
        raise PolicyViolationError("Срок бесплатного переноса истёк")
    if not await is_start_available(session, booking.psychologist_id, new_start, format_spec(booking.format)):
        raise SlotUnavailableError("Это время недоступно")

    period, session_ends_at = _period(new_start, booking.format)
    await _expire_holds(
        session,
        Booking.psychologist_id == booking.psychologist_id,
        Booking.hold_expires_at <= now,
        Booking.period.overlaps(period),
    )
    booking.starts_at, booking.session_ends_at, booking.period = new_start, session_ends_at, period
    booking.reminders_sent = []
    try:
        await session.flush()
    except IntegrityError as exc:
        if is_overlap_error(exc):
            raise SlotUnavailableError("Это время уже заняли") from exc
        raise
    await session.commit()
    logger.info("Запись %s перенесена на %s", booking.id, new_start)
    return booking


async def release_expired_holds(session: AsyncSession) -> int:
    """Освобождает истёкшие холды (фоновая задача).

    Args:
        session: Сессия БД.

    Returns:
        int: Количество истёкших холдов.
    """
    expired = await _expire_holds(session, Booking.hold_expires_at <= utcnow())
    await session.commit()
    return expired
