from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from core.config import settings
from core.database import get_db
from models import Wallet, Reserve, LedgerEntry, User
from schemas import (
    WalletResponse, ReserveCreateRequest, ReserveResponse,
    CertificateResponse, LedgerEntryResponse, DemoFundingRequest
)
from services.reserve_service import create_wallet_reserve
from api.deps import get_current_user

router = APIRouter(tags=["Wallet & Reserves"])


def _demo_funding_available() -> bool:
    return (
        settings.ENVIRONMENT.lower() in {"development", "dev", "demo"}
        and settings.DEMO_FUNDING_ENABLED
    )


@router.post("/wallet/demo-funding", response_model=WalletResponse)
def add_demo_funds(
    req: DemoFundingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not _demo_funding_available():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Demo funding is disabled outside development or demo environments",
        )
    if current_user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customer wallets can receive demo funds",
        )
    if req.amount > settings.DEMO_FUNDING_MAX_AMOUNT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Demo funding cannot exceed {settings.DEMO_FUNDING_MAX_AMOUNT} paise",
        )

    try:
        wallet = db.query(Wallet).filter(
            Wallet.user_id == current_user.id
        ).with_for_update().first()
        if not wallet:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Wallet not found",
            )

        existing_entry = db.query(LedgerEntry).filter(
            LedgerEntry.wallet_id == wallet.id,
            LedgerEntry.entry_type == "DEMO_CREDIT",
            LedgerEntry.reference_type == "DEMO_FUNDING",
            LedgerEntry.reference_id == req.idempotency_key,
        ).first()
        if existing_entry:
            return wallet

        balance_before = wallet.total_balance
        wallet.total_balance += req.amount
        wallet.available_balance += req.amount
        db.add(LedgerEntry(
            wallet_id=wallet.id,
            entry_type="DEMO_CREDIT",
            amount=req.amount,
            balance_before=balance_before,
            balance_after=wallet.total_balance,
            reference_type="DEMO_FUNDING",
            reference_id=req.idempotency_key,
            description="Simulated demo wallet funding",
        ))
        db.commit()
        db.refresh(wallet)
        return wallet
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to add demo funds",
        )


@router.get("/wallet", response_model=WalletResponse)
def get_wallet(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wallet not found")
    return wallet


@router.post("/reserves", response_model=ReserveResponse)
def create_reserve(
    req: ReserveCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    reserve = create_wallet_reserve(db, current_user, req)
    cert = reserve.certificate
    
    cert_resp = CertificateResponse(
        certificate_id=cert.certificate_id,
        reserve_id=cert.reserve_id,
        user_id=cert.user_id,
        device_id=cert.device_id,
        reserve_amount=cert.reserve_amount,
        max_per_payment=cert.max_per_payment,
        issued_at=cert.issued_at,
        expires_at=cert.expires_at,
        signature=cert.signature,
        raw_payload_json=cert.raw_payload_json
    )

    return ReserveResponse(
        id=reserve.id,
        reserve_id=reserve.reserve_id,
        amount=reserve.amount,
        remaining_allowance=reserve.remaining_allowance,
        status=reserve.status,
        created_at=reserve.created_at,
        expires_at=reserve.expires_at,
        certificate=cert_resp
    )


@router.get("/reserves", response_model=List[ReserveResponse])
def get_reserves(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    reserves = db.query(Reserve).filter(Reserve.user_id == current_user.id).order_by(Reserve.created_at.desc()).all()
    results = []
    for r in reserves:
        cert_resp = None
        if r.certificate:
            cert_resp = CertificateResponse(
                certificate_id=r.certificate.certificate_id,
                reserve_id=r.certificate.reserve_id,
                user_id=r.certificate.user_id,
                device_id=r.certificate.device_id,
                reserve_amount=r.certificate.reserve_amount,
                max_per_payment=r.certificate.max_per_payment,
                issued_at=r.certificate.issued_at,
                expires_at=r.certificate.expires_at,
                signature=r.certificate.signature,
                raw_payload_json=r.certificate.raw_payload_json
            )
        results.append(ReserveResponse(
            id=r.id,
            reserve_id=r.reserve_id,
            amount=r.amount,
            remaining_allowance=r.remaining_allowance,
            status=r.status,
            created_at=r.created_at,
            expires_at=r.expires_at,
            certificate=cert_resp
        ))
    return results


@router.get("/ledger", response_model=List[LedgerEntryResponse])
def get_ledger(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    wallet = db.query(Wallet).filter(Wallet.user_id == current_user.id).first()
    if not wallet:
        return []
    entries = db.query(LedgerEntry).filter(
        LedgerEntry.wallet_id == wallet.id
    ).order_by(LedgerEntry.created_at.desc()).all()
    return entries
