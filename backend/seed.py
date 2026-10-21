from datetime import datetime, timezone
from sqlalchemy import text
from core.database import SessionLocal, Base, engine
from core.config import settings
from core.security import get_password_hash
from core.crypto import get_or_create_bank_keys
from models import (
    User, Wallet, RiskTier, LedgerEntry
)


def seed_database(reset: bool = False):
    """
    Seeds initial risk tiers, demo accounts, wallets, and initial balances.
    If reset is True, drops all existing tables safely (disabling FK checks on MySQL).
    """
    # Ensure bank keys exist
    get_or_create_bank_keys()

    if reset:
        print("[SEED] Dropping existing database tables...")
        with engine.begin() as conn:
            if "mysql" in settings.DATABASE_URL:
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
            Base.metadata.drop_all(bind=conn)
            if "mysql" in settings.DATABASE_URL:
                conn.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))

    print("[SEED] Creating tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(User).first():
            print("[SEED] Database already contains records. Skipping seed.")
            return

        now = datetime.now(timezone.utc)

        # 1. Create Risk Tiers
        low_risk = RiskTier(
            name="Low Risk",
            max_reserve_amount=500000,    # ₹5,000 in paise
            max_per_payment_limit=200000, # ₹2,000 in paise
            description="Established account with positive verification history."
        )
        med_risk = RiskTier(
            name="Medium Risk",
            max_reserve_amount=200000,    # ₹2,000 in paise
            max_per_payment_limit=50000,  # ₹500 in paise
            description="Standard tier for regular accounts."
        )
        high_risk = RiskTier(
            name="High Risk",
            max_reserve_amount=50000,     # ₹500 in paise
            max_per_payment_limit=10000,  # ₹100 in paise
            description="New or flagged account with restricted offline limits."
        )

        db.add_all([low_risk, med_risk, high_risk])
        db.flush()

        # 2. Demo Users
        default_pwd_hash = get_password_hash("DemoPass123!")

        demo_users = [
            User(
                username="customer1",
                email="customer1@offlinepay.local",
                hashed_password=default_pwd_hash,
                role="customer",
                risk_tier_id=med_risk.id,
                is_active=True,
                created_at=now
            ),
            User(
                username="customer2",
                email="customer2@offlinepay.local",
                hashed_password=default_pwd_hash,
                role="customer",
                risk_tier_id=low_risk.id,
                is_active=True,
                created_at=now
            ),
            User(
                username="merchant",
                email="merchant@offlinepay.local",
                hashed_password=default_pwd_hash,
                role="merchant",
                risk_tier_id=low_risk.id,
                is_active=True,
                created_at=now
            ),
            User(
                username="analyst",
                email="analyst@offlinepay.local",
                hashed_password=default_pwd_hash,
                role="analyst",
                risk_tier_id=low_risk.id,
                is_active=True,
                created_at=now
            ),
        ]

        db.add_all(demo_users)
        db.flush()

        # 3. Create Wallets and Initial Ledger Movements
        # customer1: ₹10,000 (1,000,000 paise)
        # customer2: ₹10,000 (1,000,000 paise)
        # merchant:  ₹2,000 (200,000 paise)
        # analyst:   ₹0
        initial_balances = {
            "customer1": 1000000,
            "customer2": 1000000,
            "merchant": 200000,
            "analyst": 0,
        }

        for u in demo_users:
            balance = initial_balances.get(u.username, 0)
            wallet = Wallet(
                user_id=u.id,
                total_balance=balance,
                available_balance=balance,
                reserved_balance=0,
                updated_at=now
            )
            db.add(wallet)
            db.flush()

            if balance > 0:
                ledger = LedgerEntry(
                    wallet_id=wallet.id,
                    entry_type="INITIAL_DEPOSIT",
                    amount=balance,
                    balance_before=0,
                    balance_after=balance,
                    reference_type="SYSTEM",
                    reference_id="SEED_INIT",
                    description=f"Initial seeded demo balance of INR {balance/100:.2f}",
                    created_at=now
                )
                db.add(ledger)

        db.commit()
        print("[SEED] Successfully seeded demo accounts, risk tiers, and initial wallets.")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database(reset=True)
