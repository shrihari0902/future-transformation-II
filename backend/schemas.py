from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, field_validator


# --- Auth Schemas ---
class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @field_validator("full_name", "username", "email")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field is required")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        value = value.lower()
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, value: str, info) -> str:
        password = info.data.get("password")
        if password is not None and value != password:
            raise ValueError("Passwords do not match")
        return value

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str
    role: str
    risk_tier_id: Optional[int] = None
    risk_tier_name: Optional[str] = None
    is_active: bool

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Device Schemas ---
class DeviceRegisterRequest(BaseModel):
    device_id: str
    public_key_spki: str
    device_name: Optional[str] = "Browser Device"

class DeviceResponse(BaseModel):
    id: int
    device_id: str
    user_id: int
    public_key_spki: str
    device_name: Optional[str]
    is_active: bool
    registered_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Wallet & Reserve Schemas ---
class WalletResponse(BaseModel):
    id: int
    user_id: int
    total_balance: int
    available_balance: int
    reserved_balance: int
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class DemoFundingRequest(BaseModel):
    amount: int = Field(gt=0, description="Demo funding amount in paise")
    idempotency_key: str = Field(min_length=16, max_length=128)

class ReserveCreateRequest(BaseModel):
    amount: int = Field(gt=0, description="Reserve amount in paise")
    device_id: str

class CertificatePayload(BaseModel):
    certificate_id: str
    device_id: str
    payer_user_id: int
    reserve_amount: int
    max_per_payment: int
    issued_at: str
    expires_at: str

class CertificateResponse(BaseModel):
    certificate_id: str
    reserve_id: int
    user_id: int
    device_id: str
    reserve_amount: int
    max_per_payment: int
    issued_at: datetime
    expires_at: datetime
    signature: str
    raw_payload_json: str

    model_config = ConfigDict(from_attributes=True)

class ReserveResponse(BaseModel):
    id: int
    reserve_id: str
    amount: int
    remaining_allowance: int
    status: str
    created_at: datetime
    expires_at: datetime
    certificate: Optional[CertificateResponse] = None

    model_config = ConfigDict(from_attributes=True)

class LedgerEntryResponse(BaseModel):
    id: int
    wallet_id: int
    entry_type: str
    amount: int
    balance_before: int
    balance_after: int
    reference_type: str
    reference_id: str
    description: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Transaction & Offline Payment Schemas ---
class PaymentTokenPayload(BaseModel):
    transaction_id: str
    certificate_id: str
    payer_device_id: str
    payer_user_id: int
    payee_id: str  # merchant username or user id
    amount: int = Field(gt=0, description="Amount in paise")
    nonce: str
    counter: int = Field(ge=1, description="Strictly incrementing counter")
    issued_at: str
    expires_at: str

class ReceiptPayload(BaseModel):
    transaction_id: str
    token_hash: str
    merchant_id: str
    merchant_device_id: str
    amount: int
    accepted_at: str
    receipt_signature: str

class TransactionSyncItem(BaseModel):
    token_payload: PaymentTokenPayload
    token_signature: str
    payer_public_key: str
    certificate: Dict[str, Any]
    receipt: Optional[ReceiptPayload] = None

class TransactionSyncRequest(BaseModel):
    transactions: List[TransactionSyncItem]

class TransactionResponse(BaseModel):
    id: int
    transaction_id: str
    certificate_id: str
    payer_user_id: int
    payer_device_id: str
    payee_user_id: int
    amount: int
    nonce: str
    counter: int
    status: str
    flag_reason: Optional[str] = None
    issued_at: datetime
    expires_at: datetime
    created_at: datetime
    settled_at: Optional[datetime] = None
    payer_username: Optional[str] = None
    payee_username: Optional[str] = None
    transaction_type: Optional[str] = None
    counterparty_username: Optional[str] = None
    settlement_status: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class SyncResultItem(BaseModel):
    transaction_id: str
    status: str
    message: str
    settled_amount: Optional[int] = None
    flag_reason: Optional[str] = None

class TransactionSyncResponse(BaseModel):
    processed: int
    settled: int
    flagged: int
    results: List[SyncResultItem]


# --- Risk Schemas ---
class RiskTierResponse(BaseModel):
    id: int
    name: str
    max_reserve_amount: int
    max_per_payment_limit: int
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RiskLimitResponse(BaseModel):
    risk_tier: RiskTierResponse
    explanation: str


# --- Dispute Schemas ---
class DisputeCreateRequest(BaseModel):
    transaction_id: str
    reason: str
    evidence_bundle: Optional[Dict[str, Any]] = None

class DisputeDecisionRequest(BaseModel):
    decision: str = Field(description="'RESOLVED_REFUNDED' or 'RESOLVED_REJECTED'")
    decision_notes: Optional[str] = ""

class DisputeResponse(BaseModel):
    id: int
    dispute_id: str
    transaction_id: str
    requesting_user_id: int
    reason: str
    status: str
    evidence_bundle_json: Optional[str] = None
    analyst_decision: Optional[str] = None
    decision_notes: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
