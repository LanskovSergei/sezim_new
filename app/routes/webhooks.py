"""Входящие уведомления: платёжные провайдеры, LiveKit, видео-токены."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, Request, Response

from app.deps import SessionDep, UserDep
from app.models import PaymentProvider
from app.payments import get_gateway
from app.schemas import OkOut, VideoTokenOut
from app.services.payment_events import apply_payment_event
from app.services.video import handle_livekit_webhook, issue_video_token

router = APIRouter(prefix="/v1", tags=["integrations"])


@router.api_route("/payments/{provider}/webhook", methods=["GET", "POST"])
async def payment_webhook(provider: PaymentProvider, request: Request, session: SessionDep) -> Response:
    """Принимает уведомление провайдера (query или form), отвечает в его формате."""
    params = dict(request.query_params)
    if request.method == "POST":
        params.update({k: str(v) for k, v in (await request.form()).items()})
    gateway = get_gateway(provider)
    event = gateway.parse_webhook(params)
    await apply_payment_event(session, provider, event)
    return gateway.ack(event)


@router.post("/video/webhook")
async def livekit_webhook(
    request: Request,
    session: SessionDep,
    authorization: Annotated[str, Header()],
) -> OkOut:
    """События LiveKit (вход участников)."""
    await handle_livekit_webhook(session, (await request.body()).decode(), authorization)
    return OkOut()


@router.post("/bookings/{booking_id}/video-token")
async def video_token(booking_id: uuid.UUID, session: SessionDep, user_id: UserDep) -> VideoTokenOut:
    """Токен входа в комнату для клиента или психолога."""
    return await issue_video_token(session, booking_id, user_id)
