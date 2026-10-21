from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models import OrganizationMember, User
from app.models.enums import OrgRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login/form")
settings = get_settings()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        subject = payload.get("sub")
        if subject is None:
            raise credentials_error
        user_id = int(subject)
    except (InvalidTokenError, ValueError):
        raise credentials_error from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_error
    return user


def get_membership(
    org_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> OrganizationMember:
    membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
        )
        .one_or_none()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return membership


class RoleChecker:
    def __init__(self, minimum: OrgRole):
        self.minimum = minimum

    def __call__(self, membership: OrganizationMember = Depends(get_membership)) -> OrganizationMember:
        from app.core.permissions import require_role

        require_role(membership.role, self.minimum)
        return membership


require_viewer = RoleChecker(OrgRole.VIEWER)
require_member = RoleChecker(OrgRole.MEMBER)
require_admin = RoleChecker(OrgRole.ADMIN)
require_owner = RoleChecker(OrgRole.OWNER)


def require_internal_key(x_internal_key: str = Header(..., alias="X-Internal-Key")) -> None:
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal key")
