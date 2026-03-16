"""
Centralised application settings.

All configuration is read from environment variables (loaded via .env by
docker-compose).  Using pydantic-settings gives us validation at startup –
the app will refuse to boot if a required variable (e.g. SECRET_KEY) is
missing rather than silently using an insecure default.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application-wide configuration sourced from environment variables."""

    # Database
    postgres_user: str = "mozilor"
    postgres_password: str = "mozilor_secret"
    postgres_host: str = "db"
    postgres_port: int = 5432
    postgres_db: str = "mozilor_db"

    # JWT / Auth
    secret_key: str  # required – no default so startup fails if absent
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Cookie settings
    # cookie_secure: set to True in production (requires HTTPS).
    #   False for local dev over plain HTTP – the browser refuses to store
    #   Secure cookies on http://localhost.
    # cookie_samesite: "lax" prevents cross-site POST CSRF while still
    #   allowing normal navigation.  Sufficient for a same-origin SPA.
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    cookie_httponly: bool = True

    # Derived helpers
    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
