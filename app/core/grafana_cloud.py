"""Push metrics and logs to Grafana Cloud over HTTPS, with no local agent.

Metrics: the Prometheus registry is converted to Influx line protocol and POSTed to the stack's
Influx-compatible endpoint (``/api/v1/push/influx/write``). Grafana names each series
``<measurement>_<field>``, so a sample ``taskforge_queue_length`` is sent as measurement
``taskforge_queue`` + field ``length`` and lands with its original name.

Logs: formatted log lines are batched and POSTed to Loki (``/loki/api/v1/push``).

Both use Basic auth: the instance/user ID from the Grafana Cloud portal and a Cloud Access Policy
token with metrics:write and logs:write. Everything is a no-op until those settings are present.
"""

import logging
import queue
import re
import threading
import time
from typing import Any

import httpx
from prometheus_client import REGISTRY, CollectorRegistry

from app.config import Settings

log = logging.getLogger(__name__)

# Loggers whose records must never be shipped: shipping them would log another request, forever.
_SELF_LOGGERS = ("httpx", "httpcore", __name__)
_ESCAPE_TAG = re.compile(r"([,= ])")

_threads: list["_Worker"] = []


def _escape(value: str) -> str:
    return _ESCAPE_TAG.sub(r"\\\1", value.replace("\\", "\\\\").replace("\n", " "))


def influx_lines(registry: CollectorRegistry, extra_labels: dict[str, str], timestamp_ns: int) -> list[str]:
    lines: list[str] = []
    for family in registry.collect():
        for sample in family.samples:
            # *_created is a per-series start time; it doubles series count for no dashboard value.
            if sample.name.endswith("_created") or "_" not in sample.name:
                continue
            value = float(sample.value)
            if value != value or value in (float("inf"), float("-inf")):  # NaN / Inf aren't valid Influx floats
                continue
            measurement, field = sample.name.rsplit("_", 1)
            labels = {**extra_labels, **sample.labels}
            tags = "".join(f",{_escape(k)}={_escape(str(v))}" for k, v in sorted(labels.items()) if str(v) != "")
            lines.append(f"{_escape(measurement)}{tags} {_escape(field)}={value!r} {timestamp_ns}")
    return lines


def loki_payload(entries: list[tuple[int, str, str]], labels: dict[str, str]) -> dict[str, Any]:
    """entries: (timestamp_ns, level, line). One stream per level so LogQL can filter on it cheaply."""
    streams: dict[str, list[list[str]]] = {}
    for ts, level, line in entries:
        streams.setdefault(level, []).append([str(ts), line])
    return {"streams": [{"stream": {**labels, "level": level}, "values": values} for level, values in streams.items()]}


class _Worker(threading.Thread):
    def __init__(self, interval: float) -> None:
        super().__init__(daemon=True)
        self.interval = interval
        self.stopped = threading.Event()
        self._failures = 0

    def run(self) -> None:
        while not self.stopped.wait(self.interval):
            self.tick()
        self.tick()  # final flush on shutdown

    def tick(self) -> None:
        raise NotImplementedError

    def _post(self, client: httpx.Client, url: str, **kwargs: Any) -> None:
        try:
            response = client.post(url, **kwargs)
            if response.status_code >= 300:
                raise httpx.HTTPStatusError(response.text[:200], request=response.request, response=response)
            if self._failures:
                log.warning("grafana_cloud_push_recovered target=%s", self.name)
            self._failures = 0
        except httpx.HTTPError as exc:
            self._failures += 1
            # Warn on the first failure and then rarely, so an outage doesn't flood the logs.
            if self._failures in (1, 10) or self._failures % 100 == 0:
                log.warning("grafana_cloud_push_failed target=%s attempts=%s error=%s", self.name, self._failures, exc)


class MetricsPusher(_Worker):
    def __init__(self, url: str, user: str, token: str, labels: dict[str, str], interval: float) -> None:
        super().__init__(interval)
        self.name = "grafana-metrics"
        self.url, self.labels = url, labels
        self.client = httpx.Client(auth=(user, token), timeout=10)

    def tick(self) -> None:
        lines = influx_lines(REGISTRY, self.labels, time.time_ns())
        if lines:
            self._post(self.client, self.url, content="\n".join(lines).encode(), headers={"Content-Type": "text/plain"})


class LokiHandler(logging.Handler):
    """Buffers formatted records; a background thread ships them in batches."""

    def __init__(self, capacity: int = 5000) -> None:
        super().__init__()
        self.buffer: queue.Queue[tuple[int, str, str]] = queue.Queue(maxsize=capacity)

    def emit(self, record: logging.LogRecord) -> None:
        if record.name.startswith(_SELF_LOGGERS):
            return
        try:
            self.buffer.put_nowait((time.time_ns(), record.levelname.lower(), self.format(record)))
        except queue.Full:
            pass  # never block the app on log shipping
        except Exception:
            self.handleError(record)


class LogShipper(_Worker):
    def __init__(self, handler: LokiHandler, url: str, user: str, token: str, labels: dict[str, str], interval: float) -> None:
        super().__init__(interval)
        self.name = "grafana-logs"
        self.handler, self.url, self.labels = handler, url, labels
        self.client = httpx.Client(auth=(user, token), timeout=10)

    def tick(self) -> None:
        entries: list[tuple[int, str, str]] = []
        while len(entries) < 1000:
            try:
                entries.append(self.handler.buffer.get_nowait())
            except queue.Empty:
                break
        if entries:
            self._post(self.client, self.url, json=loki_payload(entries, self.labels))


def metrics_enabled(settings: Settings) -> bool:
    return bool(settings.grafana_cloud_token and settings.grafana_cloud_metrics_url and settings.grafana_cloud_metrics_user)


def logs_enabled(settings: Settings) -> bool:
    return bool(settings.grafana_cloud_token and settings.grafana_cloud_logs_url and settings.grafana_cloud_logs_user)


def start(settings: Settings, service: str, formatter: logging.Formatter | None = None) -> None:
    """Start pushing for this process. Safe to call when Grafana Cloud isn't configured."""
    if _threads:
        return
    labels = {"job": "taskforge", "service": service, "env": settings.app_env}
    interval = settings.grafana_cloud_push_interval_seconds
    if metrics_enabled(settings):
        _threads.append(
            MetricsPusher(
                settings.grafana_cloud_metrics_url,
                settings.grafana_cloud_metrics_user,
                settings.grafana_cloud_token,
                labels,
                interval,
            )
        )
    if logs_enabled(settings):
        handler = LokiHandler()
        if formatter is not None:
            handler.setFormatter(formatter)
        logging.getLogger().addHandler(handler)
        _threads.append(
            LogShipper(
                handler,
                settings.grafana_cloud_logs_url,
                settings.grafana_cloud_logs_user,
                settings.grafana_cloud_token,
                labels,
                interval=min(interval, 5),
            )
        )
    for thread in _threads:
        thread.start()
    log.info(
        "grafana_cloud_push service=%s metrics=%s logs=%s",
        service,
        metrics_enabled(settings),
        logs_enabled(settings),
    )


def stop() -> None:
    for thread in _threads:
        thread.stopped.set()
    for thread in _threads:
        thread.join(timeout=5)
    _threads.clear()


def describe(settings: Settings) -> dict[str, Any]:
    return {"metrics": metrics_enabled(settings), "logs": logs_enabled(settings)}

