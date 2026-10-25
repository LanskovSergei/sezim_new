"""Общий контракт платёжных провайдеров."""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any, Protocol

from fastapi import Response

from app.models import Payment, PaymentProvider


@dataclass(frozen=True, slots=True)
class PaymentInit:
    """Результат создания платежа у провайдера.

    Attributes:
        redirect_url: Куда отправить клиента для оплаты.
        provider_payment_id: Идентификатор платежа у провайдера, если известен.
    """

    redirect_url: str
    provider_payment_id: str | None = None


@dataclass(frozen=True, slots=True)
class PaymentEvent:
    """Нормализованное уведомление провайдера.

    Attributes:
        payment_id: Наш идентификатор платежа (номер заказа).
        succeeded: Успешна ли оплата.
        amount_kzt: Сумма, подтверждённая провайдером.
        provider_payment_id: Идентификатор у провайдера.
        raw: Исходные параметры для аудита.
    """

    payment_id: int
    succeeded: bool
    amount_kzt: int
    provider_payment_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class PaymentGateway(Protocol):
    """Адаптер платёжного провайдера."""

    provider: PaymentProvider

    async def create_payment(self, payment: Payment, description: str) -> PaymentInit:
        """Создаёт платёж и возвращает ссылку на оплату.

        Args:
            payment: Платёж (id уже назначен).
            description: Назначение платежа.

        Returns:
            PaymentInit: Ссылка на оплату.

        Raises:
            PaymentGatewayError: При ошибке провайдера.
        """

    def parse_webhook(self, params: Mapping[str, str]) -> PaymentEvent:
        """Проверяет подпись и разбирает уведомление.

        Args:
            params: Параметры запроса (query + form).

        Returns:
            PaymentEvent: Нормализованное событие.

        Raises:
            InvalidSignatureError: Если подпись неверна.
        """

    def ack(self, event: PaymentEvent) -> Response:
        """Ответ, который провайдер ожидает после обработки уведомления.

        Args:
            event: Обработанное событие.

        Returns:
            Response: HTTP-ответ провайдеру.
        """
