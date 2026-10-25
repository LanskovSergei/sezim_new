"""Обработка уведомлений платёжных провайдеров (идемпотентно)."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import NotFoundError, PolicyViolationError
from app.models import Payment, PaymentProvider, PaymentPurpose, PaymentStatus
from app.payments import PaymentEvent
from app.services.booking import settle_booking_payment
from app.services.certificates import issue_certificate

logger = logging.getLogger(__name__)


async def apply_payment_event(session: AsyncSession, provider: PaymentProvider, event: PaymentEvent) -> Payment:
    """Применяет событие к платежу и его цели (запись или сертификат).

    Повторные уведомления по уже обработанному платежу игнорируются.

    Args:
        session: Сессия БД.
        provider: Провайдер, от которого пришло уведомление.
        event: Нормализованное событие.

    Returns:
        Payment: Платёж в итоговом состоянии.

    Raises:
        NotFoundError: Если платёж не найден у этого провайдера.
        PolicyViolationError: Если сумма не совпадает.
    """
    payment = await session.scalar(
        select(Payment)
        .where(Payment.id == event.payment_id, Payment.provider == provider)
        .with_for_update()
    )
    if payment is None:
        raise NotFoundError("Платёж не найден")
    if payment.status != PaymentStatus.PENDING:
        logger.info("Повторное уведомление по платежу %s", payment.id)
        return payment
    if event.succeeded and event.amount_kzt != payment.amount_kzt:
        logger.error("Платёж %s: сумма %d ≠ %d", payment.id, event.amount_kzt, payment.amount_kzt)
        raise PolicyViolationError("Сумма платежа не совпадает")

    payment.raw_event = event.raw
    payment.provider_payment_id = event.provider_payment_id or payment.provider_payment_id
    if not event.succeeded:
        payment.status = PaymentStatus.FAILED
        await session.commit()
        return payment

    payment.status = PaymentStatus.SUCCEEDED
    match payment.purpose:
        case PaymentPurpose.BOOKING:
            await settle_booking_payment(session, payment)
        case PaymentPurpose.CERTIFICATE:
            await issue_certificate(session, payment)
    await session.commit()
    logger.info("Платёж %s (%s) успешно применён", payment.id, payment.purpose.value)
    return payment
