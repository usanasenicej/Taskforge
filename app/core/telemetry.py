"""Application metrics (Prometheus client). Scraped at /metrics, or pushed to Grafana Cloud by app.core.grafana_cloud."""

from prometheus_client import Counter, Gauge, Histogram

# Every process sets this to 1 at start, so "absent for 2m" means the service is down
# even when nothing scrapes it (push mode has no Prometheus `up` series).
service_up = Gauge("taskforge_up", "1 while the service process is running", ["service"])

queue_length = Gauge("taskforge_queue_length", "Jobs waiting in the RQ queue")
db_pool_checked_out = Gauge("taskforge_db_pool_checked_out", "SQLAlchemy connections currently checked out")
sse_connections = Gauge("taskforge_sse_connections", "Open Server-Sent Events streams")

cache_requests = Counter("taskforge_cache_requests_total", "Cache lookups", ["result"])
jobs_enqueued = Counter("taskforge_jobs_enqueued_total", "Background jobs enqueued", ["func"])
jobs_processed = Counter("taskforge_jobs_processed_total", "Background jobs finished", ["func", "status"])
job_duration = Histogram(
    "taskforge_job_duration_seconds",
    "Background job run time",
    ["func"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30),
)
emails = Counter("taskforge_emails_total", "Outgoing emails", ["result"])
notifications = Counter("taskforge_notifications_total", "In-app notifications delivered", ["kind"])


def short_func(func_path: str) -> str:
    """'app.workers.jobs.notify_task_assigned' -> 'notify_task_assigned' (keeps label values short)."""
    return func_path.rsplit(".", 1)[-1]
