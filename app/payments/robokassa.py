"""Адаптер Robokassa (ResultURL + MD5-подпись).

Сверьте алгоритм подписи и адрес с настройками магазина в личном кабинете.
"""

import hashlib
import hmac
import logging
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode

from fastapi import Response
from fastapi.responses import PlainTextResponse

from app.config import get_settings
from app.errors import InvalidSignatureError
from app.models import Payment, PaymentProvider
from app.payments.base import PaymentEvent, PaymentInit

logger = logging.getLogger(__name__)


def _md5(value: str) -> str:
    """MD5 в hex-представлении."""
    return hashlib.md5(value.encode()).hexdigest()  # noqa: S324 — требование протокола Robokassa


class RobokassaGateway:
    """Платежи через Robokassa."""

    provider = PaymentProvider.ROBOKASSA

    async def create_payment(self, payment: Payment, description: str) -> PaymentInit:
        """Формирует ссылку на платёжную форму Robokassa.

        Args:
            payment: Платёж.
            description: Назначение платежа.

        Returns:
            PaymentInit: Ссылка на оплату.
        """
        s = get_settings()
        out_sum = str(payment.amount_kzt)
        parts = [s.robokassa_login, out_sum, str(payment.id)]
        if s.robokassa_currency:
            parts.append(s.robokassa_currency)
        parts.append(s.robokassa_password1.get_secret_value())
        params = {
            "MerchantLogin": s.robokassa_login,
            "OutSum": out_sum,
            "InvId": payment.id,
            "Description": description[:100],
            "SignatureValue": _md5(":".join(parts)),
            "Culture": "ru",
        }
        if s.robokassa_currency:
            params["OutSumCurrency"] = s.robokassa_currency
        if s.robokassa_test:
            params["IsTest"] = 1
        return PaymentInit(redirect_url=f"{s.robokassa_url}?{urlencode(params)}")

    def parse_webhook(self, params: Mapping[str, str]) -> PaymentEvent:
        """Проверяет подпись ResultURL: md5(OutSum:InvId:Password2).

        Args:
            params: Параметры уведомления.

        Returns:
            PaymentEvent: Успешная оплата (Robokassa шлёт ResultURL только при успехе).

        Raises:
            InvalidSignatureError: Если подпись неверна или параметры битые.
        """
        password2 = get_settings().robokassa_password2.get_secret_value()
        out_sum, inv_id = params.get("OutSum", ""), params.get("InvId", "")
        expected = _md5(f"{out_sum}:{inv_id}:{password2}")
        if not hmac.compare_digest(expected.lower(), params.get("SignatureValue", "").lower()):
            raise InvalidSignatureError("Robokassa: неверная подпись")
        try:
            amount = int(Decimal(out_sum))
            payment_id = int(inv_id)
        except (InvalidOperation, ValueError) as exc:
            raise InvalidSignatureError("Robokassa: некорректные параметры") from exc
        return PaymentEvent(payment_id=payment_id, succeeded=True, amount_kzt=amount, raw=dict(params))

    def ack(self, event: PaymentEvent) -> Response:
        """Robokassa ожидает текст OK{InvId}.

        Args:
            event: Обработанное событие.

        Returns:
            Response: Текстовый ответ.
        """
        return PlainTextResponse(f"OK{event.payment_id}")
