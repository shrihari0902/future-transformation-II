import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from models import Dispute, Transaction, User, AuditLog
from schemas import DisputeCreateRequest, DisputeResponse
from api.deps import get_current_user

router = APIRouter(prefix="/disputes", tags=["Disputes"])

@router.post("", response_model=DisputeResponse)
def create_dispute(
    req: DisputeCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.transaction_id == req.transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    if current_user.role == "merchant":
        can_access = tx.payee_user_id == current_user.id
    else:
        can_access = (
            current_user.role == "analyst"
            or tx.payer_user_id == current_user.id
            or tx.payee_user_id == current_user.id
        )
    if not can_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to dispute this transaction")

    existing = db.query(Dispute).filter(
        Dispute.transaction_id == req.transaction_id,
        Dispute.status.in_(["OPEN", "UNDER_REVIEW"])
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An active dispute already exists for this transaction")

    evidence = req.evidence_bundle or {}
    evidence.update({
        "transaction_id": tx.transaction_id,
        "certificate_id": tx.certificate_id,
        "amount": tx.amount,
        "status": tx.status,
        "flag_reason": tx.flag_reason,
        "issued_at": tx.issued_at.isoformat() if tx.issued_at else None,
        "created_at": tx.created_at.isoformat() if tx.created_at else None,
        "token_evidence": {
            "signature": tx.token_evidence.token_signature,
            "raw": tx.token_evidence.raw_token_json
        } if tx.token_evidence else None,
        "receipt": {
            "signature": tx.receipt.receipt_signature,
            "token_hash": tx.receipt.token_hash
        } if tx.receipt else None
    })

    now = datetime.now(timezone.utc)
    dispute_id = str(uuid.uuid4())

    new_dispute = Dispute(
        dispute_id=dispute_id,
        transaction_id=tx.transaction_id,
        requesting_user_id=current_user.id,
        reason=req.reason,
        status="OPEN",
        evidence_bundle_json=json.dumps(evidence),
        created_at=now
    )
    db.add(new_dispute)

    audit = AuditLog(
        action="DISPUTE_RAISED",
        actor_id=current_user.id,
        entity_type="DISPUTE",
        entity_id=dispute_id,
        details_json=json.dumps({"reason": req.reason, "tx_id": tx.transaction_id}),
        created_at=now
    )
    db.add(audit)

    db.commit()
    db.refresh(new_dispute)
    return new_dispute


@router.get("", response_model=List[DisputeResponse])
def get_user_disputes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "analyst":
        return db.query(Dispute).order_by(Dispute.created_at.desc()).all()
    return db.query(Dispute).filter(
        Dispute.requesting_user_id == current_user.id
    ).order_by(Dispute.created_at.desc()).all()
