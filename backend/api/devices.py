from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone

from core.database import get_db
from models import Device, User, AuditLog
from schemas import DeviceRegisterRequest, DeviceResponse
from api.deps import get_current_user

router = APIRouter(prefix="/devices", tags=["Devices"])

@router.post("/register", response_model=DeviceResponse)
def register_device(
    req: DeviceRegisterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not req.device_id or not req.public_key_spki:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="device_id and public_key_spki are required"
        )

    # Check if this device ID is already registered
    existing_device = db.query(Device).filter(Device.device_id == req.device_id).first()
    if existing_device:
        if existing_device.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Device is already registered to another user"
            )
        # Update public key and active status
        existing_device.public_key_spki = req.public_key_spki
        existing_device.device_name = req.device_name or existing_device.device_name
        existing_device.is_active = True
        db.commit()
        db.refresh(existing_device)
        return existing_device

    # New device registration
    new_device = Device(
        device_id=req.device_id,
        user_id=current_user.id,
        public_key_spki=req.public_key_spki,
        device_name=req.device_name or "Browser Device",
        is_active=True,
        registered_at=datetime.now(timezone.utc)
    )
    db.add(new_device)

    # Audit log
    audit = AuditLog(
        action="DEVICE_REGISTERED",
        actor_id=current_user.id,
        entity_type="DEVICE",
        entity_id=req.device_id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(audit)

    db.commit()
    db.refresh(new_device)
    return new_device


@router.get("", response_model=List[DeviceResponse])
def get_user_devices(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    devices = db.query(Device).filter(
        Device.user_id == current_user.id,
        Device.is_active == True
    ).all()
    return devices
