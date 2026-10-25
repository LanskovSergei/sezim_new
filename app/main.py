"""Точка входа API sez.im v2.

Запуск: uvicorn app.main:app
"""

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from app.errors import (
    DomainError,
    InsufficientBalanceError,
    InvalidSignatureError,
    NotFoundError,
    PaymentGatewayError,
    PolicyViolationError,
    SlotUnavailableError,
)
from app.routes import client, psychologist, webhooks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="sez.im API", version="2.0.0")
app.include_router(client.router)
app.include_router(psychologist.router)
app.include_router(webhooks.router)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
    """Преобразует доменные ошибки в HTTP-ответы.

    Args:
        _: Запрос.
        exc: Доменная ошибка.

    Returns:
        JSONResponse: Ответ с кодом и описанием.
    """
    match exc:
        case NotFoundError():
            code = status.HTTP_404_NOT_FOUND
        case SlotUnavailableError():
            code = status.HTTP_409_CONFLICT
        case PolicyViolationError() | InsufficientBalanceError():
            code = 422
        case InvalidSignatureError():
            logger.warning("Отклонено уведомление: %s", exc)
            code = status.HTTP_401_UNAUTHORIZED
        case PaymentGatewayError():
            code = status.HTTP_502_BAD_GATEWAY
        case _:
            code = status.HTTP_400_BAD_REQUEST
    return JSONResponse(status_code=code, content={"detail": str(exc)})


@app.get("/health")
async def health() -> dict[str, str]:
    """Проверка живости для Docker/балансировщика."""
    return {"status": "ok"}
