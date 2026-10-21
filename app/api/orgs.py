from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.cache import cache_get, cache_set, invalidate_org, org_cache_key
from app.core.permissions import can_manage_role, require_role
from app.db.session import get_db
from app.core.security import hash_password
from app.deps import get_current_user, get_membership, require_admin
from app.models import Organization, OrganizationMember, User
from app.models.enums import OrgRole
from app.schemas.organization import OrganizationCreate, OrganizationOut
from app.schemas.user import MemberInvite, MemberOut, MemberRoleUpdate
from app.services.slug import slugify

router = APIRouter()


@router.get("", response_model=list[OrganizationOut])
def list_my_orgs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orgs = (
        db.query(Organization)
        .join(OrganizationMember)
        .filter(OrganizationMember.user_id == user.id)
        .all()
    )
    return orgs


@router.post("", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_org(
    payload: OrganizationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base = slugify(payload.name)
    slug = base
    n = 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        n += 1
        slug = f"{base}-{n}"
    org = Organization(name=payload.name, slug=slug)
    db.add(org)
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=OrgRole.OWNER))
    db.commit()
    db.refresh(org)
    return org


@router.get("/{org_id}", response_model=OrganizationOut)
def get_org(org_id: int, membership: OrganizationMember = Depends(get_membership), db: Session = Depends(get_db)):
    cached = cache_get(org_cache_key(org_id))
    if cached:
        return OrganizationOut.model_validate(cached)
    org = db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    out = OrganizationOut.model_validate(org)
    cache_set(org_cache_key(org_id), out.model_dump(mode="json"))
    return out


@router.get("/{org_id}/members", response_model=list[MemberOut])
def list_members(
    org_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.organization_id == org_id)
        .all()
    )
    return [
        MemberOut(
            user_id=user.id,
            email=user.email,
            full_name=user.full_name,
            role=member.role,
            created_at=member.created_at,
        )
        for member, user in rows
    ]


@router.post("/{org_id}/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
def invite_member(
    org_id: int,
    payload: MemberInvite,
    membership: OrganizationMember = Depends(require_admin),
    db: Session = Depends(get_db),
):
    require_role(membership.role, OrgRole.ADMIN)
    if not can_manage_role(membership.role, payload.role):
        raise HTTPException(status_code=403, detail="Cannot assign that role")
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if user is None:
        if not payload.password:
            raise HTTPException(status_code=400, detail="Password is required for new users")
        user = User(
            email=payload.email.lower(),
            hashed_password=hash_password(payload.password),
            full_name=payload.full_name,
            email_verified=True,
            email_verification_code=None,
        )
        db.add(user)
        db.flush()
    if not user.email_verified:
        user.email_verified = True
        user.email_verification_code = None
    existing = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User already in organization")
    member = OrganizationMember(organization_id=org_id, user_id=user.id, role=payload.role)
    db.add(member)
    db.commit()
    db.refresh(member)
    invalidate_org(org_id)
    return MemberOut(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=member.role,
        created_at=member.created_at,
    )


@router.patch("/{org_id}/members/{user_id}", response_model=MemberOut)
def update_member_role(
    org_id: int,
    user_id: int,
    payload: MemberRoleUpdate,
    membership: OrganizationMember = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .one_or_none()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == OrgRole.OWNER and membership.role != OrgRole.OWNER:
        raise HTTPException(status_code=403, detail="Cannot change an owner")
    if not can_manage_role(membership.role, payload.role):
        raise HTTPException(status_code=403, detail="Cannot assign that role")
    target.role = payload.role
    db.commit()
    user = db.get(User, user_id)
    return MemberOut(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=target.role,
        created_at=target.created_at,
    )


@router.delete("/{org_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    org_id: int,
    user_id: int,
    membership: OrganizationMember = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.organization_id == org_id, OrganizationMember.user_id == user_id)
        .one_or_none()
    )
    if target is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == OrgRole.OWNER:
        raise HTTPException(status_code=403, detail="Cannot remove an owner")
    db.delete(target)
    db.commit()
    invalidate_org(org_id)
    return None
