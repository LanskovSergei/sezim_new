"""Клиентские маршруты: подбор, запись, оплата, баланс, сертификаты."""

import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from pydantic import AwareDatetime
from sqlalchemy import select

from app.cache import cached_json, make_key
from app.deps import SessionDep, UserDep
from app.models import Booking, BookingStatus, Certificate, Questionnaire, SessionFormat
from app.schemas import (
    ActivateIn,
    AvailabilityBucket,
    BalanceOut,
    BookingOut,
    CancelOut,
    CertificateIn,
    CertificateOut,
    CertificatePurchaseOut,
    CheckoutIn,
    CheckoutOut,
    HoldIn,
    IdOut,
    MatchRequest,
    PsychologistMatch,
    QuestionnaireIn,
    RescheduleIn,
)
from app.services import ledger
from app.services.availability import availability_calendar, free_psychologists, psychologist_free_starts
from app.services.booking import cancel_booking, checkout, hold_slot, reschedule_booking
from app.services.certificates import activate_certificate, purchase_certificate
from app.services.matching import MatchCriteria

router = APIRouter(prefix="/v1", tags=["client"])

MAX_RANGE = timedelta(days=31)
CALENDAR_TTL_SECONDS = 60


def _check_range(date_from: datetime, date_to: datetime) -> None:
    """Валидирует период запроса.

    Raises:
        HTTPException: 422, если период пустой или длиннее 31 дня.
    """
    if not date_from < date_to <= date_from + MAX_RANGE:
        raise HTTPException(422, "Период: от 0 до 31 дня")


async def _criteria(session: SessionDep, questionnaire_id: uuid.UUID) -> MatchCriteria:
    """Критерии подбора из анкеты.

    Raises:
        HTTPException: 404, если анкета не найдена.
    """
    questionnaire = await session.get(Questionnaire, questionnaire_id)
    if questionnaire is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Анкета не найдена")
    return MatchCriteria.from_answers(questionnaire.answers)


@router.post("/questionnaires", status_code=status.HTTP_201_CREATED)
async def create_questionnaire(payload: QuestionnaireIn, session: SessionDep) -> IdOut:
    """Сохраняет анкету (шаг 1, без входа)."""
    questionnaire = Questionnaire(answers=payload.model_dump(mode="json"))
    session.add(questionnaire)
    await session.commit()
    return IdOut(id=questionnaire.id)


@router.get("/availability")
async def get_availability(
    questionnaire_id: uuid.UUID,
    date_from: AwareDatetime,
    date_to: AwareDatetime,
    session: SessionDep,
) -> list[AvailabilityBucket]:
    """Календарь времени с подходящими свободными психологами (шаг 2)."""
    _check_range(date_from, date_to)
    criteria = await _criteria(session, questionnaire_id)
    # Округляем период до 30 минут, чтобы запросы разных клиентов попадали в один ключ.
    step = 30 * 60
    start = datetime.fromtimestamp(date_from.timestamp() // step * step, date_from.tzinfo)
    key = make_key("calendar", [criteria.cache_key(), start.isoformat(), date_to.date().isoformat()])

    async def compute() -> list[dict[str, object]]:
        buckets = await availability_calendar(session, criteria, date_from, date_to)
        return [b.model_dump(mode="json") for b in buckets]

    data = await cached_json(key, CALENDAR_TTL_SECONDS, compute)
    return [AvailabilityBucket.model_validate(item) for item in data]


@router.post("/matches")
async def get_matches(payload: MatchRequest, session: SessionDep) -> list[PsychologistMatch]:
    """Психологи, свободные в выбранные окна (шаг 3)."""
    return await free_psychologists(session, await _criteria(session, payload.questionnaire_id), payload.windows)


@router.get("/psychologists/{psychologist_id}/free-starts")
async def get_free_starts(
    psychologist_id: uuid.UUID,
    date_from: AwareDatetime,
    date_to: AwareDatetime,
    session: SessionDep,
    format: SessionFormat = SessionFormat.INDIVIDUAL,
) -> list[datetime]:
    """Свободные старты психолога (ветка каталога)."""
    _check_range(date_from, date_to)
    return await psychologist_free_starts(session, psychologist_id, format, date_from, date_to)


@router.post("/bookings/hold", status_code=status.HTTP_201_CREATED)
async def create_hold(payload: HoldIn, session: SessionDep, user_id: UserDep) -> BookingOut:
    """Удерживает время на период оплаты (шаг 4)."""
    booking = await hold_slot(session, user_id, payload.psychologist_id, payload.starts_at, payload.format)
    return BookingOut.model_validate(booking)


@router.post("/bookings/{booking_id}/checkout")
async def checkout_booking(
    booking_id: uuid.UUID,
    payload: CheckoutIn,
    session: SessionDep,
    user_id: UserDep,
) -> CheckoutOut:
    """Оплата балансом и/или картой (шаг 6)."""
    return await checkout(session, booking_id, user_id, payload)


@router.post("/bookings/{booking_id}/cancel")
async def cancel(booking_id: uuid.UUID, session: SessionDep, user_id: UserDep) -> CancelOut:
    """Отмена по условиям заказа; возврат — на баланс."""
    refund = await cancel_booking(session, booking_id, user_id)
    return CancelOut(booking_id=booking_id, refund_kzt=refund)


@router.post("/bookings/{booking_id}/reschedule")
async def reschedule(
    booking_id: uuid.UUID,
    payload: RescheduleIn,
    session: SessionDep,
    user_id: UserDep,
) -> BookingOut:
    """Перенос к тому же психологу."""
    return BookingOut.model_validate(await reschedule_booking(session, booking_id, user_id, payload.starts_at))


@router.get("/me/bookings")
async def my_bookings(session: SessionDep, user_id: UserDep) -> list[BookingOut]:
    """Активные записи клиента."""
    rows = await session.scalars(
        select(Booking)
        .where(Booking.client_id == user_id, Booking.status.in_((BookingStatus.HELD, BookingStatus.CONFIRMED)))
        .order_by(Booking.starts_at)
    )
    return [BookingOut.model_validate(b) for b in rows]


@router.get("/me/balance")
async def my_balance(session: SessionDep, user_id: UserDep) -> BalanceOut:
    """Внутренний баланс."""
    return BalanceOut(balance_kzt=await ledger.get_balance(session, user_id))


@router.post("/certificates", status_code=status.HTTP_201_CREATED)
async def buy_certificate(payload: CertificateIn, session: SessionDep, user_id: UserDep) -> CertificatePurchaseOut:
    """Покупка подарочного сертификата."""
    return await purchase_certificate(session, user_id, payload)


@router.get("/me/certificates")
async def my_certificates(session: SessionDep, user_id: UserDep) -> list[CertificateOut]:
    """Купленные пользователем сертификаты."""
    rows = await session.scalars(
        select(Certificate).where(Certificate.buyer_id == user_id).order_by(Certificate.created_at.desc())
    )
    return [CertificateOut.model_validate(c) for c in rows]


@router.post("/certificates/activate")
async def activate(payload: ActivateIn, session: SessionDep, user_id: UserDep) -> BalanceOut:
    """Активация сертификата: номинал зачисляется на баланс."""
    await activate_certificate(session, user_id, payload.code)
    return BalanceOut(balance_kzt=await ledger.get_balance(session, user_id))
