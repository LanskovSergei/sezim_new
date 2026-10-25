"""Адаптер Kaspi Pay (прямая интеграция).

API Kaspi для мерчантов выдаётся по договору; реализация появится
после получения спецификации. Контракт — как у остальных адаптеров.
"""

from collections.abc import Mapping

from fastapi import Response

from app.errors import InvalidSignatureError, PaymentGatewayError
from app.models import Payment, PaymentProvider
from app.payments.base import PaymentEvent, PaymentInit


class KaspiGateway:
    """Заглушка Kaspi Pay до получения спецификации API."""

    provider = PaymentProvider.KASPI

    async def create_payment(self, payment: Payment, description: str) -> PaymentInit:
        """Не реализовано до получения спецификации.

        Raises:
            PaymentGatewayError: Всегда.
        """
        raise PaymentGatewayError("Оплата через Kaspi временно недоступна")

    def parse_webhook(self, params: Mapping[str, str]) -> PaymentEvent:
        """Не реализовано до получения спецификации.

        Raises:
            InvalidSignatureError: Всегда.
        """
        raise InvalidSignatureError("Kaspi: уведомления ещё не поддерживаются")

    def ack(self, event: PaymentEvent) -> Response:
        """Ответ провайдеру по умолчанию.

        Returns:
            Response: Пустой 200.
        """
        return Response(status_code=200)
