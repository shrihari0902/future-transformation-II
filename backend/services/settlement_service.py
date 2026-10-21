import json
import uuid
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, update
from sqlalchemy.exc import SQLAlchemyError

from core.crypto import (
    canonical_json_bytes,
    verify_signature,
    verify_bank_signature,
    sha256_hex
)
from models import (
    User, Wallet, Device, Reserve, AllowanceCertificate,
    Transaction, TokenEvidence, Receipt, LedgerEntry,
    Settlement, AuditLog
)
from schemas import TransactionSyncItem, SyncResultItem

# Thread safety lock for concurrent settlements
settlement_lock = threading.Lock()


def process_transaction_sync(
    db: Session,
    item: TransactionSyncItem,
    actor_id: Optional[int] = None
) -> SyncResultItem:
    """
    Synchronizes and settles an offline payment transaction.
    Enforces idempotency, signature verification, replay protection,
    counter sequencing, and deterministic reserve-bounded double-spend protection.
    """
    with settlement_lock:
        token = item.token_payload
        tx_id = token.transaction_id

        # 1. IDEMPOTENCY CHECK
        # Uploading the same transaction 10 times must produce exactly 1 settlement
        existing_tx = db.query(Transaction).filter(Transaction.transaction_id == tx_id).first()
        if existing_tx:
            if existing_tx.status == "SETTLED":
                return SyncResultItem(
                    transaction_id=tx_id,
                    status="SETTLED",
                    message="Transaction already processed and settled (idempotent response).",
                    settled_amount=existing_tx.amount,
                    flag_reason=None
                )
            elif existing_tx.status == "FLAGGED":
                return SyncResultItem(
                    transaction_id=tx_id,
                    status="FLAGGED",
                    message=f"Transaction previously flagged: {existing_tx.flag_reason}",
                    flag_reason=existing_tx.flag_reason
                )
            elif existing_tx.status == "REJECTED":
                return SyncResultItem(
                    transaction_id=tx_id,
                    status="REJECTED",
                    message=f"Transaction previously rejected: {existing_tx.flag_reason}",
                    flag_reason=existing_tx.flag_reason
                )

        # 2. DEVICE REGISTRATION & PUBLIC KEY
        device = db.query(Device).filter(Device.device_id == token.payer_device_id).first()
        if not device:
            return _record_rejection(
                db, token, item, "Payer device not registered on server.", actor_id
            )

        # Verify device belongs to payer
        if device.user_id != token.payer_user_id:
            return _record_rejection(
                db, token, item, "Device ID does not match payer user ID.", actor_id
            )

        # 3. VERIFY TOKEN SIGNATURE
        token_dict = token.model_dump()
        is_token_sig_valid = verify_signature(
            device.public_key_spki,
            token_dict,
            item.token_signature
        )
        if not is_token_sig_valid:
            return _record_rejection(
                db, token, item, "Invalid token digital signature (cryptographic verification failed).", actor_id
            )

        # 4. CERTIFICATE VERIFICATION
        cert_dict = item.certificate
        cert_sig = cert_dict.get("signature")
        if not cert_sig:
            return _record_rejection(db, token, item, "Missing certificate signature.", actor_id)

        cert_payload = cert_dict.get("payload")
        if not cert_payload:
            return _record_rejection(db, token, item, "Missing certificate payload.", actor_id)

        # Verify Bank signature on certificate
        is_cert_sig_valid = verify_bank_signature(cert_payload, cert_sig)
        if not is_cert_sig_valid:
            return _record_rejection(
                db, token, item, "Invalid bank signature on allowance certificate.", actor_id
            )

        # Verify certificate belongs to payer and device
        cert_id = cert_payload.get("certificate_id")
        if cert_id != token.certificate_id:
            return _record_rejection(
                db, token, item, "Token certificate ID mismatch with provided certificate.", actor_id
            )

        if cert_payload.get("device_id") != token.payer_device_id:
            return _record_rejection(
                db, token, item, "Certificate device mismatch with payer device.", actor_id
            )

        # Check certificate expiration
        try:
            cert_expires_at = datetime.fromisoformat(cert_payload.get("expires_at"))
            if datetime.now(timezone.utc) > cert_expires_at.replace(tzinfo=timezone.utc if cert_expires_at.tzinfo is None else cert_expires_at.tzinfo):
                return _record_rejection(
                    db, token, item, "Allowance certificate has expired.", actor_id
                )
        except Exception:
            return _record_rejection(db, token, item, "Invalid certificate expiration format.", actor_id)

        # 5. AMOUNT VALIDATION
        if token.amount <= 0:
            return _record_rejection(db, token, item, "Payment amount must be positive.", actor_id)

        max_per_payment = cert_payload.get("max_per_payment", 0)
        if token.amount > max_per_payment:
            return _record_rejection(
                db, token, item,
                f"Payment amount ({token.amount}) exceeds certificate maximum per payment limit ({max_per_payment}).",
                actor_id
            )

        # 6. PAYEE VERIFICATION
        payee = None
        if str(token.payee_id).isdigit():
            payee = db.query(User).filter(User.id == int(token.payee_id)).first()
        if not payee:
            payee = db.query(User).filter(User.username == str(token.payee_id)).first()

        if not payee:
            return _record_rejection(
                db, token, item, f"Payee '{token.payee_id}' not found.", actor_id
            )

        # 7. REPLAY ATTACK: NONCE UNIQUENESS
        nonce_match = db.query(Transaction).filter(Transaction.nonce == token.nonce).first()
        if nonce_match:
            return _record_flag(
                db, token, item, payee.id,
                f"REPLAY ATTACK DETECTED: Nonce '{token.nonce}' was previously used in transaction {nonce_match.transaction_id}.",
                actor_id,
                is_nonce_replay=True
            )

        # 8. COUNTER UNIQUENESS & REPLAY
        counter_match = db.query(Transaction).filter(
            Transaction.payer_device_id == token.payer_device_id,
            Transaction.counter == token.counter
        ).first()
        if counter_match:
            return _record_flag(
                db, token, item, payee.id,
                f"COUNTER REPLAY DETECTED: Counter {token.counter} on device {token.payer_device_id} already used in transaction {counter_match.transaction_id}.",
                actor_id,
                is_counter_replay=True
            )

        # 9. DOUBLE-SPEND DETECTION & RESERVE BOUNDING
        db_cert = db.query(AllowanceCertificate).filter(
            AllowanceCertificate.certificate_id == cert_id
        ).first()
        if not db_cert:
            return _record_rejection(
                db, token, item, f"Certificate record {cert_id} not found in database.", actor_id
            )

        reserve = db.query(Reserve).filter(Reserve.id == db_cert.reserve_id).with_for_update().first()
        if not reserve:
            return _record_rejection(
                db, token, item, "Associated wallet reserve not found.", actor_id
            )

        # SELECT FOR UPDATE returns the authoritative current row. Do not refresh
        # it with a plain SELECT: under MySQL repeatable-read that can restore a
        # stale snapshot after another request has released the row lock.
        current_reserve_balance = int(reserve.remaining_allowance)

        # Double-spend check: does this claim exceed remaining reserve?
        if token.amount > current_reserve_balance:
            flag_reason = (
                f"DOUBLE-SPEND DETECTED: Claim amount {token.amount} paise exceeds available "
                f"reserve balance {current_reserve_balance} paise (Reserve Total: {reserve.amount})."
            )
            return _record_flag(
                db, token, item, payee.id, flag_reason, actor_id
            )

        # 10. ELIGIBLE FOR SETTLEMENT! Execute atomic settlement movements
        now = datetime.now(timezone.utc)
        try:
            tx_issued = datetime.fromisoformat(token.issued_at)
            tx_expires = datetime.fromisoformat(token.expires_at)
        except Exception:
            tx_issued = now
            tx_expires = now + timedelta(hours=24)

        payer_wallet = db.query(Wallet).filter(
            Wallet.user_id == token.payer_user_id
        ).with_for_update().first()
        payee_wallet = db.query(Wallet).filter(
            Wallet.user_id == payee.id
        ).with_for_update().first()

        if not payer_wallet or not payee_wallet:
            return _record_rejection(db, token, item, "Payer or Payee wallet not found.", actor_id)

        # Create Transaction record
        new_tx = Transaction(
            transaction_id=tx_id,
            certificate_id=cert_id,
            payer_user_id=token.payer_user_id,
            payer_device_id=token.payer_device_id,
            payee_user_id=payee.id,
            amount=token.amount,
            nonce=token.nonce,
            counter=token.counter,
            status="SETTLED",
            flag_reason=None,
            issued_at=tx_issued,
            expires_at=tx_expires,
            created_at=now,
            settled_at=now
        )
        db.add(new_tx)

        # Create TokenEvidence
        token_evidence = TokenEvidence(
            transaction_id=tx_id,
            raw_token_json=json.dumps(token_dict),
            token_signature=item.token_signature,
            payer_public_key=item.payer_public_key,
            verified_offline=True
        )
        db.add(token_evidence)

        # Create Receipt if present
        if item.receipt:
            receipt_obj = Receipt(
                transaction_id=tx_id,
                merchant_user_id=payee.id,
                merchant_device_id=item.receipt.merchant_device_id,
                token_hash=item.receipt.token_hash,
                amount=item.receipt.amount,
                accepted_at=datetime.fromisoformat(item.receipt.accepted_at),
                receipt_signature=item.receipt.receipt_signature,
                raw_receipt_json=json.dumps(item.receipt.model_dump())
            )
            db.add(receipt_obj)

        # Create Settlement record
        settlement = Settlement(
            transaction_id=tx_id,
            reserve_id=reserve.id,
            payer_wallet_id=payer_wallet.id,
            payee_wallet_id=payee_wallet.id,
            settled_amount=token.amount,
            settled_at=now
        )
        db.add(settlement)

        # Update Reserve remaining allowance
        new_reserve_balance = int(current_reserve_balance - token.amount)
        reserve.remaining_allowance = new_reserve_balance
        if new_reserve_balance == 0:
            reserve.status = "EXHAUSTED"

        # Wallet movements
        payer_before = payer_wallet.total_balance
        payer_wallet.total_balance -= token.amount
        payer_wallet.reserved_balance -= token.amount
        payer_after = payer_wallet.total_balance

        payer_ledger = LedgerEntry(
            wallet_id=payer_wallet.id,
            entry_type="SETTLEMENT_DEBIT",
            amount=-token.amount,
            balance_before=payer_before,
            balance_after=payer_after,
            reference_type="TRANSACTION",
            reference_id=tx_id,
            description=f"Settled offline payment to {payee.username} ({token.amount} paise)",
            created_at=now
        )
        db.add(payer_ledger)

        payee_before = payee_wallet.total_balance
        payee_wallet.total_balance += token.amount
        payee_wallet.available_balance += token.amount
        payee_after = payee_wallet.total_balance

        payee_ledger = LedgerEntry(
            wallet_id=payee_wallet.id,
            entry_type="SETTLEMENT_CREDIT",
            amount=token.amount,
            balance_before=payee_before,
            balance_after=payee_after,
            reference_type="TRANSACTION",
            reference_id=tx_id,
            description=f"Received offline payment settlement from User #{token.payer_user_id} ({token.amount} paise)",
            created_at=now
        )
        db.add(payee_ledger)

        # Audit log
        audit = AuditLog(
            action="TRANSACTION_SETTLED",
            actor_id=actor_id,
            entity_type="TRANSACTION",
            entity_id=tx_id,
            details_json=json.dumps({
                "amount": int(token.amount),
                "payer_id": int(token.payer_user_id),
                "payee_id": int(payee.id),
                "reserve_id": reserve.reserve_id,
                "remaining_reserve": int(new_reserve_balance)
            }),
            created_at=now
        )
        db.add(audit)

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            raise

        return SyncResultItem(
            transaction_id=tx_id,
            status="SETTLED",
            message="Transaction successfully verified and settled against offline reserve.",
            settled_amount=token.amount,
            flag_reason=None
        )


def _record_flag(
    db: Session,
    token: Any,
    item: TransactionSyncItem,
    payee_id: int,
    reason: str,
    actor_id: Optional[int],
    is_nonce_replay: bool = False,
    is_counter_replay: bool = False
) -> SyncResultItem:
    """Records a suspicious or double-spending transaction as FLAGGED."""
    now = datetime.now(timezone.utc)
    try:
        tx_issued = datetime.fromisoformat(token.issued_at)
        tx_expires = datetime.fromisoformat(token.expires_at)
    except Exception:
        tx_issued = now
        tx_expires = now + timedelta(hours=24)

    stored_nonce = f"FLAGGED_{uuid.uuid4().hex[:6]}_{token.nonce}"
    stored_counter = -abs(int(uuid.uuid4().int % 1000000000))

    tx = Transaction(
        transaction_id=token.transaction_id,
        certificate_id=token.certificate_id,
        payer_user_id=token.payer_user_id,
        payer_device_id=token.payer_device_id,
        payee_user_id=payee_id,
        amount=token.amount,
        nonce=stored_nonce,
        counter=stored_counter,
        status="FLAGGED",
        flag_reason=reason,
        issued_at=tx_issued,
        expires_at=tx_expires,
        created_at=now
    )
    db.add(tx)

    evidence = TokenEvidence(
        transaction_id=token.transaction_id,
        raw_token_json=json.dumps(token.model_dump()),
        token_signature=item.token_signature,
        payer_public_key=item.payer_public_key,
        verified_offline=False
    )
    db.add(evidence)

    audit = AuditLog(
        action="TRANSACTION_FLAGGED",
        actor_id=actor_id,
        entity_type="TRANSACTION",
        entity_id=token.transaction_id,
        details_json=json.dumps({"reason": reason, "amount": token.amount}),
        created_at=now
    )
    db.add(audit)

    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return SyncResultItem(
        transaction_id=token.transaction_id,
        status="FLAGGED",
        message=f"Transaction flagged for analyst investigation: {reason}",
        flag_reason=reason
    )


def _record_rejection(
    db: Session,
    token: Any,
    item: TransactionSyncItem,
    reason: str,
    actor_id: Optional[int]
) -> SyncResultItem:
    """Records an invalid transaction as REJECTED."""
    now = datetime.now(timezone.utc)
    try:
        tx_issued = datetime.fromisoformat(token.issued_at)
        tx_expires = datetime.fromisoformat(token.expires_at)
    except Exception:
        tx_issued = now
        tx_expires = now + timedelta(hours=24)

    audit = AuditLog(
        action="TRANSACTION_REJECTED",
        actor_id=actor_id,
        entity_type="TRANSACTION",
        entity_id=token.transaction_id,
        details_json=json.dumps({"reason": reason}),
        created_at=now
    )
    db.add(audit)

    try:
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise

    return SyncResultItem(
        transaction_id=token.transaction_id,
        status="REJECTED",
        message=f"Transaction rejected: {reason}",
        flag_reason=reason
    )
