from fastapi import HTTPException, status

from app.models.enums import OrgRole

ROLE_RANK = {
    OrgRole.VIEWER: 1,
    OrgRole.MEMBER: 2,
    OrgRole.ADMIN: 3,
    OrgRole.OWNER: 4,
}


def require_role(actual: OrgRole, minimum: OrgRole) -> None:
    if ROLE_RANK[actual] < ROLE_RANK[minimum]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires at least {minimum.value} role",
        )


def can_manage_role(actor: OrgRole, target: OrgRole) -> bool:
    if actor == OrgRole.OWNER:
        return True
    if actor == OrgRole.ADMIN:
        return target in {OrgRole.MEMBER, OrgRole.VIEWER, OrgRole.ADMIN}
    return False
