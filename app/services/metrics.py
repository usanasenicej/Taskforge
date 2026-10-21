from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.cache import cache_get, cache_set, metrics_cache_key
from app.core.clock import utc_now
from app.models import Task
from app.models.enums import TaskStatus
from app.schemas.task import MetricsOut


def get_org_metrics(db: Session, org_id: int) -> MetricsOut:
    settings = get_settings()
    cached = cache_get(metrics_cache_key(org_id))
    if cached:
        return MetricsOut.model_validate(cached)

    start_of_day = utc_now().replace(hour=0, minute=0, second=0, microsecond=0)
    total = db.query(func.count(Task.id)).filter(Task.organization_id == org_id).scalar() or 0
    created_today = (
        db.query(func.count(Task.id))
        .filter(Task.organization_id == org_id, Task.created_at >= start_of_day)
        .scalar()
        or 0
    )
    overdue = (
        db.query(func.count(Task.id))
        .filter(
            Task.organization_id == org_id,
            Task.due_date.is_not(None),
            Task.due_date < utc_now(),
            Task.status != TaskStatus.DONE,
        )
        .scalar()
        or 0
    )
    rows = (
        db.query(Task.status, func.count(Task.id))
        .filter(Task.organization_id == org_id)
        .group_by(Task.status)
        .all()
    )
    by_status = {status.value: 0 for status in TaskStatus}
    for status, count in rows:
        by_status[status.value] = count
    open_tasks = total - by_status.get(TaskStatus.DONE.value, 0)
    metrics = MetricsOut(
        organization_id=org_id,
        tasks_total=total,
        tasks_created_today=created_today,
        tasks_by_status=by_status,
        tasks_overdue=overdue,
        open_tasks=open_tasks,
    )
    cache_set(metrics_cache_key(org_id), metrics.model_dump(), ttl=settings.metrics_cache_ttl_seconds)
    return metrics


def created_in_window(db: Session, org_id: int, hours: int = 24) -> int:
    cutoff = utc_now() - timedelta(hours=hours)
    return (
        db.query(func.count(Task.id))
        .filter(Task.organization_id == org_id, Task.created_at >= cutoff)
        .scalar()
        or 0
    )
