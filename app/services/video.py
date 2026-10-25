"""Видеосессии на LiveKit: токены доступа и учёт входа участников."""

import logging
import uuid
from datetime import datetime, timedelta

from livekit import api
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.errors import InvalidSignatureError, NotFoundError, PolicyViolationError
from app.models import Booking, BookingStatus, Psychologist, User
from app.schemas import VideoTokenOut
from app.services.availability import utcnow

logger = logging.getLogger(__name__)

ROOM_PREFIX = "booking-"


def room_name(booking_id: uuid.UUID) -> str:
    """Имя комнаты для записи.

    Args:
        booking_id: Запись.

    Returns:
        str: Имя комнаты.
    """
    return f"{ROOM_PREFIX}{booking_id}"


def room_window(booking: Booking) -> tuple[datetime, datetime]:
    """Интервал, когда в комнату можно войти.

    Args:
        booking: Запись.

    Returns:
        tuple[datetime, datetime]: (открытие, закрытие).
    """
    s = get_settings()
    return (
        booking.starts_at - timedelta(minutes=s.video_open_before_minutes),
        booking.session_ends_at + timedelta(minutes=s.video_close_after_minutes),
    )


async def issue_video_token(session: AsyncSession, booking_id: uuid.UUID, user_id: uuid.UUID) -> VideoTokenOut:
    """Выдаёт токен LiveKit клиенту или психологу записи.

    Args:
        session: Сессия БД.
        booking_id: Запись.
        user_id: Пользователь.

    Returns:
        VideoTokenOut: Адрес сервера, комната и токен.

    Raises:
        NotFoundError: Если пользователь не участник записи.
        PolicyViolationError: Если комната ещё закрыта или уже закрыта.
    """
    row = (
        await session.execute(
            select(Booking, Psychologist.user_id)
            .join(Psychologist, Psychologist.id == Booking.psychologist_id)
            .where(Booking.id == booking_id)
        )
    ).one_or_none()
    if row is None or user_id not in (row[0].client_id, row[1]):
        raise NotFoundError("Запись не найдена")
    booking: Booking = row[0]
    if booking.status != BookingStatus.CONFIRMED:
        raise PolicyViolationError("Запись не подтверждена")

    opens, closes = room_window(booking)
    now = utcnow()
    if not opens <= now <= closes:
        raise PolicyViolationError(f"Комната открывается в {opens:%H:%M} UTC")

    name = await session.scalar(select(User.name).where(User.id == user_id))
    s = get_settings()
    token = (
        api.AccessToken(s.livekit_api_key, s.livekit_api_secret.get_secret_value())
        .with_identity(str(user_id))
        .with_name(name or "Участник")
        .with_grants(api.VideoGrants(room_join=True, room=room_name(booking.id)))
        .with_ttl(closes - now)
        .to_jwt()
    )
    return VideoTokenOut(url=s.livekit_url, room=room_name(booking.id), token=token)


async def handle_livekit_webhook(session: AsyncSession, body: str, auth_header: str) -> None:
    """Фиксирует вход участников в комнату (для споров и выплат).

    Args:
        session: Сессия БД.
        body: Тело запроса.
        auth_header: Заголовок Authorization от LiveKit.

    Raises:
        InvalidSignatureError: Если подпись неверна.
    """
    s = get_settings()
    receiver = api.WebhookReceiver(api.TokenVerifier(s.livekit_api_key, s.livekit_api_secret.get_secret_value()))
    try:
        event = receiver.receive(body, auth_header)
    except Exception as exc:  # noqa: BLE001 — SDK бросает разные типы при неверной подписи
        raise InvalidSignatureError("LiveKit: неверная подпись") from exc

    if event.event != "participant_joined" or not event.room.name.startswith(ROOM_PREFIX):
        return
    try:
        booking_id = uuid.UUID(event.room.name.removeprefix(ROOM_PREFIX))
        user_id = uuid.UUID(event.participant.identity)
    except ValueError:
        logger.warning("LiveKit: неизвестная комната или участник %s", event.room.name)
        return

    row = (
        await session.execute(
            select(Booking, Psychologist.user_id)
            .join(Psychologist, Psychologist.id == Booking.psychologist_id)
            .where(Booking.id == booking_id)
            .with_for_update(of=Booking)
        )
    ).one_or_none()
    if row is None:
        return
    booking, psychologist_user_id = row
    now = utcnow()
    if user_id == booking.client_id and booking.client_joined_at is None:
        booking.client_joined_at = now
    elif user_id == psychologist_user_id and booking.psychologist_joined_at is None:
        booking.psychologist_joined_at = now
    await session.commit()
