import asyncio
import json

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from app.core.cache import get_redis
from app.core.events import channel_for_org
from app.core.telemetry import sse_connections
from app.deps import get_membership
from app.models import OrganizationMember

router = APIRouter()


@router.get("")
async def stream_events(
    request: Request,
    org_id: int,
    membership: OrganizationMember = Depends(get_membership),
):
    channel = channel_for_org(org_id)
    pubsub = get_redis().pubsub()
    pubsub.subscribe(channel)

    async def event_generator():
        sse_connections.inc()
        try:
            yield {"event": "ready", "data": json.dumps({"org_id": org_id, "channel": channel})}
            while True:
                if await request.is_disconnected():
                    break
                message = await asyncio.to_thread(
                    pubsub.get_message, True, 1.0
                )
                if message and message.get("type") == "message":
                    yield {"event": "taskforge", "data": message["data"]}
        except asyncio.CancelledError:
            pass
        finally:
            sse_connections.dec()
            try:
                pubsub.unsubscribe(channel)
                pubsub.close()
            except Exception:
                pass

    return EventSourceResponse(event_generator(), ping=15)

