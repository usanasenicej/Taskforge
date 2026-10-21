"""Grafana Cloud push, tested against a local HTTP server standing in for Grafana."""

import base64
import json
import logging
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace

import pytest
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram

from app.core import grafana_cloud


def test_influx_lines_keep_prometheus_names_and_escape_tags():
    registry = CollectorRegistry()
    Gauge("taskforge_queue_length", "q", registry=registry).set(3)
    Counter("taskforge_jobs_processed_total", "j", ["func", "status"], registry=registry).labels(
        func="notify task", status="success"
    ).inc(2)
    Histogram("taskforge_job_duration_seconds", "d", buckets=(1,), registry=registry).observe(0.5)

    lines = grafana_cloud.influx_lines(registry, {"job": "taskforge", "service": "api"}, 123)

    # Grafana stores <measurement>_<field>, so splitting on the last "_" restores the original name.
    assert "taskforge_queue,job=taskforge,service=api length=3.0 123" in lines
    assert "taskforge_jobs_processed,func=notify\\ task,job=taskforge,service=api,status=success total=2.0 123" in lines
    assert any(line.startswith("taskforge_job_duration_seconds,") and " bucket=1.0 " in line and "le=+Inf" in line for line in lines)
    assert not any("_created" in line or " created=" in line for line in lines)


def test_loki_payload_groups_streams_by_level():
    payload = grafana_cloud.loki_payload([(1, "info", "a"), (2, "warning", "b"), (3, "info", "c")], {"job": "taskforge"})
    streams = {s["stream"]["level"]: s for s in payload["streams"]}
    assert streams["info"]["values"] == [["1", "a"], ["3", "c"]]
    assert streams["warning"]["stream"] == {"job": "taskforge", "level": "warning"}


class _Capture(BaseHTTPRequestHandler):
    received: list[dict] = []

    def do_POST(self):  # noqa: N802
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.received.append({"path": self.path, "auth": self.headers["Authorization"], "body": body})
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


@pytest.fixture()
def fake_grafana():
    _Capture.received = []
    server = HTTPServer(("127.0.0.1", 0), _Capture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}", _Capture.received
    server.shutdown()


def test_start_pushes_metrics_and_logs_with_basic_auth(fake_grafana):
    base, received = fake_grafana
    settings = SimpleNamespace(
        app_env="test",
        grafana_cloud_metrics_url=f"{base}/api/v1/push/influx/write",
        grafana_cloud_metrics_user="111",
        grafana_cloud_logs_url=f"{base}/loki/api/v1/push",
        grafana_cloud_logs_user="222",
        grafana_cloud_token="tok",
        grafana_cloud_push_interval_seconds=60,
    )
    root = logging.getLogger()
    before = list(root.handlers)
    try:
        grafana_cloud.start(settings, "api", logging.Formatter("%(message)s"))
        logging.getLogger("app.test").warning("hello from the test")
        logging.getLogger("httpx").warning("must not be shipped")
    finally:
        grafana_cloud.stop()  # final flush sends whatever is buffered
        root.handlers[:] = before

    metrics = next(r for r in received if r["path"].endswith("/influx/write"))
    assert metrics["auth"] == "Basic " + base64.b64encode(b"111:tok").decode()
    assert b"taskforge_up" in metrics["body"] or b"service=api" in metrics["body"]

    logs = next(r for r in received if r["path"].endswith("/loki/api/v1/push"))
    assert logs["auth"] == "Basic " + base64.b64encode(b"222:tok").decode()
    lines = [v[1] for s in json.loads(logs["body"])["streams"] for v in s["values"]]
    assert "hello from the test" in lines
    assert "must not be shipped" not in lines


def test_disabled_without_credentials():
    settings = SimpleNamespace(
        grafana_cloud_metrics_url="", grafana_cloud_metrics_user="", grafana_cloud_logs_url="",
        grafana_cloud_logs_user="", grafana_cloud_token="",
    )
    assert grafana_cloud.describe(settings) == {"metrics": False, "logs": False}
