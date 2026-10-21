from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from models import RiskTier, User
from schemas import RiskTierResponse, RiskLimitResponse
from api.deps import get_current_user

router = APIRouter(prefix="/risk", tags=["Risk Management"])

@router.get("/my-limit", response_model=RiskLimitResponse)
def get_my_risk_limit(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tier = current_user.risk_tier
    if not tier:
        tier = db.query(RiskTier).filter(RiskTier.name == "Medium Risk").first()
        if not tier:
            tier = db.query(RiskTier).first()

    if not tier:
        raise HTTPException(status_code=404, detail="Risk tier configuration missing")

    tier_resp = RiskTierResponse(
        id=tier.id,
        name=tier.name,
        max_reserve_amount=tier.max_reserve_amount,
        max_per_payment_limit=tier.max_per_payment_limit,
        description=tier.description
    )

    per_payment_inr = tier.max_per_payment_limit / 100
    reserve_inr = tier.max_reserve_amount / 100

    explanation = (
        f"Your per-payment limit is ₹{per_payment_inr:.2f} ({tier.max_per_payment_limit} paise) "
        f"and maximum reserve is ₹{reserve_inr:.2f} ({tier.max_reserve_amount} paise) "
        f"because your account is currently evaluated in the {tier.name} tier."
    )

    return RiskLimitResponse(
        risk_tier=tier_resp,
        explanation=explanation
    )


@router.get("/tiers", response_model=List[RiskTierResponse])
def get_all_risk_tiers(db: Session = Depends(get_db)):
    return db.query(RiskTier).all()
