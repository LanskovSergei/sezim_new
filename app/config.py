"""Конфигурация приложения sez.im."""

from functools import lru_cache

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки из переменных окружения с префиксом SEZIM_."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="SEZIM_", extra="ignore")

    database_url: str = "postgresql+asyncpg://sezim:sezim@localhost:5432/sezim"
    redis_url: str = "redis://localhost:6379/0"
    public_base_url: str = "https://sez.im"

    # Сетка и длительности (минуты).
    cell_minutes: int = 30
    individual_session_minutes: int = 50
    individual_cells: int = 2
    couple_session_minutes: int = 80
    couple_cells: int = 3
    hold_minutes: int = 15
    min_lead_minutes: int = 120
    materialize_days: int = 56
    default_timezone: str = "Asia/Almaty"

    # Веса ранжирования (сумма = 1).
    weight_topics: float = 0.6
    weight_experience: float = 0.2
    weight_rating: float = 0.2

    # Сертификаты.
    certificate_min_kzt: int = 5_000
    certificate_max_kzt: int = 500_000
    certificate_valid_days: int = 365

    # Robokassa.
    robokassa_login: str = ""
    robokassa_password1: SecretStr = SecretStr("")
    robokassa_password2: SecretStr = SecretStr("")
    robokassa_url: str = "https://auth.robokassa.ru/Merchant/Index.aspx"
    robokassa_currency: str | None = "KZT"
    robokassa_test: bool = True

    # FreedomPay.
    freedompay_merchant_id: str = ""
    freedompay_secret: SecretStr = SecretStr("")
    freedompay_url: str = "https://api.freedompay.kz/init_payment.php"
    freedompay_test: bool = True

    # LiveKit.
    livekit_url: str = "wss://video.sez.im"
    livekit_api_key: str = "devkey"
    livekit_api_secret: SecretStr = SecretStr("secret-change-me-at-least-32-chars")
    video_open_before_minutes: int = 10
    video_close_after_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    """Возвращает кэшированный экземпляр настроек.

    Returns:
        Settings: Настройки приложения.
    """
    return Settings()
