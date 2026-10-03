from decimal import Decimal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://locim:locim@localhost:5432/locim"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 60 * 24 * 7
    groq_api_key: str = ""
    groq_model: str = "openai/gpt-oss-120b"
    cors_origins: str = "http://localhost:3000"
    frontend_url: str = "http://localhost:3000"
    default_currency: str = "PHP"
    max_active_projects: int = 3  # per freelancer; a project stops counting once every milestone is paid (COMPLETED)
    platform_fee_rate: Decimal = Decimal("0.10")  # added on top of each milestone; covers PayPal fees + LOCIM
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_base_url: str = "https://api-m.sandbox.paypal.com"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
