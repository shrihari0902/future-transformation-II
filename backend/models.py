from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from core.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class RiskTier(Base):
    __tablename__ = "risk_tiers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False)
    max_reserve_amount = Column(Integer, nullable=False)  # in paise
    max_per_payment_limit = Column(Integer, nullable=False)  # in paise
    description = Column(String(255), nullable=True)

    users = relationship("User", back_populates="risk_tier")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="customer")  # customer, merchant, analyst
    risk_tier_id = Column(Integer, ForeignKey("risk_tiers.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

    risk_tier = relationship("RiskTier", back_populates="users")
    wallet = relationship("Wallet", back_populates="user", uselist=False)
    devices = relationship("Device", back_populates="user")
    reserves = relationship("Reserve", back_populates="user")
    certificates = relationship("AllowanceCertificate", back_populates="user")
    disputes = relationship("Dispute", back_populates="requesting_user")


class Wallet(Base):
    __tablename__ = "wallets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    total_balance = Column(Integer, default=0, nullable=False)      # in paise
    available_balance = Column(Integer, default=0, nullable=False)  # in paise
    reserved_balance = Column(Integer, default=0, nullable=False)   # in paise
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    user = relationship("User", back_populates="wallet")
    reserves = relationship("Reserve", back_populates="wallet")
    ledger_entries = relationship("LedgerEntry", back_populates="wallet")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    public_key_spki = Column(Text, nullable=False)  # Base64 SPKI
    device_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    registered_at = Column(DateTime, default=utc_now)

    user = relationship("User", back_populates="devices")


class Reserve(Base):
    __tablename__ = "reserves"

    id = Column(Integer, primary_key=True, index=True)
    reserve_id = Column(String(64), unique=True, index=True, nullable=False)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)               # in paise
    remaining_allowance = Column(Integer, nullable=False)  # in paise
    status = Column(String(20), default="ACTIVE")          # ACTIVE, DEPLETED, RELEASED, EXPIRED
    created_at = Column(DateTime, default=utc_now)
    expires_at = Column(DateTime, nullable=False)

    wallet = relationship("Wallet", back_populates="reserves")
    user = relationship("User", back_populates="reserves")
    certificate = relationship("AllowanceCertificate", back_populates="reserve", uselist=False)
    settlements = relationship("Settlement", back_populates="reserve")


class AllowanceCertificate(Base):
    __tablename__ = "allowance_certificates"

    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(String(64), unique=True, index=True, nullable=False)
    reserve_id = Column(Integer, ForeignKey("reserves.id"), unique=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    device_id = Column(String(64), nullable=False)
    reserve_amount = Column(Integer, nullable=False)    # in paise
    max_per_payment = Column(Integer, nullable=False)   # in paise
    issued_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    signature = Column(Text, nullable=False)            # Bank signature in base64
    raw_payload_json = Column(Text, nullable=False)

    reserve = relationship("Reserve", back_populates="certificate")
    user = relationship("User", back_populates="certificates")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        UniqueConstraint('payer_device_id', 'counter', name='uq_device_counter'),
    )

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(64), unique=True, index=True, nullable=False)
    certificate_id = Column(String(64), nullable=False, index=True)
    payer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    payer_device_id = Column(String(64), nullable=False, index=True)
    payee_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    amount = Column(Integer, nullable=False)            # in paise
    nonce = Column(String(64), unique=True, index=True, nullable=False)
    counter = Column(Integer, nullable=False)
    status = Column(String(30), default="PENDING")      # PENDING, ACCEPTED_OFFLINE, SETTLED, FLAGGED, REJECTED
    flag_reason = Column(String(255), nullable=True)
    issued_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utc_now)
    settled_at = Column(DateTime, nullable=True)

    token_evidence = relationship("TokenEvidence", back_populates="transaction", uselist=False)
    receipt = relationship("Receipt", back_populates="transaction", uselist=False)
    settlement = relationship("Settlement", back_populates="transaction", uselist=False)
    disputes = relationship("Dispute", back_populates="transaction")


class TokenEvidence(Base):
    __tablename__ = "token_evidence"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(64), ForeignKey("transactions.transaction_id"), unique=True, nullable=False)
    raw_token_json = Column(Text, nullable=False)
    token_signature = Column(Text, nullable=False)
    payer_public_key = Column(Text, nullable=False)
    verified_offline = Column(Boolean, default=True)

    transaction = relationship("Transaction", back_populates="token_evidence")


class Receipt(Base):
    __tablename__ = "receipts"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(64), ForeignKey("transactions.transaction_id"), unique=True, nullable=False)
    merchant_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    merchant_device_id = Column(String(64), nullable=False)
    token_hash = Column(String(64), nullable=False)
    amount = Column(Integer, nullable=False)
    accepted_at = Column(DateTime, nullable=False)
    receipt_signature = Column(Text, nullable=False)
    raw_receipt_json = Column(Text, nullable=False)

    transaction = relationship("Transaction", back_populates="receipt")


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False, index=True)
    entry_type = Column(String(50), nullable=False)  # INITIAL_DEPOSIT, RESERVE_LOCK, RESERVE_RELEASE, SETTLEMENT_DEBIT, SETTLEMENT_CREDIT, DISPUTE_REVERSAL
    amount = Column(Integer, nullable=False)         # Signed: + credit, - debit (in paise)
    balance_before = Column(Integer, nullable=False)
    balance_after = Column(Integer, nullable=False)
    reference_type = Column(String(50), nullable=False)  # RESERVE, TRANSACTION, DISPUTE, SYSTEM
    reference_id = Column(String(64), nullable=False)
    description = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now)

    wallet = relationship("Wallet", back_populates="ledger_entries")


class Settlement(Base):
    __tablename__ = "settlements"

    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(64), ForeignKey("transactions.transaction_id"), unique=True, nullable=False)
    reserve_id = Column(Integer, ForeignKey("reserves.id"), nullable=False)
    payer_wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    payee_wallet_id = Column(Integer, ForeignKey("wallets.id"), nullable=False)
    settled_amount = Column(Integer, nullable=False)  # in paise
    settled_at = Column(DateTime, default=utc_now)

    transaction = relationship("Transaction", back_populates="settlement")
    reserve = relationship("Reserve", back_populates="settlements")


class Dispute(Base):
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    dispute_id = Column(String(64), unique=True, index=True, nullable=False)
    transaction_id = Column(String(64), ForeignKey("transactions.transaction_id"), nullable=False)
    requesting_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    reason = Column(String(255), nullable=False)
    status = Column(String(30), default="OPEN")  # OPEN, UNDER_REVIEW, RESOLVED_REFUNDED, RESOLVED_REJECTED
    evidence_bundle_json = Column(Text, nullable=True)
    analyst_decision = Column(String(50), nullable=True)
    decision_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    resolved_at = Column(DateTime, nullable=True)

    transaction = relationship("Transaction", back_populates="disputes")
    requesting_user = relationship("User", back_populates="disputes")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(100), nullable=False, index=True)
    actor_id = Column(Integer, nullable=True)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(64), nullable=False, index=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=utc_now)
