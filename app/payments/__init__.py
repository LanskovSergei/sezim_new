"""Реестр платёжных адаптеров."""

from app.models import PaymentProvider
from app.payments.base import PaymentEvent, PaymentGateway, PaymentInit
from app.payments.freedompay import FreedomPayGateway
from app.payments.kaspi import KaspiGateway
from app.payments.robokassa import RobokassaGateway

__all__ = ["PaymentEvent", "PaymentGateway", "PaymentInit", "get_gateway"]

_GATEWAYS: dict[PaymentProvider, PaymentGateway] = {
    PaymentProvider.ROBOKASSA: RobokassaGateway(),
    PaymentProvider.FREEDOMPAY: FreedomPayGateway(),
    PaymentProvider.KASPI: KaspiGateway(),
}


def get_gateway(provider: PaymentProvider) -> PaymentGateway:
    """Возвращает адаптер провайдера.

    Args:
        provider: Провайдер.

    Returns:
        PaymentGateway: Адаптер.
    """
    return _GATEWAYS[provider]
