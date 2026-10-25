"""Подарочные сертификаты: покупка → выпуск кода → активация на баланс."""

import logging
import secrets
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.errors import NotFoundError, PolicyViolationError
from app.models import Certificate, CertificateStatus, LedgerKind, Payment, PaymentPurpose
from app.payments import get_gateway
from app.schemas import CertificateIn, CertificatePurchaseOut
from app.services import ledger
from app.services.availability import utcnow

logger = logging.getLogger(__name__)

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 12


def generate_code() -> str:
    """Криптостойкий код без похожих символов (0/O, 1/I).

    Returns:
        str: Код из 12 символов.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(raw: str) -> str:
    """Приводит введённый код к каноническому виду.

    Args:
        raw: Код, как его ввёл пользователь (с дефисами, пробелами).

    Returns:
        str: Код в верхнем регистре без разделителей.
    """
    return "".join(ch for ch in raw.upper() if ch.isalnum())


async def purchase_certificate(
    session: AsyncSession,
    buyer_id: uuid.UUID,
    data: CertificateIn,
) -> CertificatePurchaseOut:
    """Создаёт сертификат и платёж за него.

    Args:
        session: Сессия БД.
        buyer_id: Покупатель.
        data: Параметры сертификата.

    Returns:
        CertificatePurchaseOut: Ссылка на оплату.

    Raises:
        PolicyViolationError: Если номинал вне допустимых границ.
        PaymentGatewayError: При ошибке провайдера.
    """
    s = get_settings()
    if not s.certificate_min_kzt <= data.nominal_kzt <= s.certificate_max_kzt:
        raise PolicyViolationError(f"Номинал: от {s.certificate_min_kzt} до {s.certificate_max_kzt} ₸")

    certificate = Certificate(
        nominal_kzt=data.nominal_kzt,
        buyer_id=buyer_id,
        recipient_name=data.recipient_name,
        recipient_phone=data.recipient_phone,
        recipient_email=data.recipient_email,
        message=data.message,
        status=CertificateStatus.PENDING_PAYMENT,
    )
    session.add(certificate)
    await session.flush()
    payment = Payment(
        user_id=buyer_id,
        provider=data.provider,
        purpose=PaymentPurpose.CERTIFICATE,
        certificate_id=certificate.id,
        amount_kzt=data.nominal_kzt,
    )
    session.add(payment)
    await session.flush()
    init = await get_gateway(data.provider).create_payment(payment, f"Подарочный сертификат sez.im, заказ {payment.id}")
    payment.provider_payment_id = init.provider_payment_id
    await session.commit()
    return CertificatePurchaseOut(certificate_id=certificate.id, redirect_url=init.redirect_url)


async def issue_certificate(session: AsyncSession, payment: Payment) -> None:
    """Выпускает код после успешной оплаты. Не коммитит.

    Args:
        session: Сессия БД.
        payment: Успешный платёж за сертификат.
    """
    certificate = await session.scalar(
        select(Certificate).where(Certificate.id == payment.certificate_id).with_for_update()
    )
    if certificate is None or certificate.status != CertificateStatus.PENDING_PAYMENT:
        logger.warning("Платёж %s: сертификат уже выпущен или не найден", payment.id)
        return
    certificate.code = generate_code()
    certificate.status = CertificateStatus.ISSUED
    certificate.expires_at = utcnow() + timedelta(days=get_settings().certificate_valid_days)
    logger.info("Сертификат %s выпущен", certificate.id)
    # TODO: отправка кода получателю (SMS/email/PDF) через очередь уведомлений.


async def activate_certificate(session: AsyncSession, user_id: uuid.UUID, raw_code: str) -> int:
    """Активирует сертификат и зачисляет номинал на баланс.

    Args:
        session: Сессия БД.
        user_id: Получатель.
        raw_code: Введённый код.

    Returns:
        int: Зачисленная сумма.

    Raises:
        NotFoundError: Если код не найден.
        PolicyViolationError: Если сертификат уже активирован или истёк.
    """
    certificate = await session.scalar(
        select(Certificate).where(Certificate.code == normalize_code(raw_code)).with_for_update()
    )
    if certificate is None:
        raise NotFoundError("Сертификат не найден")
    now = utcnow()
    match certificate.status:
        case CertificateStatus.ISSUED if certificate.expires_at is None or certificate.expires_at > now:
            pass
        case CertificateStatus.ISSUED | CertificateStatus.EXPIRED:
            raise PolicyViolationError("Срок действия сертификата истёк")
        case _:
            raise PolicyViolationError("Сертификат уже активирован")

    certificate.status = CertificateStatus.ACTIVATED
    certificate.activated_by = user_id
    certificate.activated_at = now
    await ledger.credit(
        session, user_id, certificate.nominal_kzt, LedgerKind.CERTIFICATE, certificate_id=certificate.id
    )
    await session.commit()
    return certificate.nominal_kzt
