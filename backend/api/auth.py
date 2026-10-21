from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.exc import IntegrityError
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional

from core.database import get_db
from core.security import verify_password, create_access_token, get_password_hash
from models import User, Wallet, RiskTier
from schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """Create a customer account without exposing role or credential fields."""
    if request.password != request.confirm_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Passwords do not match")

    email = request.email.strip().lower()
    username = request.username.strip()
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username is already registered")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email address is already registered")

    risk_tier = db.query(RiskTier).filter(RiskTier.name == "Medium Risk").first()
    user = User(
        full_name=request.full_name,
        username=username,
        email=email,
        hashed_password=get_password_hash(request.password),
        role="customer",
        risk_tier_id=risk_tier.id if risk_tier else None,
        is_active=True,
    )
    db.add(user)
    try:
        db.flush()
        db.add(Wallet(user_id=user.id, total_balance=0, available_balance=0, reserved_balance=0))
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email is already registered")

    return user

@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    db: Session = Depends(get_db)
):
    username = None
    password = None
    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        body = await request.json()
        username = body.get("username")
        password = body.get("password")
    else:
        form = await request.form()
        username = form.get("username")
        password = form.get("password")

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required"
        )

    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user account")

    access_token = create_access_token(subject=user.id, role=user.role)

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        risk_tier_id=user.risk_tier_id,
        risk_tier_name=user.risk_tier.name if user.risk_tier else None,
        is_active=user.is_active
    )

    return TokenResponse(access_token=access_token, token_type="bearer", user=user_resp)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        risk_tier_id=current_user.risk_tier_id,
        risk_tier_name=current_user.risk_tier.name if current_user.risk_tier else None,
        is_active=current_user.is_active
    )
