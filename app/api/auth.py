from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.cache import hit_rate_limit
from app.core.queue import enqueue
from app.core.security import create_mfa_token, decode_token, hash_token, verify_password
from app.db.session import get_db
from app.deps import get_current_user
from app.models import RefreshToken, User
from app.schemas.auth import (
    LoginRequest,
    MfaChallenge,
    MfaLoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResendVerificationRequest,
    TokenResponse,
    TwoFactorCodeRequest,
    TwoFactorDisableRequest,
    TwoFactorSetupResponse,
    TwoFactorStatus,
    VerifyEmailRequest,
)
from app.schemas.organization import OrganizationOut
from app.schemas.user import UserOut
from app.services import two_factor
from app.services.auth import (
    authenticate,
    issue_tokens,
    new_verification_code,
    register_user,
    rotate_refresh_token,
)

router = APIRouter()


def _throttle(key: str, limit: int, window_seconds: int) -> None:
    retry_after = hit_rate_limit(key, limit, window_seconds)
    if retry_after is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )


def _verification_payload(user: User, code: str) -> dict:
    # Local dev has no inbox for demo addresses, so hand the code back to the UI.
    if get_settings().app_env in ("development", "test"):
        return {"dev_verification_code": code}
    return {}


@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    user, org = register_user(db, payload)
    code = user.email_verification_code
    enqueue("app.workers.jobs.send_verification_code", user.id)
    return {
        "user": UserOut.model_validate(user).model_dump(mode="json"),
        "organization": OrganizationOut.model_validate(org).model_dump(mode="json"),
        "email_verification_required": True,
        **_verification_payload(user, code),
    }


@router.post("/verify-email", response_model=dict)
def verify_email(payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    _throttle(f"verify:{payload.email}", limit=8, window_seconds=600)
    user = db.query(User).filter(User.email == payload.email.lower()).one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="No account found for that email")
    if user.email_verified:
        # No tokens here: the code is gone, so nothing proves the caller owns the account.
        return {"verified": True, "message": "Email already verified. Sign in to continue."}
    if user.email_verification_code != payload.code.strip():
        raise HTTPException(status_code=400, detail="That code doesn't match. Check your email and try again.")
    user.email_verified = True
    user.email_verification_code = None
    db.commit()
    access, refresh_token = issue_tokens(db, user)
    return {
        "verified": True,
        "message": "Email verified successfully",
        "tokens": TokenResponse(access_token=access, refresh_token=refresh_token).model_dump(),
    }


@router.post("/resend-verification", response_model=dict)
def resend_verification(payload: ResendVerificationRequest, db: Session = Depends(get_db)) -> dict:
    _throttle(f"resend:{payload.email}", limit=3, window_seconds=300)
    user = db.query(User).filter(User.email == payload.email.lower()).one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="No account found for that email")
    if user.email_verified:
        return {"verified": True, "message": "Email already verified"}
    code = new_verification_code(db, user)
    enqueue("app.workers.jobs.send_verification_code", user.id)
    return {"sent": True, "message": "A new code is on its way", **_verification_payload(user, code)}


@router.post("/login", response_model=TokenResponse | MfaChallenge)
def login_json(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse | MfaChallenge:
    _throttle(f"login:{payload.email}", limit=10, window_seconds=300)
    user = authenticate(db, payload.email, payload.password)
    if user.totp_enabled:
        # Password is right, but no session until the second factor is proven.
        return MfaChallenge(mfa_token=create_mfa_token(str(user.id)))
    access, refresh = issue_tokens(db, user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login/2fa", response_model=TokenResponse)
def login_second_factor(payload: MfaLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    expired = HTTPException(status_code=401, detail="Your sign-in expired. Enter your password again.")
    try:
        claims = decode_token(payload.mfa_token)
        if claims.get("type") != "mfa":
            raise expired
        user_id = int(claims["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise expired from None
    _throttle(f"mfa:{user_id}", limit=6, window_seconds=300)
    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.totp_enabled:
        raise expired
    if not two_factor.verify_second_factor(db, user, payload.code):
        raise HTTPException(status_code=400, detail="That code isn't valid. Try the latest code from your app.")
    access, refresh = issue_tokens(db, user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/login/form", response_model=TokenResponse, include_in_schema=False)
def login_form(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    user = authenticate(db, form.username, form.password)
    if user.totp_enabled:
        raise HTTPException(status_code=401, detail="Two-factor authentication is on; sign in through /auth/login")
    access, refresh = issue_tokens(db, user)
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)) -> TokenResponse:
    access, refresh_token = rotate_refresh_token(db, payload.refresh_token)
    return TokenResponse(access_token=access, refresh_token=refresh_token)


@router.post("/logout", status_code=204)
def logout(
    payload: RefreshRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    token_hash = hash_token(payload.refresh_token)
    stored = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user.id, RefreshToken.token_hash == token_hash)
        .first()
    )
    if stored:
        stored.revoked = True
        db.commit()
    return None


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/2fa", response_model=TwoFactorStatus)
def two_factor_status(user: User = Depends(get_current_user)) -> TwoFactorStatus:
    return TwoFactorStatus(enabled=user.totp_enabled, recovery_codes_left=two_factor.recovery_codes_left(user))


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
def two_factor_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFactorSetupResponse:
    secret, uri = two_factor.start_setup(db, user)
    return TwoFactorSetupResponse(secret=secret, otpauth_uri=uri)


@router.post("/2fa/enable", response_model=dict)
def two_factor_enable(
    payload: TwoFactorCodeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    _throttle(f"mfa-enable:{user.id}", limit=8, window_seconds=300)
    return {"enabled": True, "recovery_codes": two_factor.enable(db, user, payload.code)}


@router.post("/2fa/disable", status_code=204)
def two_factor_disable(
    payload: TwoFactorDisableRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    _throttle(f"mfa-disable:{user.id}", limit=6, window_seconds=300)
    if not user.totp_enabled:
        return None
    # Require both factors so a hijacked session alone can't switch 2FA off.
    if not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Wrong password")
    if not two_factor.verify_second_factor(db, user, payload.code):
        raise HTTPException(status_code=400, detail="That code isn't valid")
    two_factor.disable(db, user)
    return None
