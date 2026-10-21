import os
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    PROJECT_NAME: str = "Offline Payment System with Double-Spend Protection"
    API_V1_STR: str = "/api"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "offline_payment_system_super_secret_jwt_key_2026_dev")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 day

    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./offline_payments.db")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEMO_FUNDING_ENABLED: bool = os.getenv("DEMO_FUNDING_ENABLED", "true").lower() == "true"
    DEMO_FUNDING_MAX_AMOUNT: int = int(os.getenv("DEMO_FUNDING_MAX_AMOUNT", "1000000"))

    KEYS_DIR: Path = BASE_DIR / "keys"

    model_config = {"env_file": ".env", "extra": "allow"}


settings = Settings()
settings.KEYS_DIR.mkdir(parents=True, exist_ok=True)
