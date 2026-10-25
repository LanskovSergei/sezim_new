"""Доступность: ячейки рабочего времени и поиск «сначала время».

Расписание психолога разворачивается в 30-минутные ячейки. Старт сессии
свободен, если от него подряд идут N ячеек (2 — индивидуальная,
3 — парная) и интервал не пересекается с активной записью.
"""

import logging
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Select, Subquery, and_, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    AvailabilityCell,
    AvailabilityException,
    AvailabilityRule,
    Booking,
    BookingStatus,
    Psychologist,
    SessionFormat,
)
from app.schemas import AvailabilityBucket, PsychologistMatch, TimeWindow
from app.services.matching import MatchCriteria, score

logger = logging.getLogger(__name__)

MAX_STARTS_PER_CARD = 6


@dataclass(frozen=True, slots=True)
class FormatSpec:
    """Параметры формата сессии.

    Attributes:
        session: Длительность самой сессии.
        cells: Сколько ячеек занимает сессия вместе с перерывом.
        occupied: Занятое время (cells × длина ячейки).
    """

    session: timedelta
    cells: int
    occupied: timedelta


def format_spec(session_format: SessionFormat) -> FormatSpec:
    """Возвращает параметры формата из настроек.

    Args:
        session_format: Формат сессии.

    Returns:
        FormatSpec: Длительности формата.
    """
    s = get_settings()
    match session_format:
        case SessionFormat.INDIVIDUAL:
            minutes, cells = s.individual_session_minutes, s.individual_cells
        case SessionFormat.COUPLE:
            minutes, cells = s.couple_session_minutes, s.couple_cells
    return FormatSpec(
        session=timedelta(minutes=minutes),
        cells=cells,
        occupied=timedelta(minutes=cells * s.cell_minutes),
    )


def utcnow() -> datetime:
    """Текущее время в UTC.

    Returns:
        datetime: Aware-datetime в UTC.
    """
    return datetime.now(timezone.utc)


def earliest_start(now: datetime) -> datetime:
    """Самый ранний допустимый старт с учётом минимального запаса.

    Args:
        now: Текущее время.

    Returns:
        datetime: Нижняя граница старта.
    """
    return now + timedelta(minutes=get_settings().min_lead_minutes)


def active_booking(now: datetime) -> ColumnElement[bool]:
    """Запись реально занимает время: подтверждена или холд не истёк.

    Args:
        now: Текущее время.

    Returns:
        ColumnElement[bool]: SQL-условие.
    """
    return or_(
        Booking.status == BookingStatus.CONFIRMED,
        and_(Booking.status == BookingStatus.HELD, Booking.hold_expires_at > now),
    )


def free_starts_subquery(
    psychologists: Select[tuple[uuid.UUID]],
    spec: FormatSpec,
    now: datetime,
    range_start: datetime,
    range_end: datetime,
) -> Subquery:
    """Свободные старты (pid, starts_at) для набора психологов за период.

    Алгоритм без коррелированных подзапросов:
    1. записи разворачиваются в занятые ячейки (generate_series);
    2. занятые ячейки вычитаются из рабочих хеш-соединением;
    3. lead() проверяет, что следующие N-1 свободных ячеек идут подряд.

    Args:
        psychologists: SELECT идентификаторов психологов.
        spec: Параметры формата.
        now: Текущее время.
        range_start: Начало периода стартов.
        range_end: Конец периода стартов.

    Returns:
        Subquery: Колонки pid, starts_at.
    """
    cell = timedelta(minutes=get_settings().cell_minutes)
    max_occupied = timedelta(minutes=get_settings().cell_minutes * get_settings().couple_cells)
    psy = psychologists.cte("psy")
    busy = (
        select(
            Booking.psychologist_id.label("pid"),
            func.generate_series(func.lower(Booking.period), func.upper(Booking.period) - cell, cell).label("cell"),
        )
        .join(psy, psy.c.id == Booking.psychologist_id)
        .where(
            active_booking(now),
            Booking.starts_at > range_start - max_occupied,
            Booking.starts_at < range_end + spec.occupied,
        )
        .cte("busy")
    )
    free = (
        select(
            AvailabilityCell.psychologist_id.label("pid"),
            AvailabilityCell.starts_at.label("starts_at"),
            func.lead(AvailabilityCell.starts_at, spec.cells - 1)
            .over(partition_by=AvailabilityCell.psychologist_id, order_by=AvailabilityCell.starts_at)
            .label("chain_end"),
        )
        .join(psy, psy.c.id == AvailabilityCell.psychologist_id)
        .outerjoin(
            busy,
            and_(busy.c.pid == AvailabilityCell.psychologist_id, busy.c.cell == AvailabilityCell.starts_at),
        )
        .where(
            busy.c.pid.is_(None),
            AvailabilityCell.starts_at >= range_start,
            AvailabilityCell.starts_at < range_end + spec.occupied,
        )
        .cte("free")
    )
    return (
        select(free.c.pid, free.c.starts_at)
        .where(
            free.c.chain_end == free.c.starts_at + cell * (spec.cells - 1),
            free.c.starts_at >= max(range_start, earliest_start(now)),
            free.c.starts_at < range_end,
        )
        .subquery("free_starts")
    )


def generate_cell_starts(
    rules: Iterable[tuple[int, time, time]],
    blocked: Sequence[tuple[datetime, datetime]],
    tz: ZoneInfo,
    now: datetime,
    horizon: datetime,
    cell_minutes: int,
) -> list[datetime]:
    """Разворачивает недельный шаблон в начала ячеек (UTC).

    Args:
        rules: Кортежи (weekday, start_local, end_local).
        blocked: Интервалы исключений в UTC.
        tz: Часовой пояс психолога.
        now: Нижняя граница генерации.
        horizon: Верхняя граница генерации.
        cell_minutes: Длина ячейки.

    Returns:
        list[datetime]: Отсортированные начала ячеек в UTC.
    """
    step = timedelta(minutes=cell_minutes)
    by_weekday: dict[int, list[tuple[time, time]]] = defaultdict(list)
    for weekday, start, end in rules:
        by_weekday[weekday].append((start, end))

    result: set[datetime] = set()
    day = now.astimezone(tz).date()
    last_day = horizon.astimezone(tz).date()
    while day <= last_day:
        for start, end in by_weekday.get(day.weekday(), []):
            cursor = datetime.combine(day, start, tzinfo=tz)
            limit = datetime.combine(day, end, tzinfo=tz)
            while cursor + step <= limit:
                utc_start = cursor.astimezone(timezone.utc)
                utc_end = utc_start + step
                is_blocked = any(b_start < utc_end and utc_start < b_end for b_start, b_end in blocked)
                if now < utc_start < horizon and not is_blocked:
                    result.add(utc_start)
                cursor += step
        day += timedelta(days=1)
    return sorted(result)


async def materialize_cells(session: AsyncSession, psychologist_id: uuid.UUID) -> int:
    """Синхронизирует будущие ячейки с расписанием. Не коммитит.

    Существующие записи не затрагиваются: занятость хранится в bookings.

    Args:
        session: Сессия БД.
        psychologist_id: Психолог.

    Returns:
        int: Количество ячеек в актуальной сетке.

    Raises:
        LookupError: Если психолог не найден.
    """
    settings = get_settings()
    psychologist = await session.get(Psychologist, psychologist_id)
    if psychologist is None:
        raise LookupError(f"Психолог {psychologist_id} не найден")

    now = utcnow()
    rules = await session.execute(
        select(AvailabilityRule.weekday, AvailabilityRule.start_local, AvailabilityRule.end_local).where(
            AvailabilityRule.psychologist_id == psychologist_id
        )
    )
    exceptions = await session.execute(
        select(AvailabilityException.starts_at, AvailabilityException.ends_at).where(
            AvailabilityException.psychologist_id == psychologist_id,
            AvailabilityException.ends_at > now,
        )
    )
    starts = generate_cell_starts(
        rules=[tuple(r) for r in rules],
        blocked=[tuple(e) for e in exceptions],
        tz=ZoneInfo(psychologist.timezone),
        now=now,
        horizon=now + timedelta(days=settings.materialize_days),
        cell_minutes=settings.cell_minutes,
    )
    if starts:
        await session.execute(
            insert(AvailabilityCell)
            .values([{"psychologist_id": psychologist_id, "starts_at": s} for s in starts])
            .on_conflict_do_nothing()
        )
    await session.execute(
        delete(AvailabilityCell).where(
            AvailabilityCell.psychologist_id == psychologist_id,
            AvailabilityCell.starts_at > now,
            AvailabilityCell.starts_at.not_in(starts),
        )
    )
    logger.info("Сетка психолога %s: %d ячеек", psychologist_id, len(starts))
    return len(starts)


async def is_start_available(
    session: AsyncSession,
    psychologist_id: uuid.UUID,
    starts_at: datetime,
    spec: FormatSpec,
) -> bool:
    """Проверяет, что старт попадает в рабочее время (ячейки подряд).

    Пересечение с другими записями дополнительно гарантирует
    exclusion constraint при вставке.

    Args:
        session: Сессия БД.
        psychologist_id: Психолог.
        starts_at: Желаемый старт.
        spec: Параметры формата.

    Returns:
        bool: True, если время рабочее и не раньше минимального запаса.
    """
    if starts_at < earliest_start(utcnow()):
        return False
    cell = timedelta(minutes=get_settings().cell_minutes)
    expected = [starts_at + cell * i for i in range(spec.cells)]
    found = await session.scalar(
        select(func.count()).where(
            AvailabilityCell.psychologist_id == psychologist_id,
            AvailabilityCell.starts_at.in_(expected),
        )
    )
    return found == spec.cells


async def availability_calendar(
    session: AsyncSession,
    criteria: MatchCriteria,
    date_from: datetime,
    date_to: datetime,
) -> list[AvailabilityBucket]:
    """Календарь «когда есть подходящие психологи» — шаг 2 флоу.

    Args:
        session: Сессия БД.
        criteria: Критерии из анкеты.
        date_from: Начало периода.
        date_to: Конец периода.

    Returns:
        list[AvailabilityBucket]: Старт и число свободных подходящих психологов.
    """
    now = utcnow()
    psychologists = select(Psychologist.id).where(*criteria.sql_filters())
    fs = free_starts_subquery(psychologists, format_spec(criteria.format), now, date_from, date_to)
    stmt = select(fs.c.starts_at, func.count(func.distinct(fs.c.pid))).group_by(fs.c.starts_at).order_by(fs.c.starts_at)
    rows = await session.execute(stmt)
    return [AvailabilityBucket(starts_at=start, psychologists_available=count) for start, count in rows]


async def free_psychologists(
    session: AsyncSession,
    criteria: MatchCriteria,
    windows: Sequence[TimeWindow],
    limit: int = 20,
) -> list[PsychologistMatch]:
    """Психологи, свободные в выбранные окна, по убыванию релевантности — шаг 3.

    Args:
        session: Сессия БД.
        criteria: Критерии из анкеты.
        windows: Окна, удобные клиенту.
        limit: Максимум карточек.

    Returns:
        list[PsychologistMatch]: Отранжированная подборка.
    """
    now = utcnow()
    psychologists = select(Psychologist.id).where(*criteria.sql_filters())
    fs = free_starts_subquery(
        psychologists,
        format_spec(criteria.format),
        now,
        min(w.starts_at for w in windows),
        max(w.ends_at for w in windows),
    )
    in_windows = or_(*(and_(fs.c.starts_at >= w.starts_at, fs.c.starts_at < w.ends_at) for w in windows))
    stmt = (
        select(Psychologist, fs.c.starts_at)
        .join(fs, fs.c.pid == Psychologist.id)
        .where(in_windows)
        .order_by(fs.c.starts_at)
    )
    grouped: dict[uuid.UUID, tuple[Psychologist, list[datetime]]] = {}
    for psychologist, start in await session.execute(stmt):
        grouped.setdefault(psychologist.id, (psychologist, []))[1].append(start)

    matches = [
        PsychologistMatch(
            id=p.id,
            display_name=p.display_name,
            price_kzt=p.price_for(criteria.format) or 0,
            experience_years=p.experience_years,
            rating=p.rating,
            topics=p.topics,
            match_score=score(p, criteria),
            free_starts=starts[:MAX_STARTS_PER_CARD],
        )
        for p, starts in grouped.values()
    ]
    matches.sort(key=lambda m: (-m.match_score, m.free_starts[0]))
    return matches[:limit]


async def psychologist_free_starts(
    session: AsyncSession,
    psychologist_id: uuid.UUID,
    session_format: SessionFormat,
    date_from: datetime,
    date_to: datetime,
) -> list[datetime]:
    """Свободные старты конкретного психолога — ветка «каталог → профиль».

    Args:
        session: Сессия БД.
        psychologist_id: Психолог.
        session_format: Формат сессии.
        date_from: Начало периода.
        date_to: Конец периода.

    Returns:
        list[datetime]: Свободные старты.
    """
    psychologists = select(Psychologist.id).where(Psychologist.id == psychologist_id)
    fs = free_starts_subquery(psychologists, format_spec(session_format), utcnow(), date_from, date_to)
    starts = await session.scalars(select(fs.c.starts_at).order_by(fs.c.starts_at))
    return list(starts)
