"""Pydantic-схемы запросов и ответов API."""

import uuid
from datetime import datetime, time, timedelta
from typing import Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import BookingStatus, CertificateStatus, Gender, PaymentProvider, SessionFormat


class QuestionnaireIn(BaseModel):
    """Ответы анкеты подбора."""

    format: SessionFormat = SessionFormat.INDIVIDUAL
    topics: list[str] = Field(min_length=1, max_length=10)
    languages: list[str] = Field(default_factory=lambda: ["ru"])
    preferred_gender: Gender | None = None
    max_price_kzt: int | None = Field(default=None, gt=0)
    min_experience_years: int | None = Field(default=None, ge=0)


class IdOut(BaseModel):
    """Идентификатор созданного объекта."""

    id: uuid.UUID


class TimeWindow(BaseModel):
    """Окно времени, удобное клиенту."""

    starts_at: AwareDatetime
    ends_at: AwareDatetime

    @model_validator(mode="after")
    def check_range(self) -> "TimeWindow":
        """Проверяет порядок границ и длину окна.

        Returns:
            TimeWindow: Валидная модель.

        Raises:
            ValueError: Если окно пустое или длиннее 14 дней.
        """
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at должен быть раньше ends_at")
        if self.ends_at - self.starts_at > timedelta(days=14):
            raise ValueError("Окно не может быть длиннее 14 дней")
        return self


class AvailabilityBucket(BaseModel):
    """Время начала и число подходящих свободных психологов."""

    starts_at: datetime
    psychologists_available: int


class PsychologistMatch(BaseModel):
    """Карточка психолога в подборке со свободными стартами в выбранных окнах."""

    id: uuid.UUID
    display_name: str
    price_kzt: int
    experience_years: int
    rating: float
    topics: list[str]
    match_score: float
    free_starts: list[datetime]


class MatchRequest(BaseModel):
    """Запрос подборки «сначала время»."""

    questionnaire_id: uuid.UUID
    windows: list[TimeWindow] = Field(min_length=1, max_length=10)


class HoldIn(BaseModel):
    """Запрос на удержание времени у психолога."""

    psychologist_id: uuid.UUID
    starts_at: AwareDatetime
    format: SessionFormat = SessionFormat.INDIVIDUAL


class RescheduleIn(BaseModel):
    """Запрос на перенос записи."""

    starts_at: AwareDatetime


class CheckoutIn(BaseModel):
    """Оплата записи: баланс и/или внешний провайдер."""

    use_balance: bool = True
    provider: PaymentProvider | None = None


class CheckoutOut(BaseModel):
    """Результат оформления оплаты."""

    booking_id: uuid.UUID
    status: BookingStatus
    balance_paid_kzt: int
    to_pay_kzt: int
    redirect_url: str | None = None


class BookingOut(BaseModel):
    """Запись для ЛК клиента или психолога."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    psychologist_id: uuid.UUID
    format: SessionFormat
    starts_at: datetime
    session_ends_at: datetime
    status: BookingStatus
    price_kzt: int
    balance_paid_kzt: int
    hold_expires_at: datetime | None


class CancelOut(BaseModel):
    """Результат отмены."""

    booking_id: uuid.UUID
    refund_kzt: int


class BalanceOut(BaseModel):
    """Внутренний баланс пользователя."""

    balance_kzt: int


class CertificateIn(BaseModel):
    """Покупка подарочного сертификата."""

    nominal_kzt: int = Field(gt=0)
    provider: PaymentProvider
    recipient_name: str | None = Field(default=None, max_length=120)
    recipient_phone: str | None = Field(default=None, max_length=20)
    recipient_email: EmailStr | None = None
    message: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_recipient(self) -> "CertificateIn":
        """Требует хотя бы один канал доставки.

        Returns:
            CertificateIn: Валидная модель.

        Raises:
            ValueError: Если не указан ни телефон, ни email.
        """
        if not (self.recipient_phone or self.recipient_email):
            raise ValueError("Укажите телефон или email получателя")
        return self


class CertificateOut(BaseModel):
    """Сертификат (без кода — код получает только получатель)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nominal_kzt: int
    status: CertificateStatus
    expires_at: datetime | None


class CertificatePurchaseOut(BaseModel):
    """Ссылка на оплату сертификата."""

    certificate_id: uuid.UUID
    redirect_url: str


class ActivateIn(BaseModel):
    """Активация сертификата по коду."""

    code: str = Field(min_length=8, max_length=16)


class AvailabilityRuleIn(BaseModel):
    """Интервал недельного расписания психолога."""

    weekday: int = Field(ge=0, le=6)
    start_local: time
    end_local: time

    @model_validator(mode="after")
    def check_range(self) -> "AvailabilityRuleIn":
        """Проверяет, что интервал не пустой.

        Returns:
            AvailabilityRuleIn: Валидная модель.

        Raises:
            ValueError: Если начало не раньше конца.
        """
        if self.start_local >= self.end_local:
            raise ValueError("start_local должен быть раньше end_local")
        return self


class VideoTokenOut(BaseModel):
    """Доступ к комнате LiveKit."""

    url: str
    room: str
    token: str


class OkOut(BaseModel):
    """Простой ответ."""

    status: Literal["ok"] = "ok"
