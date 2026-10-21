import os
from pathlib import Path


def _test_database_url() -> str:
    configured = os.environ.get("TEST_DATABASE_URL")
    if configured:
        return configured
    configured_db = os.environ.get("DATABASE_URL")
    if configured_db and "mysql" in configured_db:
        # Check if caller explicitly requested mysql testing
        if os.environ.get("USE_MYSQL_TEST"):
            base_url, database_name = configured_db.rsplit("/", 1)
            if database_name.endswith("_test"):
                return configured_db
            return f"{base_url}/{database_name}_test"
    # Fast, isolated SQLite test database for reliable offline testing
    return "sqlite:///./test_offline_payments.db"


# Must run before any test imports core.database or main
os.environ["DATABASE_URL"] = _test_database_url()
