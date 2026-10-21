import os
from urllib.parse import unquote, urlparse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from core.config import settings


def ensure_database_exists() -> None:
    """Ensure database exists for MySQL / PostgreSQL or skip for SQLite."""
    db_url = settings.DATABASE_URL
    parsed = urlparse(db_url)

    if parsed.scheme in {"sqlite", ""}:
        return

    if parsed.scheme in {"mysql", "mysql+pymysql"}:
        database_name = parsed.path.lstrip("/")
        if not database_name:
            return
        try:
            import pymysql
            connection = pymysql.connect(
                host=parsed.hostname or "127.0.0.1",
                port=parsed.port or 3306,
                user=unquote(parsed.username or ""),
                password=unquote(parsed.password or ""),
                connect_timeout=3,
            )
            try:
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"CREATE DATABASE IF NOT EXISTS `{database_name}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                    )
                connection.commit()
            finally:
                connection.close()
        except Exception as e:
            print(f"[DATABASE] MySQL unavailable or login failed ({e}). Switching to local SQLite.")
            settings.DATABASE_URL = "sqlite:///./offline_payments.db"


ensure_database_exists()

if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=3600,
        pool_size=10,
        max_overflow=20,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
