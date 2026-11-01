from functools import lru_cache

from typing import Optional

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "JobPilot AI API"
    app_mode: str = "demo"
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000"
    database_url: str = "postgresql+psycopg://jobpilot:jobpilot@localhost:5432/jobpilot"
    redis_url: str = "redis://localhost:6379/0"
    gmail_initial_sync_days: int = Field(default=60, ge=1, le=60)
    google_client_id: Optional[str] = None
    google_client_secret: Optional[SecretStr] = None
    google_redirect_uri: Optional[str] = None
    frontend_app_url: str = "http://localhost:3000"
    openai_api_key: Optional[SecretStr] = None
    stripe_secret_key: Optional[SecretStr] = None
    stripe_webhook_secret: Optional[SecretStr] = None
    razorpay_key_id: Optional[str] = None
    razorpay_key_secret: Optional[SecretStr] = None
    n8n_webhook_url: Optional[str] = None
    n8n_webhook_secret: Optional[SecretStr] = None
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_access_token: Optional[SecretStr] = None
    whatsapp_verify_token: Optional[SecretStr] = None
    app_secret_key: Optional[SecretStr] = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
