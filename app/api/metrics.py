from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.deps import get_membership
from app.models import OrganizationMember
from app.schemas.task import MetricsOut
from app.services.metrics import get_org_metrics

router = APIRouter()


@router.get("", response_model=MetricsOut)
def org_metrics(
    org_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    return get_org_metrics(db, org_id)
