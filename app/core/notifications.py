"""Per-user notification inbox and per-org activity feed, both stored in Redis lists."""

import json
from typing import Any

import structlog

from app.core.cache import get_redis
from app.core.clock import utc_now
from app.core.events import publish_event
from app.core.telemetry import notifications

logger = structlog.get_logger(__name__)

INBOX_LIMIT = 50
ACTIVITY_LIMIT = 40


def inbox_key(user_id: int) -> str:
    return f"user:{user_id}:notifications"


def unread_key(user_id: int) -> str:
    return f"user:{user_id}:notifications:unread"


def activity_key(org_id: int) -> str:
    return f"org:{org_id}:activity"


def push_notification(
    user_id: int,
    org_id: int,
    kind: str,
    title: str,
    body: str = "",
    task_id: int | None = None,
) -> None:
    item = {
        "kind": kind,
        "title": title,
        "body": body,
        "org_id": org_id,
        "task_id": task_id,
        "created_at": utc_now().isoformat(),
    }
    try:
        client = get_redis()
        client.lpush(inbox_key(user_id), json.dumps(item))
        client.ltrim(inbox_key(user_id), 0, INBOX_LIMIT - 1)
        client.incr(unread_key(user_id))
    except Exception as exc:
        logger.warning("notification_push_failed", user_id=user_id, error=str(exc))
        return
    notifications.labels(kind=kind).inc()
    publish_event(org_id, "notification", {"user_id": user_id, **item})


def list_notifications(user_id: int) -> dict[str, Any]:
    try:
        client = get_redis()
        raw = client.lrange(inbox_key(user_id), 0, INBOX_LIMIT - 1)
        unread = int(client.get(unread_key(user_id)) or 0)
    except Exception as exc:
        logger.warning("notification_list_failed", user_id=user_id, error=str(exc))
        return {"items": [], "unread": 0}
    return {"items": [json.loads(item) for item in raw], "unread": unread}


def mark_read(user_id: int) -> None:
    try:
        get_redis().delete(unread_key(user_id))
    except Exception as exc:
        logger.warning("notification_mark_read_failed", user_id=user_id, error=str(exc))


def record_activity(org_id: int, message: dict[str, Any]) -> None:
    try:
        client = get_redis()
        client.lpush(activity_key(org_id), json.dumps(message, default=str))
        client.ltrim(activity_key(org_id), 0, ACTIVITY_LIMIT - 1)
    except Exception as exc:
        logger.warning("activity_record_failed", org_id=org_id, error=str(exc))


def list_activity(org_id: int) -> list[dict[str, Any]]:
    try:
        raw = get_redis().lrange(activity_key(org_id), 0, ACTIVITY_LIMIT - 1)
    except Exception as exc:
        logger.warning("activity_list_failed", org_id=org_id, error=str(exc))
        return []
    return [json.loads(item) for item in raw]
