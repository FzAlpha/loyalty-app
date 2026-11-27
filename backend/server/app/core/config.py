"""Env loader (plan §1.3, §3.1). Fails fast when a required variable is missing."""
from functools import lru_cache

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    SUPABASE_URL: HttpUrl
    SUPABASE_ANON_KEY: str = Field(min_length=1)
    SUPABASE_SERVICE_ROLE_KEY: str = Field(min_length=1)
    DATABASE_URL: str = Field(min_length=1)
    DB_POOL_MIN: int = Field(default=1, ge=0)
    DB_POOL_MAX: int = Field(default=10, ge=1)
    # Comma-separated list of allowed browser origins. Empty = no browser origin allowed.
    CORS_ALLOWED_ORIGINS: str = ""
    # Optional: unset = jobs-runner refuses all calls. Length is checked in jobs-runner.
    JOBS_RUNNER_SECRET: str | None = None
    AUTH_HTTP_TIMEOUT: float = Field(default=10, gt=0)
    LOG_LEVEL: str = "info"

    @property
    def auth_url(self) -> str:
        return str(self.SUPABASE_URL).rstrip("/") + "/auth/v1"

    @property
    def allowed_origins(self) -> list[str]:
        return [s.strip() for s in self.CORS_ALLOWED_ORIGINS.split(",") if s.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
