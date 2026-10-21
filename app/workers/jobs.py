import structlog

from app.core.clock import utc_now
from app.core.notifications import push_notification
from app.db.session import SessionLocal
from app.models import Comment, Task, User
from app.services.auth import send_verification_email
from app.services.email import send_email
from app.services.tasks import find_overdue_tasks

logger = structlog.get_logger(__name__)


def _name(db, user_id: int | None) -> str:
    user = db.get(User, user_id) if user_id else None
    return user.full_name if user else "Someone"


def send_verification_code(user_id: int) -> bool:
    db = SessionLocal()
    try:
        user = db.get(User, user_id)
        if user is None or user.email_verified or not user.email_verification_code:
            return False
        return send_verification_email(user, user.email_verification_code)
    finally:
        db.close()


def notify_task_assigned(task_id: int, user_id: int, actor_id: int | None = None) -> None:
    db = SessionLocal()
    try:
        task = db.get(Task, task_id)
        user = db.get(User, user_id)
        if task is None or user is None:
            return
        actor = _name(db, actor_id)
        send_email(
            user.email,
            f"[TaskForge] You were assigned: {task.title}",
            f"Hello {user.full_name},\n\n{actor} assigned you to task #{task.id}: {task.title}.\n"
            f"Priority: {task.priority.value}\nStatus: {task.status.value}\n",
        )
        push_notification(
            user.id,
            task.organization_id,
            "assigned",
            f"{actor} assigned you a task",
            task.title,
            task_id=task.id,
        )
    finally:
        db.close()


def notify_task_updated(
    task_id: int,
    user_id: int,
    changes: dict | None = None,
    actor_id: int | None = None,
) -> None:
    db = SessionLocal()
    try:
        task = db.get(Task, task_id)
        user = db.get(User, user_id)
        if task is None or user is None:
            return
        actor = _name(db, actor_id)
        summary = [
            f"{key.replace('_', ' ').title()}: {old} → {new}" for key, (old, new) in (changes or {}).items()
        ] or ["Task details were updated"]
        send_email(
            user.email,
            f"[TaskForge] Task updated: {task.title}",
            f"Hello {user.full_name},\n\n{actor} updated task #{task.id}: {task.title}.\n"
            + "\n".join(f"- {item}" for item in summary),
        )
        push_notification(
            user.id,
            task.organization_id,
            "updated",
            f"{actor} updated {task.title}",
            "; ".join(summary),
            task_id=task.id,
        )
    finally:
        db.close()


def notify_comment_added(comment_id: int, user_id: int) -> None:
    db = SessionLocal()
    try:
        comment = db.get(Comment, comment_id)
        user = db.get(User, user_id)
        if comment is None or user is None:
            return
        task = db.get(Task, comment.task_id)
        actor = _name(db, comment.user_id)
        send_email(
            user.email,
            f"[TaskForge] New comment on {task.title}",
            f"{actor} wrote:\n\n{comment.body}",
        )
        push_notification(
            user.id,
            task.organization_id,
            "comment",
            f"{actor} commented on {task.title}",
            comment.body[:140],
            task_id=task.id,
        )
    finally:
        db.close()


def notify_task_overdue(task_id: int) -> None:
    db = SessionLocal()
    try:
        task = db.get(Task, task_id)
        if task is None or task.overdue_notified_at is not None:
            return
        assignee_ids = [a.user_id for a in task.assignees]
        users = db.query(User).filter(User.id.in_(assignee_ids)).all() if assignee_ids else []
        if not users:
            creator = db.get(User, task.created_by)
            users = [creator] if creator else []
        for user in users:
            send_email(
                user.email,
                f"[TaskForge] Overdue: {task.title}",
                f"Task #{task.id} '{task.title}' is past its due date.",
            )
            push_notification(
                user.id,
                task.organization_id,
                "overdue",
                "A task is overdue",
                task.title,
                task_id=task.id,
            )
        task.overdue_notified_at = utc_now()
        db.commit()
    finally:
        db.close()


def scan_overdue_tasks() -> int:
    db = SessionLocal()
    try:
        tasks = find_overdue_tasks(db)
        from app.core.queue import enqueue

        for task in tasks:
            enqueue("app.workers.jobs.notify_task_overdue", task.id)
        logger.info("overdue_scan_complete", count=len(tasks))
        return len(tasks)
    finally:
        db.close()
