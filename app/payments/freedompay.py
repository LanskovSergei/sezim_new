"""Адаптер FreedomPay (pg_sig = md5(script;значения по ключам;secret)).

Сверьте адрес API и имя скрипта result-url с документацией вашего мерчанта.
"""

import hashlib
import hmac
import logging
import secrets
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation

import httpx
from fastapi import Response

from app.config import get_settings
from app.errors import InvalidSignatureError, PaymentGatewayError
from app.models import Payment, PaymentProvider
from app.payments.base import PaymentEvent, PaymentInit

logger = logging.getLogger(__name__)

INIT_SCRIPT = "init_payment.php"
RESULT_SCRIPT = "webhook"  # последний сегмент пути /v1/payments/freedompay/webhook


def sign(script: str, params: Mapping[str, str], secret: str) -> str:
    """Подпись FreedomPay.

    Args:
        script: Имя скрипта (последний сегмент URL).
        params: Параметры без pg_sig.
        secret: Секретный ключ мерчанта.

    Returns:
        str: MD5-подпись.
    """
    values = [str(params[key]) for key in sorted(params) if key != "pg_sig"]
    return hashlib.md5(";".join([script, *values, secret]).encode()).hexdigest()  # noqa: S324


class FreedomPayGateway:
    """Платежи через FreedomPay."""

    provider = PaymentProvider.FREEDOMPAY

    async def create_payment(self, payment: Payment, description: str) -> PaymentInit:
        """Создаёт платёж через init_payment и возвращает pg_redirect_url.

        Args:
            payment: Платёж.
            description: Назначение платежа.

        Returns:
            PaymentInit: Ссылка на оплату.

        Raises:
            PaymentGatewayError: При сетевой ошибке или отказе провайдера.
        """
        s = get_settings()
        params: dict[str, str] = {
            "pg_merchant_id": s.freedompay_merchant_id,
            "pg_order_id": str(payment.id),
            "pg_amount": str(payment.amount_kzt),
            "pg_currency": "KZT",
            "pg_description": description[:250],
            "pg_salt": secrets.token_hex(8),
            "pg_result_url": f"{s.public_base_url}/v1/payments/freedompay/webhook",
            "pg_success_url": f"{s.public_base_url}/payment/success",
            "pg_failure_url": f"{s.public_base_url}/payment/failure",
            "pg_testing_mode": "1" if s.freedompay_test else "0",
        }
        params["pg_sig"] = sign(INIT_SCRIPT, params, s.freedompay_secret.get_secret_value())
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.post(s.freedompay_url, data=params)
                response.raise_for_status()
            root = ET.fromstring(response.text)
        except (httpx.HTTPError, ET.ParseError) as exc:
            logger.exception("FreedomPay init_payment: ошибка запроса")
            raise PaymentGatewayError("Платёжный сервис недоступен, попробуйте позже") from exc

        if root.findtext("pg_status") != "ok":
            logger.error("FreedomPay отказ: %s", root.findtext("pg_error_description"))
            raise PaymentGatewayError("Платёжный сервис отклонил запрос")
        return PaymentInit(
            redirect_url=root.findtext("pg_redirect_url", ""),
            provider_payment_id=root.findtext("pg_payment_id"),
        )

    def parse_webhook(self, params: Mapping[str, str]) -> PaymentEvent:
        """Проверяет pg_sig и разбирает result-уведомление.

        Args:
            params: Параметры уведомления.

        Returns:
            PaymentEvent: Нормализованное событие.

        Raises:
            InvalidSignatureError: Если подпись неверна или параметры битые.
        """
        secret = get_settings().freedompay_secret.get_secret_value()
        if not hmac.compare_digest(sign(RESULT_SCRIPT, params, secret), params.get("pg_sig", "")):
            raise InvalidSignatureError("FreedomPay: неверная подпись")
        try:
            return PaymentEvent(
                payment_id=int(params["pg_order_id"]),
                succeeded=params.get("pg_result") == "1",
                amount_kzt=int(Decimal(params["pg_amount"])),
                provider_payment_id=params.get("pg_payment_id"),
                raw=dict(params),
            )
        except (KeyError, ValueError, InvalidOperation) as exc:
            raise InvalidSignatureError("FreedomPay: некорректные параметры") from exc

    def ack(self, event: PaymentEvent) -> Response:
        """Подписанный XML-ответ pg_status=ok.

        Args:
            event: Обработанное событие.

        Returns:
            Response: XML-ответ.
        """
        params = {"pg_status": "ok", "pg_salt": secrets.token_hex(8)}
        params["pg_sig"] = sign(RESULT_SCRIPT, params, get_settings().freedompay_secret.get_secret_value())
        body = "".join(f"<{k}>{v}</{k}>" for k, v in params.items())
        xml = f'<?xml version="1.0" encoding="utf-8"?><response>{body}</response>'
        return Response(xml, media_type="application/xml")
