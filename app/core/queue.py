import importlib
from typing import Any

import structlog
from rq import Queue

from app.config import get_settings
from app.core.cache import get_redis_raw
from app.core.telemetry import jobs_enqueued, short_func

logger = structlog.get_logger(__name__)
_queue: Any = None


class _LocalRegistry:
    def __init__(self) -> None:
        self.count = 0


class InMemoryQueue:
    """Fallback queue when Redis is not running locally."""

    def __init__(self, name: str = "taskforge") -> None:
        self.name = name
        self.count = 0
        self.failed_job_registry = _LocalRegistry()
        self.started_job_registry = _LocalRegistry()
        self.finished_job_registry = _LocalRegistry()

    def enqueue(self, func_path: str, *args: Any, **kwargs: Any) -> None:
        try:
            module_name, func_name = func_path.rsplit(".", 1)
            module = importlib.import_module(module_name)
            func = getattr(module, func_name)
            func(*args, **kwargs)
            self.finished_job_registry.count += 1
        except Exception as exc:
            self.failed_job_registry.count += 1
            logger.warning("local_job_execution_failed", func_path=func_path, error=str(exc))
        return None


def get_queue() -> Any:
    global _queue
    if _queue is None:
        settings = get_settings()
        conn = get_redis_raw()
        if getattr(conn, "is_memory_fallback", False):
            _queue = InMemoryQueue(settings.rq_queue_name)
        else:
            _queue = Queue(settings.rq_queue_name, connection=conn)
    return _queue


def enqueue(func_path: str, *args: Any, **kwargs: Any) -> Any:
    jobs_enqueued.labels(func=short_func(func_path)).inc()
    try:
        return get_queue().enqueue(func_path, *args, **kwargs)
    except Exception as exc:
        logger.warning("queue_enqueue_failed", func_path=func_path, error=str(exc))
        return None


def redis_connection() -> Any:
    return get_redis_raw()

