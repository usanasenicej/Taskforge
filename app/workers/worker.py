"""Start with: python -m app.workers.worker"""

import os
import threading
import time

import structlog
from prometheus_client import start_http_server
from rq import SimpleWorker
from rq.timeouts import TimerDeathPenalty, UnixSignalDeathPenalty

from app.config import get_settings
from app.core import grafana_cloud
from app.core.queue import enqueue, get_queue, redis_connection
from app.core.telemetry import job_duration, jobs_processed, queue_length, service_up, short_func
from app.logging import configure_logging

logger = structlog.get_logger(__name__)


class InstrumentedWorker(SimpleWorker):
    """Runs jobs in-process (no fork) so job metrics are recorded in this process and can be
    scraped or pushed. On Windows, fork() and SIGALRM don't exist, so timeouts use a thread timer."""

    death_penalty_class = TimerDeathPenalty if os.name == "nt" else UnixSignalDeathPenalty

    def perform_job(self, job, queue) -> bool:  # type: ignore[no-untyped-def]
        func = short_func(job.func_name)
        started = time.perf_counter()
        ok = super().perform_job(job, queue)
        job_duration.labels(func=func).observe(time.perf_counter() - started)
        jobs_processed.labels(func=func, status="success" if ok else "failed").inc()
        return ok


def _background(interval: int, stop: threading.Event) -> None:
    # Locally there is no Kubernetes CronJob, so the worker enqueues the overdue scan itself.
    scan_every = max(interval, 1)
    last_scan = time.monotonic()
    while not stop.wait(5):
        try:
            queue_length.set(get_queue().count)
        except Exception:
            pass
        if interval > 0 and time.monotonic() - last_scan >= scan_every:
            enqueue("app.workers.jobs.scan_overdue_tasks")
            last_scan = time.monotonic()


def main() -> None:
    settings = get_settings()
    json_formatter = configure_logging(settings)
    connection = redis_connection()
    if getattr(connection, "is_memory_fallback", False):
        raise SystemExit(f"Redis is not reachable at {settings.redis_url}; start it before the worker.")

    service_up.labels(service="worker").set(1)
    if settings.worker_metrics_port:
        # Localhost only on a dev machine; in a pod, Prometheus scrapes it over the pod network.
        addr = "127.0.0.1" if settings.app_env == "development" else "0.0.0.0"
        start_http_server(settings.worker_metrics_port, addr=addr)
    grafana_cloud.start(settings, "worker", json_formatter)

    stop = threading.Event()
    if settings.overdue_scan_interval_seconds > 0:
        enqueue("app.workers.jobs.scan_overdue_tasks")
    threading.Thread(target=_background, args=(settings.overdue_scan_interval_seconds, stop), daemon=True).start()
    logger.info("worker_starting", queue=settings.rq_queue_name, metrics_port=settings.worker_metrics_port)
    try:
        InstrumentedWorker([get_queue()], connection=connection).work()
    finally:
        stop.set()
        grafana_cloud.stop()


if __name__ == "__main__":
    main()
