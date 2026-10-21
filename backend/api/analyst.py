import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from models import Dispute, Transaction, Wallet, LedgerEntry, User, AuditLog
from schemas import DisputeResponse, DisputeDecisionRequest, TransactionResponse
from api.deps import get_current_analyst

router = APIRouter(prefix="/analyst", tags=["Analyst Operations"])

@router.get("/disputes", response_model=List[DisputeResponse])
def get_analyst_disputes(
    status_filter: Optional[str] = None,
    current_analyst: User = Depends(get_current_analyst),
    db: Session = Depends(get_db)
):
    query = db.query(Dispute)
    if status_filter:
        query = query.filter(Dispute.status == status_filter)
    return query.order_by(Dispute.created_at.desc()).all()


@router.post("/disputes/{dispute_id}/decision", response_model=DisputeResponse)
def resolve_dispute(
    dispute_id: str,
    req: DisputeDecisionRequest,
    current_analyst: User = Depends(get_current_analyst),
    db: Session = Depends(get_db)
):
    dispute = db.query(Dispute).filter(Dispute.dispute_id == dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dispute not found")

    if dispute.status not in ["OPEN", "UNDER_REVIEW"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Dispute is already resolved")

    if req.decision not in ["RESOLVED_REFUNDED", "RESOLVED_REJECTED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid decision value")

    now = datetime.now(timezone.utc)
    tx = db.query(Transaction).filter(Transaction.transaction_id == dispute.transaction_id).first()

    if req.decision == "RESOLVED_REFUNDED" and tx and tx.status == "SETTLED":
        payer_wallet = db.query(Wallet).filter(Wallet.user_id == tx.payer_user_id).with_for_update().first()
        payee_wallet = db.query(Wallet).filter(Wallet.user_id == tx.payee_user_id).with_for_update().first()

        if payer_wallet and payee_wallet and payee_wallet.available_balance >= tx.amount:
            payee_before = payee_wallet.total_balance
            payee_wallet.total_balance -= tx.amount
            payee_wallet.available_balance -= tx.amount
            payee_after = payee_wallet.total_balance

            payee_ledger = LedgerEntry(
                wallet_id=payee_wallet.id,
                entry_type="DISPUTE_REVERSAL",
                amount=-tx.amount,
                balance_before=payee_before,
                balance_after=payee_after,
                reference_type="DISPUTE",
                reference_id=dispute_id,
                description=f"Dispute refund reversal for transaction {tx.transaction_id[:8]}",
                created_at=now
            )
            db.add(payee_ledger)

            payer_before = payer_wallet.total_balance
            payer_wallet.total_balance += tx.amount
            payer_wallet.available_balance += tx.amount
            payer_after = payer_wallet.total_balance

            payer_ledger = LedgerEntry(
                wallet_id=payer_wallet.id,
                entry_type="DISPUTE_REVERSAL",
                amount=tx.amount,
                balance_before=payer_before,
                balance_after=payer_after,
                reference_type="DISPUTE",
                reference_id=dispute_id,
                description=f"Dispute refund credited for transaction {tx.transaction_id[:8]}",
                created_at=now
            )
            db.add(payer_ledger)

    dispute.status = req.decision
    dispute.analyst_decision = req.decision
    dispute.decision_notes = req.decision_notes
    dispute.resolved_at = now

    audit = AuditLog(
        action="ANALYST_DISPUTE_DECISION",
        actor_id=current_analyst.id,
        entity_type="DISPUTE",
        entity_id=dispute_id,
        details_json=json.dumps({
            "decision": req.decision,
            "notes": req.decision_notes,
            "analyst": current_analyst.username
        }),
        created_at=now
    )
    db.add(audit)

    db.commit()
    db.refresh(dispute)
    return dispute


@router.get("/flags", response_model=List[TransactionResponse])
def get_analyst_flagged_transactions(
    current_analyst: User = Depends(get_current_analyst),
    db: Session = Depends(get_db)
):
    return db.query(Transaction).filter(
        Transaction.status.in_(["FLAGGED", "REJECTED"])
    ).order_by(Transaction.created_at.desc()).all()


@router.get("/transactions", response_model=List[TransactionResponse])
def get_analyst_all_transactions(
    current_analyst: User = Depends(get_current_analyst),
    db: Session = Depends(get_db)
):
    return db.query(Transaction).order_by(Transaction.created_at.desc()).all()
