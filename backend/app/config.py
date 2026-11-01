from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "JobPilot AI API"
    app_mode: str = "demo"
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:3000"
    database_url: str = "postgresql+psycopg://jobpilot:jobpilot@localhost:5432/jobpilot"
    redis_url: str = "redis://localhost:6379/0"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
