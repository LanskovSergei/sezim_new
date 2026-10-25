"""Кабинет психолога."""

from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import delete, select

from app.deps import PsychologistDep, SessionDep
from app.models import AvailabilityRule, Booking, BookingStatus
from app.schemas import AvailabilityRuleIn, BookingOut
from app.services.availability import materialize_cells, utcnow

router = APIRouter(prefix="/v1/psychologist/me", tags=["psychologist"])


@router.put("/availability")
async def replace_availability(
    rules: list[AvailabilityRuleIn],
    session: SessionDep,
    psychologist_id: PsychologistDep,
) -> dict[str, int]:
    """Заменяет недельное расписание и сразу пересобирает сетку."""
    await session.execute(delete(AvailabilityRule).where(AvailabilityRule.psychologist_id == psychologist_id))
    session.add_all(AvailabilityRule(psychologist_id=psychologist_id, **r.model_dump()) for r in rules)
    await session.flush()
    cells = await materialize_cells(session, psychologist_id)
    await session.commit()
    return {"cells": cells}


@router.get("/sessions")
async def my_sessions(session: SessionDep, psychologist_id: PsychologistDep, days: int = 7) -> list[BookingOut]:
    """Ближайшие подтверждённые сессии — один индексный запрос."""
    now = utcnow()
    rows = await session.scalars(
        select(Booking)
        .where(
            Booking.psychologist_id == psychologist_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.session_ends_at >= now,
            Booking.starts_at < now + timedelta(days=min(days, 31)),
        )
        .order_by(Booking.starts_at)
    )
    return [BookingOut.model_validate(b) for b in rows]
