from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.core.cache import cache_delete, invalidate_org, project_cache_key
from app.core.events import publish_event
from app.core.queue import enqueue
from app.db.session import get_db
from app.deps import get_current_user, get_membership, require_member
from app.models import Comment, OrganizationMember, Task, User
from app.models.enums import TaskPriority, TaskStatus
from app.schemas.task import CommentCreate, CommentOut, TaskCreate, TaskOut, TaskUpdate
from app.services.tasks import create_task, serialize_task, update_task

router = APIRouter()

_TASK_LOAD = (selectinload(Task.assignees), selectinload(Task.comments))


def _get_task(db: Session, org_id: int, task_id: int) -> Task:
    task = (
        db.query(Task)
        .options(*_TASK_LOAD)
        .filter(Task.id == task_id, Task.organization_id == org_id)
        .one_or_none()
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
def list_project_tasks(
    org_id: int,
    project_id: int,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    priority: TaskPriority | None = None,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Task)
        .options(*_TASK_LOAD)
        .filter(Task.organization_id == org_id, Task.project_id == project_id)
    )
    if status_filter:
        query = query.filter(Task.status == status_filter)
    if priority:
        query = query.filter(Task.priority == priority)
    tasks = query.order_by(Task.id.desc()).all()
    return [serialize_task(task) for task in tasks]


@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_project_task(
    org_id: int,
    project_id: int,
    payload: TaskCreate,
    membership: OrganizationMember = Depends(require_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = create_task(db, org_id, project_id, user, payload)
    return serialize_task(task)


@router.get("/tasks", response_model=list[TaskOut])
def list_org_tasks(
    org_id: int,
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    query = db.query(Task).options(*_TASK_LOAD).filter(Task.organization_id == org_id)
    if status_filter:
        query = query.filter(Task.status == status_filter)
    tasks = query.order_by(Task.updated_at.desc(), Task.id.desc()).limit(500).all()
    return [serialize_task(task) for task in tasks]


@router.get("/tasks/{task_id}", response_model=TaskOut)
def get_task(
    org_id: int,
    task_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    return serialize_task(_get_task(db, org_id, task_id))


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def patch_task(
    org_id: int,
    task_id: int,
    payload: TaskUpdate,
    membership: OrganizationMember = Depends(require_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_task(db, org_id, task_id)
    return serialize_task(update_task(db, task, payload, actor=user))


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    org_id: int,
    task_id: int,
    membership: OrganizationMember = Depends(require_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_task(db, org_id, task_id)
    project_id = task.project_id
    title = task.title
    db.delete(task)
    db.commit()
    invalidate_org(org_id)
    cache_delete(project_cache_key(project_id))
    publish_event(org_id, "task.deleted", {"id": task_id, "project_id": project_id, "title": title}, actor_id=user.id)
    return None


@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut])
def list_comments(
    org_id: int,
    task_id: int,
    membership: OrganizationMember = Depends(get_membership),
    db: Session = Depends(get_db),
):
    _get_task(db, org_id, task_id)
    return (
        db.query(Comment)
        .filter(Comment.task_id == task_id, Comment.organization_id == org_id)
        .order_by(Comment.created_at.asc(), Comment.id.asc())
        .all()
    )


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    org_id: int,
    task_id: int,
    payload: CommentCreate,
    membership: OrganizationMember = Depends(require_member),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = _get_task(db, org_id, task_id)
    comment = Comment(organization_id=org_id, task_id=task_id, user_id=user.id, body=payload.body)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    for assignee in task.assignees:
        if assignee.user_id != user.id:
            enqueue("app.workers.jobs.notify_comment_added", comment.id, assignee.user_id)
    publish_event(
        org_id,
        "comment.created",
        {"task_id": task_id, "title": task.title, "comment_id": comment.id, "body": comment.body[:140]},
        actor_id=user.id,
    )
    return comment
