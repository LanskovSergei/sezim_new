"""ORM-модели доменной области sez.im."""

import enum
import uuid
from datetime import datetime, time
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Time,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSTZRANGE, UUID, ExcludeConstraint, Range
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

TZ = DateTime(timezone=True)


class Base(DeclarativeBase):
    """Базовый класс декларативных моделей."""


def pg_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """Создаёт PostgreSQL ENUM, хранящий значения членов.

    Args:
        enum_cls: Python-перечисление.
        name: Имя типа в БД.

    Returns:
        Enum: Тип колонки SQLAlchemy.
    """
    return Enum(enum_cls, name=name, values_callable=lambda members: [m.value for m in members])


class Role(str, enum.Enum):
    """Роль пользователя."""

    CLIENT = "client"
    PSYCHOLOGIST = "psychologist"
    ADMIN = "admin"


class Gender(str, enum.Enum):
    """Пол специалиста."""

    MALE = "male"
    FEMALE = "female"


class SessionFormat(str, enum.Enum):
    """Формат сессии."""

    INDIVIDUAL = "individual"
    COUPLE = "couple"


class BookingStatus(str, enum.Enum):
    """Жизненный цикл записи."""

    HELD = "held"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    COMPLETED = "completed"


class PaymentProvider(str, enum.Enum):
    """Внешний платёжный провайдер."""

    KASPI = "kaspi"
    ROBOKASSA = "robokassa"
    FREEDOMPAY = "freedompay"


class PaymentStatus(str, enum.Enum):
    """Статус внешнего платежа."""

    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class PaymentPurpose(str, enum.Enum):
    """За что платят."""

    BOOKING = "booking"
    CERTIFICATE = "certificate"


class CertificateStatus(str, enum.Enum):
    """Жизненный цикл подарочного сертификата."""

    PENDING_PAYMENT = "pending_payment"
    ISSUED = "issued"
    ACTIVATED = "activated"
    EXPIRED = "expired"


class LedgerKind(str, enum.Enum):
    """Тип операции по внутреннему балансу."""

    CERTIFICATE = "certificate"
    BOOKING_DEBIT = "booking_debit"
    HOLD_RELEASE = "hold_release"
    CANCEL_REFUND = "cancel_refund"
    UNAPPLIED_PAYMENT = "unapplied_payment"
    ADJUSTMENT = "adjustment"


class User(Base):
    """Пользователь платформы."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    email: Mapped[str | None] = mapped_column(String(254))
    name: Mapped[str | None] = mapped_column(String(120))
    role: Mapped[Role] = mapped_column(pg_enum(Role, "user_role"), default=Role.CLIENT)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Psychologist(Base):
    """Профиль психолога. couple_price_kzt = NULL — не работает с парами."""

    __tablename__ = "psychologists"
    __table_args__ = (
        Index("ix_psy_topics", "topics", postgresql_using="gin"),
        Index("ix_psy_languages", "languages", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    gender: Mapped[Gender] = mapped_column(pg_enum(Gender, "gender"))
    price_kzt: Mapped[int]
    couple_price_kzt: Mapped[int | None]
    experience_years: Mapped[int] = mapped_column(SmallInteger)
    rating: Mapped[float] = mapped_column(default=0.0)
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Almaty")
    languages: Mapped[list[str]] = mapped_column(ARRAY(String(16)), default=list)
    topics: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    approaches: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)

    def price_for(self, session_format: SessionFormat) -> int | None:
        """Цена сессии в выбранном формате.

        Args:
            session_format: Формат сессии.

        Returns:
            int | None: Цена в тенге или None, если формат не оказывается.
        """
        match session_format:
            case SessionFormat.INDIVIDUAL:
                return self.price_kzt
            case SessionFormat.COUPLE:
                return self.couple_price_kzt


class AvailabilityRule(Base):
    """Недельный шаблон рабочего времени (локальное время психолога)."""

    __tablename__ = "availability_rules"
    __table_args__ = (
        CheckConstraint("weekday BETWEEN 0 AND 6", name="ck_rule_weekday"),
        CheckConstraint("start_local < end_local", name="ck_rule_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("psychologists.id", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column(SmallInteger)
    start_local: Mapped[time] = mapped_column(Time)
    end_local: Mapped[time] = mapped_column(Time)


class AvailabilityException(Base):
    """Исключение из расписания: отпуск, больничный, разовая блокировка."""

    __tablename__ = "availability_exceptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("psychologists.id", ondelete="CASCADE"), index=True
    )
    starts_at: Mapped[datetime] = mapped_column(TZ)
    ends_at: Mapped[datetime] = mapped_column(TZ)
    reason: Mapped[str | None] = mapped_column(String(120))


class AvailabilityCell(Base):
    """30-минутная ячейка рабочего времени. Занятость определяется записями."""

    __tablename__ = "availability_cells"

    psychologist_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("psychologists.id", ondelete="CASCADE"), primary_key=True
    )
    starts_at: Mapped[datetime] = mapped_column(TZ, primary_key=True)

    __table_args__ = (Index("ix_cell_start", "starts_at"),)


class Booking(Base):
    """Запись на сессию. period — занятое время, включая перерыв после сессии."""

    __tablename__ = "bookings"
    __table_args__ = (
        ExcludeConstraint(
            ("psychologist_id", "="),
            ("period", "&&"),
            name="ex_booking_overlap",
            using="gist",
            where=text("status IN ('held', 'confirmed')"),
        ),
        Index("ix_booking_psy_start", "psychologist_id", "starts_at"),
        Index("ix_booking_client_start", "client_id", "starts_at"),
        Index("ix_booking_hold", "hold_expires_at", postgresql_where=text("status = 'held'")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    psychologist_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("psychologists.id"))
    format: Mapped[SessionFormat] = mapped_column(pg_enum(SessionFormat, "session_format"))
    starts_at: Mapped[datetime] = mapped_column(TZ)
    session_ends_at: Mapped[datetime] = mapped_column(TZ)
    period: Mapped[Range[datetime]] = mapped_column(TSTZRANGE)
    status: Mapped[BookingStatus] = mapped_column(pg_enum(BookingStatus, "booking_status"))
    price_kzt: Mapped[int]
    balance_paid_kzt: Mapped[int] = mapped_column(default=0)
    policy_version: Mapped[str] = mapped_column(String(32))
    hold_expires_at: Mapped[datetime | None] = mapped_column(TZ)
    refund_kzt: Mapped[int | None]
    reminders_sent: Mapped[list[str]] = mapped_column(
        ARRAY(String(8)), default=list, server_default=text("'{}'")
    )
    client_joined_at: Mapped[datetime | None] = mapped_column(TZ)
    psychologist_joined_at: Mapped[datetime | None] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Certificate(Base):
    """Подарочный сертификат; при активации пополняет баланс получателя."""

    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str | None] = mapped_column(String(16), unique=True)
    nominal_kzt: Mapped[int]
    buyer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    recipient_name: Mapped[str | None] = mapped_column(String(120))
    recipient_phone: Mapped[str | None] = mapped_column(String(20))
    recipient_email: Mapped[str | None] = mapped_column(String(254))
    message: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[CertificateStatus] = mapped_column(pg_enum(CertificateStatus, "certificate_status"))
    expires_at: Mapped[datetime | None] = mapped_column(TZ)
    activated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    activated_at: Mapped[datetime | None] = mapped_column(TZ)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Payment(Base):
    """Внешний платёж. id (bigint) передаётся провайдеру как номер заказа."""

    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint(
            "(booking_id IS NOT NULL)::int + (certificate_id IS NOT NULL)::int = 1",
            name="ck_payment_single_target",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    provider: Mapped[PaymentProvider] = mapped_column(pg_enum(PaymentProvider, "payment_provider"))
    purpose: Mapped[PaymentPurpose] = mapped_column(pg_enum(PaymentPurpose, "payment_purpose"))
    booking_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bookings.id"), index=True)
    certificate_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("certificates.id"), index=True)
    amount_kzt: Mapped[int] = mapped_column(Integer, CheckConstraint("amount_kzt > 0"))
    status: Mapped[PaymentStatus] = mapped_column(
        pg_enum(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING
    )
    provider_payment_id: Mapped[str | None] = mapped_column(String(128))
    raw_event: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now(), onupdate=func.now())


class LedgerEntry(Base):
    """Операция по внутреннему балансу. Баланс = сумма amount_kzt."""

    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    amount_kzt: Mapped[int]
    kind: Mapped[LedgerKind] = mapped_column(pg_enum(LedgerKind, "ledger_kind"))
    booking_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("bookings.id"))
    certificate_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("certificates.id"))
    payment_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("payments.id"))
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Questionnaire(Base):
    """Анкета подбора; заполняется анонимно до входа."""

    __tablename__ = "questionnaires"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    answers: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
