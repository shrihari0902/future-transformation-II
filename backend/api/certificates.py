from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict

from core.database import get_db
from core.crypto import get_bank_public_key_spki_b64, get_bank_public_key_pem
from models import AllowanceCertificate, User
from schemas import CertificateResponse
from api.deps import get_current_user

router = APIRouter(prefix="/certificates", tags=["Certificates"])

@router.get("/public-key", response_model=Dict[str, str])
def get_bank_public_key():
    """
    Returns the Bank's public verification key.
    The frontend uses this key offline to verify allowance certificates.
    """
    return {
        "algorithm": "ECDSA_P256_SHA256",
        "format": "SPKI_BASE64",
        "spki_b64": get_bank_public_key_spki_b64(),
        "pem": get_bank_public_key_pem()
    }


@router.get("", response_model=List[CertificateResponse])
def get_user_certificates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    certs = db.query(AllowanceCertificate).filter(
        AllowanceCertificate.user_id == current_user.id
    ).order_by(AllowanceCertificate.issued_at.desc()).all()
    return certs
