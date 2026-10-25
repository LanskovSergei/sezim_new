"""Доменные исключения. HTTP-коды назначаются в app.main."""


class DomainError(Exception):
    """Базовая доменная ошибка."""


class NotFoundError(DomainError):
    """Объект не найден или недоступен пользователю."""


class SlotUnavailableError(DomainError):
    """Время уже занято или недоступно."""


class PolicyViolationError(DomainError):
    """Действие запрещено бизнес-правилами."""


class InsufficientBalanceError(DomainError):
    """Недостаточно средств на внутреннем балансе."""


class PaymentGatewayError(DomainError):
    """Ошибка взаимодействия с платёжным провайдером."""


class InvalidSignatureError(DomainError):
    """Неверная подпись входящего уведомления."""
