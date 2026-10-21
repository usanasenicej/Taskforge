"""Generates monitoring/grafana-dashboard.json. Run: python monitoring/build_dashboard.py

Kept as code so panels stay consistent; import the JSON in Grafana (Dashboards -> New -> Import)
and pick your Prometheus and Loki data sources when asked.
"""

import json
from pathlib import Path

PROM = {"type": "prometheus", "uid": "${DS_PROMETHEUS}"}
LOKI = {"type": "loki", "uid": "${DS_LOKI}"}
SEL = 'job="taskforge", env=~"$env"'

panels: list[dict] = []


def add(panel: dict, w: int, h: int) -> None:
    # Simple left-to-right flow layout on Grafana's 24-column grid.
    x = add.x if add.x + w <= 24 else 0  # type: ignore[attr-defined]
    if x == 0 and add.x != 0:  # type: ignore[attr-defined]
        add.y += add.row_h  # type: ignore[attr-defined]
        add.row_h = 0  # type: ignore[attr-defined]
    panel["gridPos"] = {"x": x, "y": add.y, "w": w, "h": h}  # type: ignore[attr-defined]
    panel["id"] = len(panels) + 1
    panels.append(panel)
    add.x = x + w  # type: ignore[attr-defined]
    add.row_h = max(add.row_h, h)  # type: ignore[attr-defined]


add.x, add.y, add.row_h = 0, 0, 0  # type: ignore[attr-defined]


def row(title: str) -> None:
    if add.x:  # type: ignore[attr-defined]
        add.y += add.row_h  # type: ignore[attr-defined]
    add.x, add.row_h = 0, 0  # type: ignore[attr-defined]
    panels.append({"type": "row", "title": title, "collapsed": False, "id": len(panels) + 1, "gridPos": {"x": 0, "y": add.y, "w": 24, "h": 1}, "panels": []})  # type: ignore[attr-defined]
    add.y += 1  # type: ignore[attr-defined]


def target(expr: str, legend: str = "", instant: bool = False) -> dict:
    return {"datasource": PROM, "expr": expr, "legendFormat": legend, "refId": "A", "instant": instant}


def stat(title: str, expr: str, unit: str = "short", thresholds: list | None = None, mappings: list | None = None, desc: str = "") -> dict:
    return {
        "type": "stat",
        "title": title,
        "description": desc,
        "datasource": PROM,
        "targets": [target(expr)],
        "options": {"colorMode": "background", "graphMode": "area", "reduceOptions": {"calcs": ["lastNotNull"]}},
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "mappings": mappings or [],
                "thresholds": {"mode": "absolute", "steps": thresholds or [{"color": "blue", "value": None}]},
            },
            "overrides": [],
        },
    }


def series(title: str, targets: list[dict], unit: str = "short", stack: bool = False, desc: str = "") -> dict:
    for i, t in enumerate(targets):
        t["refId"] = chr(65 + i)
    return {
        "type": "timeseries",
        "title": title,
        "description": desc,
        "datasource": PROM,
        "targets": targets,
        "fieldConfig": {
            "defaults": {
                "unit": unit,
                "custom": {"fillOpacity": 18, "lineWidth": 2, "showPoints": "never", "stacking": {"mode": "normal" if stack else "none"}},
            },
            "overrides": [],
        },
        "options": {"legend": {"displayMode": "list", "placement": "bottom"}, "tooltip": {"mode": "multi"}},
    }


UP = [{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"}, "1": {"text": "UP", "color": "green"}}}]

row("Health")
add(stat("API", f'max(taskforge_up{{{SEL}, service="api"}}) or vector(0)', mappings=UP,
         thresholds=[{"color": "red", "value": None}, {"color": "green", "value": 1}],
         desc="1 while the API process is running and pushing metrics."), 4, 4)
add(stat("Worker", f'max(taskforge_up{{{SEL}, service="worker"}}) or vector(0)', mappings=UP,
         thresholds=[{"color": "red", "value": None}, {"color": "green", "value": 1}]), 4, 4)
add(stat("Requests / s", f'sum(rate(http_requests_total{{{SEL}, handler!="/metrics"}}[$__rate_interval]))', "reqps"), 4, 4)
add(stat("5xx error rate", f'(sum(rate(http_requests_total{{{SEL}, status=~"5.."}}[$__rate_interval])) or vector(0)) / sum(rate(http_requests_total{{{SEL}}}[$__rate_interval]))',
         "percentunit", [{"color": "green", "value": None}, {"color": "orange", "value": 0.01}, {"color": "red", "value": 0.05}]), 4, 4)
add(stat("p95 latency", f'histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{{{SEL}}}[$__rate_interval])))',
         "s", [{"color": "green", "value": None}, {"color": "orange", "value": 0.3}, {"color": "red", "value": 1}]), 4, 4)
add(stat("Queue length", f'max(taskforge_queue_length{{{SEL}}})', thresholds=[{"color": "green", "value": None}, {"color": "orange", "value": 20}, {"color": "red", "value": 100}],
         desc="Jobs waiting in Redis for the RQ worker."), 4, 4)

row("API")
add(series("Requests by status", [target(f'sum by (status) (rate(http_requests_total{{{SEL}, handler!="/metrics"}}[$__rate_interval]))', "{{status}}")], "reqps", stack=True), 12, 8)
add(series("p95 latency by endpoint", [target(f'topk(8, histogram_quantile(0.95, sum by (le, handler) (rate(http_request_duration_seconds_bucket{{{SEL}, handler!="/metrics"}}[$__rate_interval]))))', "{{handler}}")], "s"), 12, 8)
add(series("Cache hit ratio", [target(f'sum(rate(taskforge_cache_requests_total{{{SEL}, result="hit"}}[$__rate_interval])) / sum(rate(taskforge_cache_requests_total{{{SEL}}}[$__rate_interval]))', "hit ratio")], "percentunit",
           desc="Share of org/project/metrics lookups served from Redis."), 8, 7)
add(series("Live SSE connections", [target(f'sum(taskforge_sse_connections{{{SEL}}})', "open streams")]), 8, 7)
add(series("DB connections in use", [target(f'max(taskforge_db_pool_checked_out{{{SEL}}})', "checked out")]), 8, 7)

row("Background jobs (Redis + RQ)")
add(series("Jobs processed", [target(f'sum by (func, status) (rate(taskforge_jobs_processed_total{{{SEL}}}[$__rate_interval]))', "{{func}} · {{status}}")], "ops", stack=True), 12, 8)
add(series("Job duration p95", [target(f'histogram_quantile(0.95, sum by (le, func) (rate(taskforge_job_duration_seconds_bucket{{{SEL}}}[$__rate_interval])))', "{{func}}")], "s"), 12, 8)
add(series("Jobs enqueued vs processed", [
    target(f'sum(rate(taskforge_jobs_enqueued_total{{{SEL}}}[$__rate_interval]))', "enqueued"),
    target(f'sum(rate(taskforge_jobs_processed_total{{{SEL}}}[$__rate_interval]))', "processed"),
], "ops", desc="If enqueued stays above processed, the worker is falling behind."), 8, 7)
add(series("Emails", [target(f'sum by (result) (increase(taskforge_emails_total{{{SEL}}}[$__rate_interval]))', "{{result}}")], stack=True), 8, 7)
add(series("Notifications delivered", [target(f'sum by (kind) (increase(taskforge_notifications_total{{{SEL}}}[$__rate_interval]))', "{{kind}}")], stack=True), 8, 7)

row("Logs (Loki)")
add({
    "type": "timeseries",
    "title": "Log volume by level",
    "datasource": LOKI,
    "targets": [{"datasource": LOKI, "expr": 'sum by (level) (count_over_time({job="taskforge", env=~"$env"} [$__auto]))', "legendFormat": "{{level}}", "refId": "A"}],
    "fieldConfig": {"defaults": {"custom": {"drawStyle": "bars", "fillOpacity": 60, "stacking": {"mode": "normal"}}}, "overrides": []},
}, 24, 6)
add({
    "type": "logs",
    "title": "Warnings and errors",
    "datasource": LOKI,
    "targets": [{"datasource": LOKI, "expr": '{job="taskforge", env=~"$env", level=~"warning|error|critical"}', "refId": "A"}],
    "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True, "prettifyLogMessage": True},
}, 12, 10)
add({
    "type": "logs",
    "title": "All logs  (filter: | json | event=\"email_skipped\")",
    "datasource": LOKI,
    "targets": [{"datasource": LOKI, "expr": '{job="taskforge", env=~"$env", service=~"$service"}', "refId": "A"}],
    "options": {"showTime": True, "wrapLogMessage": True, "sortOrder": "Descending", "enableLogDetails": True, "prettifyLogMessage": True},
}, 12, 10)

dashboard = {
    "__inputs": [
        {"name": "DS_PROMETHEUS", "label": "Prometheus (metrics)", "type": "datasource", "pluginId": "prometheus", "pluginName": "Prometheus"},
        {"name": "DS_LOKI", "label": "Loki (logs)", "type": "datasource", "pluginId": "loki", "pluginName": "Loki"},
    ],
    "title": "TaskForge",
    "uid": "taskforge",
    "description": "API, background jobs and logs for TaskForge. Metrics are labelled job=taskforge, service=api|worker, env.",
    "tags": ["taskforge"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "30s",
    "time": {"from": "now-1h", "to": "now"},
    "templating": {
        "list": [
            {"name": "env", "label": "Environment", "type": "query", "datasource": PROM, "query": {"query": 'label_values(taskforge_up{job="taskforge"}, env)', "refId": "env"},
             "includeAll": True, "multi": False, "allValue": ".*", "current": {"text": "All", "value": "$__all"}, "refresh": 2},
            {"name": "service", "label": "Service (logs)", "type": "custom", "query": "api,worker", "includeAll": True, "allValue": ".*", "current": {"text": "All", "value": "$__all"}},
        ]
    },
    "panels": panels,
}

out = Path(__file__).with_name("grafana-dashboard.json")
out.write_text(json.dumps(dashboard, indent=2) + "\n", encoding="utf-8")
print(f"wrote {out} with {len(panels)} panels")
