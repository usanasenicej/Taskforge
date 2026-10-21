from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.cache import invalidate_org
from app.core.queue import enqueue, get_queue
from app.db.session import get_db
from app.deps import require_internal_key
from app.services.tasks import find_overdue_tasks

router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.post("/rpc/tasks.scan_overdue")
def rpc_scan_overdue(db: Session = Depends(get_db)) -> dict:
    tasks = find_overdue_tasks(db)
    for task in tasks:
        enqueue("app.workers.jobs.notify_task_overdue", task.id)
    return {"enqueued": len(tasks)}


@router.post("/rpc/cache.invalidate")
def rpc_invalidate(org_id: int) -> dict:
    invalidate_org(org_id)
    return {"invalidated": True, "org_id": org_id}


@router.get("/rpc/queue.stats")
def rpc_queue_stats() -> dict:
    queue = get_queue()
    return {
        "name": queue.name,
        "count": queue.count,
        "failed": queue.failed_job_registry.count,
        "started": queue.started_job_registry.count,
        "finished": queue.finished_job_registry.count,
    }
