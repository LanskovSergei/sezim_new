"""Общие FastAPI-зависимости."""

import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Psychologist


async def current_user_id(x_user_id: Annotated[uuid.UUID, Header()]) -> uuid.UUID:
    """Заглушка аутентификации.

    TODO: заменить на проверку JWT, выданного после OTP-входа по SMS.

    Args:
        x_user_id: Идентификатор пользователя из заголовка.

    Returns:
        uuid.UUID: Идентификатор пользователя.
    """
    return x_user_id


SessionDep = Annotated[AsyncSession, Depends(get_session)]
UserDep = Annotated[uuid.UUID, Depends(current_user_id)]


async def current_psychologist_id(session: SessionDep, user_id: UserDep) -> uuid.UUID:
    """Профиль психолога текущего пользователя.

    Args:
        session: Сессия БД.
        user_id: Пользователь.

    Returns:
        uuid.UUID: Идентификатор психолога.

    Raises:
        HTTPException: 403, если пользователь не психолог.
    """
    psychologist_id = await session.scalar(select(Psychologist.id).where(Psychologist.user_id == user_id))
    if psychologist_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Доступно только психологам")
    return psychologist_id


PsychologistDep = Annotated[uuid.UUID, Depends(current_psychologist_id)]
