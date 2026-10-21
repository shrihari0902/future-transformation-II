from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional

from core.database import get_db
from models import Transaction, User
from schemas import (
    TransactionSyncRequest, TransactionSyncResponse,
    TransactionResponse, SyncResultItem
)
from services.settlement_service import process_transaction_sync
from api.deps import get_current_user

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def _history_query(current_user: User, db: Session):
    """Return only transactions the authenticated user is allowed to review."""
    query = db.query(Transaction)
    if current_user.role == "analyst":
        return query
    if current_user.role == "merchant":
        return query.filter(Transaction.payee_user_id == current_user.id)
    return query.filter(
        or_(
            Transaction.payer_user_id == current_user.id,
            Transaction.payee_user_id == current_user.id,
        )
    )


def _history_response(txs: list[Transaction], current_user: User, db: Session):
    user_ids = {
        user_id
        for tx in txs
        for user_id in (tx.payer_user_id, tx.payee_user_id)
        if user_id is not None
    }
    users = (
        {user.id: user.username for user in db.query(User).filter(User.id.in_(user_ids)).all()}
        if user_ids
        else {}
    )

    response = []
    for tx in txs:
        is_outgoing = tx.payer_user_id == current_user.id
        response.append({
            "id": tx.id,
            "transaction_id": tx.transaction_id,
            "certificate_id": tx.certificate_id,
            "payer_user_id": tx.payer_user_id,
            "payer_device_id": tx.payer_device_id,
            "payee_user_id": tx.payee_user_id,
            "amount": tx.amount,
            "nonce": tx.nonce,
            "counter": tx.counter,
            "status": tx.status,
            "flag_reason": tx.flag_reason,
            "issued_at": tx.issued_at,
            "expires_at": tx.expires_at,
            "created_at": tx.created_at,
            "settled_at": tx.settled_at,
            "payer_username": users.get(tx.payer_user_id),
            "payee_username": users.get(tx.payee_user_id),
            "transaction_type": "OUTGOING" if is_outgoing else "INCOMING",
            "counterparty_username": users.get(
                tx.payee_user_id if is_outgoing else tx.payer_user_id
            ),
            "settlement_status": tx.status,
        })
    return response


def _can_access_transaction(tx: Transaction, current_user: User) -> bool:
    if current_user.role == "analyst":
        return True
    if current_user.role == "merchant":
        return tx.payee_user_id == current_user.id
    return tx.payer_user_id == current_user.id or tx.payee_user_id == current_user.id


@router.post("/sync", response_model=TransactionSyncResponse)
def sync_transactions(
    req: TransactionSyncRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Synchronizes offline transactions uploaded by customer or merchant.
    Performs full server-side verification, double-spend detection,
    and settles valid transactions against offline reserves.
    """
    results: List[SyncResultItem] = []
    settled_count = 0
    flagged_count = 0

    for item in req.transactions:
        res = process_transaction_sync(db, item, actor_id=current_user.id)
        results.append(res)
        if res.status == "SETTLED":
            settled_count += 1
        elif res.status == "FLAGGED":
            flagged_count += 1

    return TransactionSyncResponse(
        processed=len(req.transactions),
        settled=settled_count,
        flagged=flagged_count,
        results=results
    )


@router.get("", response_model=List[TransactionResponse])
def get_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    txs = _history_query(current_user, db).order_by(Transaction.created_at.desc()).all()
    return _history_response(txs, current_user, db)


@router.get("/flags", response_model=List[TransactionResponse])
def get_flagged_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    txs = _history_query(current_user, db).filter(
        Transaction.status == "FLAGGED"
    ).order_by(Transaction.created_at.desc()).all()
    return _history_response(txs, current_user, db)


@router.get("/{transaction_id}")
def get_transaction_details(
    transaction_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tx = db.query(Transaction).filter(Transaction.transaction_id == transaction_id).first()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    if not _can_access_transaction(tx, current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    payer = db.query(User).filter(User.id == tx.payer_user_id).first()
    payee = db.query(User).filter(User.id == tx.payee_user_id).first()

    return {
        "transaction_id": tx.transaction_id,
        "certificate_id": tx.certificate_id,
        "payer": {"id": payer.id, "username": payer.username} if payer else None,
        "payee": {"id": payee.id, "username": payee.username} if payee else None,
        "payer_device_id": tx.payer_device_id,
        "amount": tx.amount,
        "nonce": tx.nonce,
        "counter": tx.counter,
        "status": tx.status,
        "flag_reason": tx.flag_reason,
        "issued_at": tx.issued_at,
        "expires_at": tx.expires_at,
        "created_at": tx.created_at,
        "settled_at": tx.settled_at,
        "evidence": {
            "token_signature": tx.token_evidence.token_signature if tx.token_evidence else None,
            "raw_token_json": tx.token_evidence.raw_token_json if tx.token_evidence else None,
            "payer_public_key": tx.token_evidence.payer_public_key if tx.token_evidence else None
        } if tx.token_evidence else None,
        "receipt": {
            "merchant_device_id": tx.receipt.merchant_device_id,
            "token_hash": tx.receipt.token_hash,
            "accepted_at": tx.receipt.accepted_at,
            "receipt_signature": tx.receipt.receipt_signature,
            "raw_receipt_json": tx.receipt.raw_receipt_json
        } if tx.receipt else None
    }
