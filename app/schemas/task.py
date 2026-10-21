from pydantic import Field

from app.models.enums import TaskPriority, TaskStatus
from app.schemas.common import ORMModel, UTCDateTime


class TaskCreate(ORMModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    due_date: UTCDateTime | None = None
    assignee_ids: list[int] = Field(default_factory=list)


class TaskUpdate(ORMModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    due_date: UTCDateTime | None = None
    assignee_ids: list[int] | None = None


class TaskOut(ORMModel):
    id: int
    organization_id: int
    project_id: int
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    due_date: UTCDateTime | None
    created_by: int
    assignee_ids: list[int]
    comment_count: int = 0
    created_at: UTCDateTime
    updated_at: UTCDateTime


class CommentCreate(ORMModel):
    body: str = Field(min_length=1, max_length=4000)


class CommentOut(ORMModel):
    id: int
    task_id: int
    user_id: int
    body: str
    created_at: UTCDateTime


class MetricsOut(ORMModel):
    organization_id: int
    tasks_total: int
    tasks_created_today: int
    tasks_by_status: dict[str, int]
    tasks_overdue: int
    open_tasks: int
