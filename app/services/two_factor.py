import json

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core import totp
from app.models import User


def start_setup(db: Session, user: User) -> tuple[str, str]:
    """Create a fresh pending secret. It isn't enforced until confirmed with a valid code."""
    if user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor authentication is already on")
    secret = totp.generate_secret()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_last_counter = None
    db.commit()
    return secret, totp.provisioning_uri(secret, user.email, get_settings().app_name)


def enable(db: Session, user: User, code: str) -> list[str]:
    if user.totp_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Two-factor authentication is already on")
    secret = totp.decrypt_secret(user.totp_secret) if user.totp_secret else None
    if secret is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Start setup first")
    step = totp.verify(secret, code)
    if step is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That code doesn't match. Check the time on your phone and try again.")
    codes = totp.generate_recovery_codes()
    user.totp_enabled = True
    user.totp_last_counter = step
    user.totp_recovery_codes = json.dumps([totp.hash_recovery_code(c) for c in codes])
    db.commit()
    return codes


def verify_second_factor(db: Session, user: User, code: str) -> bool:
    """Accept a current authenticator code or an unused recovery code (which is then burned)."""
    secret = totp.decrypt_secret(user.totp_secret) if user.totp_secret else None
    if secret is not None:
        step = totp.verify(secret, code, last_counter=user.totp_last_counter)
        if step is not None:
            user.totp_last_counter = step
            db.commit()
            return True

    remaining = json.loads(user.totp_recovery_codes or "[]")
    hashed = totp.hash_recovery_code(code)
    if hashed in remaining:
        remaining.remove(hashed)
        user.totp_recovery_codes = json.dumps(remaining)
        db.commit()
        return True
    return False


def recovery_codes_left(user: User) -> int:
    return len(json.loads(user.totp_recovery_codes or "[]"))


def disable(db: Session, user: User) -> None:
    user.totp_enabled = False
    user.totp_secret = None
    user.totp_last_counter = None
    user.totp_recovery_codes = None
    db.commit()
