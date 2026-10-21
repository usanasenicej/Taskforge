from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.cache import cache_delete, invalidate_org, project_cache_key
from app.core.clock import utc_now
from app.core.events import publish_event
from app.core.queue import enqueue
from app.models import OrganizationMember, Project, Task, TaskAssignee, User
from app.models.enums import TaskStatus
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate

TRACKED_FIELDS = ("title", "status", "priority", "due_date")


def serialize_task(task: Task) -> TaskOut:
    return TaskOut(
        id=task.id,
        organization_id=task.organization_id,
        project_id=task.project_id,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        created_by=task.created_by,
        assignee_ids=[a.user_id for a in task.assignees],
        comment_count=len(task.comments),
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _assert_assignees_in_org(db: Session, org_id: int, user_ids: list[int]) -> None:
    if not user_ids:
        return
    unique = set(user_ids)
    count = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id.in_(unique),
        )
        .count()
    )
    if count != len(unique):
        raise HTTPException(status_code=400, detail="Assignees must belong to the organization")


def _replace_assignees(db: Session, task: Task, user_ids: list[int], actor_id: int) -> list[int]:
    previous = {a.user_id for a in task.assignees}
    incoming = list(dict.fromkeys(user_ids))
    task.assignees.clear()
    db.flush()
    for uid in incoming:
        task.assignees.append(TaskAssignee(user_id=uid))
    added = [uid for uid in incoming if uid not in previous]
    for uid in added:
        if uid != actor_id:
            enqueue("app.workers.jobs.notify_task_assigned", task.id, uid, actor_id)
    return added


def get_project_in_org(db: Session, org_id: int, project_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.organization_id == org_id)
        .one_or_none()
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def create_task(db: Session, org_id: int, project_id: int, user: User, payload: TaskCreate) -> Task:
    get_project_in_org(db, org_id, project_id)
    _assert_assignees_in_org(db, org_id, payload.assignee_ids)
    task = Task(
        organization_id=org_id,
        project_id=project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        created_by=user.id,
    )
    db.add(task)
    db.flush()
    _replace_assignees(db, task, payload.assignee_ids, actor_id=user.id)
    db.commit()
    db.refresh(task)
    invalidate_org(org_id)
    cache_delete(project_cache_key(project_id))
    publish_event(org_id, "task.created", serialize_task(task).model_dump(mode="json"), actor_id=user.id)
    return task


def _utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()


def _snapshot(task: Task) -> dict:
    return {
        "title": task.title,
        "status": task.status.value,
        "priority": task.priority.value,
        "due_date": _utc_iso(task.due_date),
    }


def update_task(db: Session, task: Task, payload: TaskUpdate, actor: User) -> Task:
    data = payload.model_dump(exclude_unset=True)
    assignee_ids = data.pop("assignee_ids", None)
    before = _snapshot(task)
    for field, value in data.items():
        setattr(task, field, value)
    if assignee_ids is not None:
        _assert_assignees_in_org(db, task.organization_id, assignee_ids)
        _replace_assignees(db, task, assignee_ids, actor_id=actor.id)
    if data.get("status") is not None and data["status"] != TaskStatus.DONE:
        # Reopened or moved: allow a fresh overdue reminder later.
        task.overdue_notified_at = None
    db.flush()
    after = _snapshot(task)
    changes = {key: [before[key], after[key]] for key in TRACKED_FIELDS if before[key] != after[key]}
    if changes:
        for assignee in task.assignees:
            if assignee.user_id != actor.id:
                enqueue("app.workers.jobs.notify_task_updated", task.id, assignee.user_id, changes, actor.id)
    db.commit()
    db.refresh(task)
    invalidate_org(task.organization_id)
    cache_delete(project_cache_key(task.project_id))
    publish_event(
        task.organization_id,
        "task.updated",
        {**serialize_task(task).model_dump(mode="json"), "changes": changes},
        actor_id=actor.id,
    )
    return task


def find_overdue_tasks(db: Session) -> list[Task]:
    now = utc_now()
    return (
        db.query(Task)
        .filter(
            Task.due_date.is_not(None),
            Task.due_date < now,
            Task.status != TaskStatus.DONE,
            Task.overdue_notified_at.is_(None),
        )
        .all()
    )
