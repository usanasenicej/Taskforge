import secrets
from datetime import UTC
from html import escape

import structlog
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.clock import utc_now
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models import Organization, OrganizationMember, RefreshToken, User
from app.models.enums import OrgRole
from app.schemas.auth import RegisterRequest
from app.services.email import send_email
from app.services.slug import slugify

logger = structlog.get_logger(__name__)


def _generate_verification_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def send_verification_email(user: User, code: str) -> bool:
    subject = "Verify your TaskForge email"
    body = (
        f"Hello {user.full_name},\n\n"
        f"Your verification code is: {code}\n\n"
        "Use this code to confirm your email and finish creating your workspace."
    )
    html_body = f"""\
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background-color:#f1f5f1;font-family:Arial,Helvetica,sans-serif;color:#19342a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5ece6;border-radius:18px;overflow:hidden;">
      <tr>
        <td style="padding:26px 32px;background:#173b30;color:#ffffff;">
          <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#d8ef83;">TaskForge</div>
          <div style="margin-top:8px;font-size:12px;color:#c8d8ce;">A calmer way to move work forward</div>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#19342a;">Confirm your email</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#62766b;">Hello {escape(user.full_name)}, enter this verification code to finish setting up your workspace.</p>
          <div style="padding:18px 20px;text-align:center;border:1px solid #e5ece6;border-radius:14px;background:#f5f8f4;">
            <div style="font-size:12px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:#718379;">Your verification code</div>
            <div style="margin-top:8px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#17724f;">{escape(code)}</div>
          </div>
          <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#718379;">If you didn't create a TaskForge account, you can safely ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;border-top:1px solid #edf1ed;font-size:12px;color:#89978f;">TaskForge · Keep your team's work moving.</td>
      </tr>
    </table>
  </body>
</html>
"""
    return send_email(user.email, subject, body, html_body)


def _unique_slug(db: Session, name: str) -> str:
    base = slugify(name)
    slug = base
    suffix = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        suffix += 1
        slug = f"{base}-{suffix}"
    return slug


def register_user(db: Session, payload: RegisterRequest) -> tuple[User, Organization]:
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    verification_code = _generate_verification_code()
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        email_verified=False,
        email_verification_code=verification_code,
    )
    org = Organization(name=payload.organization_name, slug=_unique_slug(db, payload.organization_name))
    db.add_all([user, org])
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER))
    db.commit()
    db.refresh(user)
    db.refresh(org)
    return user, org


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email.lower()).first()
    if user is None or not verify_password(password, user.hashed_password) or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified")
    return user


def new_verification_code(db: Session, user: User) -> str:
    code = _generate_verification_code()
    user.email_verification_code = code
    db.commit()
    return code


def issue_tokens(db: Session, user: User) -> tuple[str, str]:
    access = create_access_token(str(user.id), extra={"email": user.email})
    raw, token_hash, expires = generate_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires))
    db.commit()
    return access, raw


def rotate_refresh_token(db: Session, raw_token: str) -> tuple[str, str]:
    token_hash = hash_token(raw_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if stored is None or stored.revoked:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    expires = stored.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < utc_now():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    stored.revoked = True
    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return issue_tokens(db, user)
