import json
from typing import Any

import structlog

from app.core.cache import get_redis
from app.core.clock import utc_now

logger = structlog.get_logger(__name__)

# Events that describe something a person did; these also land in the org activity feed.
ACTIVITY_EVENTS = {"task.created", "task.updated", "task.deleted", "comment.created", "project.created"}


def channel_for_org(org_id: int) -> str:
    return f"org:{org_id}:events"


def publish_event(
    org_id: int,
    event_type: str,
    payload: dict[str, Any],
    actor_id: int | None = None,
) -> None:
    message = {
        "type": event_type,
        "org_id": org_id,
        "actor_id": actor_id,
        "payload": payload,
        "occurred_at": utc_now().isoformat(),
    }
    if event_type in ACTIVITY_EVENTS:
        from app.core.notifications import record_activity

        record_activity(org_id, message)
    try:
        get_redis().publish(channel_for_org(org_id), json.dumps(message, default=str))
        logger.info("event_published", org_id=org_id, event_type=event_type)
    except Exception as exc:
        logger.warning("event_publish_failed", org_id=org_id, event_type=event_type, error=str(exc))
