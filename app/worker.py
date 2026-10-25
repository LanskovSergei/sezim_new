"""Фоновые задачи (arq): холды, сетка, напоминания, завершение сессий.

Запуск: arq app.worker.WorkerSettings
"""

import logging
from datetime import timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import select, update

from app.config import get_settings
from app.db import SessionFactory
from app.models import Booking, BookingStatus, Psychologist, User
from app.services.availability import materialize_cells, utcnow
from app.services.booking import release_expired_holds

logger = logging.getLogger(__name__)

REMINDERS: tuple[tuple[str, timedelta], ...] = (
    ("24h", timedelta(hours=24)),
    ("1h", timedelta(hours=1)),
)


class NotificationError(Exception):
    """Ошибка доставки уведомления."""


class Notifier(Protocol):
    """Канал уведомлений (SMS, WhatsApp, push)."""

    async def send(self, phone: str, text: str) -> None:
        """Отправляет сообщение.

        Raises:
            NotificationError: При ошибке доставки.
        """


class LoggingNotifier:
    """Заглушка канала: пишет уведомления в лог."""

    async def send(self, phone: str, text: str) -> None:
        """Логирует сообщение вместо отправки.

        Args:
            phone: Телефон получателя.
            text: Текст сообщения.
        """
        logger.info("[notify] %s: %s", phone, text)


async def startup(ctx: dict[str, Any]) -> None:
    """Инициализирует зависимости воркера.

    Args:
        ctx: Контекст arq.
    """
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ctx["notifier"] = LoggingNotifier()


async def release_holds_job(ctx: dict[str, Any]) -> int:
    """Освобождает истёкшие холды и возвращает баланс (каждую минуту).

    Args:
        ctx: Контекст arq.

    Returns:
        int: Количество истёкших холдов.
    """
    async with SessionFactory() as session:
        return await release_expired_holds(session)


async def complete_sessions_job(ctx: dict[str, Any]) -> int:
    """Переводит прошедшие сессии в COMPLETED (каждые 10 минут).

    Args:
        ctx: Контекст arq.

    Returns:
        int: Количество завершённых записей.
    """
    async with SessionFactory() as session:
        result = await session.execute(
            update(Booking)
            .where(Booking.status == BookingStatus.CONFIRMED, Booking.session_ends_at < utcnow() - timedelta(hours=1))
            .values(status=BookingStatus.COMPLETED)
            .execution_options(synchronize_session=False)
        )
        await session.commit()
    return result.rowcount


async def materialize_all_job(ctx: dict[str, Any]) -> int:
    """Продлевает сетку всех активных психологов (раз в сутки).

    Args:
        ctx: Контекст arq.

    Returns:
        int: Суммарное количество ячеек.
    """
    total = 0
    async with SessionFactory() as session:
        ids = (await session.scalars(select(Psychologist.id).where(Psychologist.is_active.is_(True)))).all()
        for psychologist_id in ids:
            try:
                total += await materialize_cells(session, psychologist_id)
            except LookupError:
                logger.exception("Психолог %s исчез во время материализации", psychologist_id)
        await session.commit()
    return total


async def send_reminders_job(ctx: dict[str, Any]) -> int:
    """Напоминания за 24 ч и за 1 ч до сессии (каждые 5 минут).

    Args:
        ctx: Контекст arq.

    Returns:
        int: Количество отправленных напоминаний.
    """
    notifier: Notifier = ctx["notifier"]
    tz = ZoneInfo(get_settings().default_timezone)
    now = utcnow()
    sent = 0
    async with SessionFactory() as session:
        for tag, lead in REMINDERS:
            rows = await session.execute(
                select(Booking, User.phone)
                .join(User, User.id == Booking.client_id)
                .where(
                    Booking.status == BookingStatus.CONFIRMED,
                    Booking.starts_at > now,
                    Booking.starts_at <= now + lead,
                    ~Booking.reminders_sent.contains([tag]),
                )
            )
            for booking, phone in rows:
                local = booking.starts_at.astimezone(tz)
                try:
                    await notifier.send(phone, f"sez.im: сессия {local:%d.%m в %H:%M}. Вход — в личном кабинете.")
                except NotificationError:
                    logger.exception("Не удалось отправить напоминание %s по записи %s", tag, booking.id)
                    continue
                booking.reminders_sent = [*booking.reminders_sent, tag]
                sent += 1
        await session.commit()
    return sent


class WorkerSettings:
    """Конфигурация воркера arq."""

    on_startup = startup
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    cron_jobs = [
        cron(release_holds_job, second={0}),
        cron(send_reminders_job, minute=set(range(0, 60, 5)), second={10}),
        cron(complete_sessions_job, minute=set(range(0, 60, 10)), second={20}),
        cron(materialize_all_job, hour={0}, minute={30}),
    ]
