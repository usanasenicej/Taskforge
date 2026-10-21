from fastapi import APIRouter, Depends

from app.core.notifications import list_activity, list_notifications, mark_read
from app.deps import get_current_user, get_membership
from app.models import OrganizationMember, User

router = APIRouter()


@router.get("/notifications")
def my_notifications(user: User = Depends(get_current_user)) -> dict:
    return list_notifications(user.id)


@router.post("/notifications/read", status_code=204)
def read_notifications(user: User = Depends(get_current_user)) -> None:
    mark_read(user.id)


@router.get("/orgs/{org_id}/activity")
def org_activity(org_id: int, membership: OrganizationMember = Depends(get_membership)) -> list[dict]:
    return list_activity(org_id)
