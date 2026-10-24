# TaskForge

Production-shaped multi-tenant task management API (lightweight Jira/Asana). Organizations create projects and tasks, assign users, set priorities, and receive real-time updates. The stack is fully containerized, packaged with Helm, and operated with CI/CD, observability, and database practices.

## Architecture

```
Internet
   │
   ▼
Ingress (TLS) ──► API Service (Deployment + HPA)
                     │
         ┌───────────┼───────────┐
         ▼           ▼           ▼
      MariaDB     Redis       Background
    (StatefulSet) (Deployment) Workers (RQ)
```

- **API:** FastAPI + Gunicorn/Uvicorn
- **DB:** MariaDB with Alembic migrations (`org_id` on tenant-owned rows)
- **Redis:** response cache, RQ queues, pub/sub for SSE
- **Workers:** assignment emails and overdue reminders
- **Internal RPC:** `X-Internal-Key` endpoints for CronJobs (overdue scan, cache bust, queue stats)

## Database (indexes that matter)

| Table | Purpose | Key indexes |
| --- | --- | --- |
| `organizations` | Tenant | unique `slug` |
| `users` | Global identity | unique `email` |
| `organization_members` | Role in a tenant | unique `(organization_id, user_id)` |
| `projects` | Workstream | unique `(organization_id, key)` |
| `tasks` | Work item | `(organization_id, status)`, `(organization_id, due_date)`, `(project_id, status)` |
| `task_assignees` | Many-to-many | unique `(task_id, user_id)` |
| `comments` | Task discussion | `task_id` |
| `refresh_tokens` | Session rotation | unique `token_hash` |

Roles: **Owner**, **Admin**, **Member**, **Viewer**. Every query for tenant data is scoped by `organization_id` plus membership.

## Redis usage

- **Cache:** org, project, and dashboard metrics (`metrics:{org_id}`), invalidated on writes
- **RQ jobs:** verification emails, `notify_task_assigned`, `notify_task_updated`, `notify_comment_added`, `notify_task_overdue`, `scan_overdue_tasks`
- **Notification inbox:** per-user capped list `user:{id}:notifications` + unread counter, filled by workers
- **Activity feed:** per-org capped list `org:{id}:activity`
- **Pub/Sub:** `org:{id}:events` streamed to clients at `GET /api/v1/orgs/{org_id}/events` (SSE)
- **Rate limiting:** fixed-window counters on login, email verification and resend

If Redis isn't reachable the API logs a warning and falls back to an in-process stand-in (jobs run inline, events stay in one process). `GET /health/ready` and **Settings → System status** show which backend is live.

## Local development (Windows, no Docker)

Uses SQLite and a portable Redis 8 build on port 6380.

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
copy .env.example .env                       # then set DATABASE_URL=sqlite:///./taskforge.db
powershell -ExecutionPolicy Bypass -File scripts\dev\install-redis.ps1   # one-time, checksum-verified
powershell -ExecutionPolicy Bypass -File scripts\dev\start-all.ps1       # Redis, API, worker, frontend
```

Or start each piece yourself: `scripts\dev\start-redis.ps1`, `start-api.ps1`, `start-worker.ps1`, `start-frontend.ps1` (run them from PowerShell, not Git Bash).

- App: http://localhost:3000 — demo logins `owner@` / `admin@` / `member@taskforge.local`, password `password123` (one-click buttons on the sign-in page)
- API docs: http://127.0.0.1:8000/docs

In development the register and resend endpoints also return `dev_verification_code`, and the verify page shows it, so sign-up works without an inbox. Mail is never sent to reserved test domains (`.local`, `.test`, `.example`, `.localhost`).

On Windows the worker uses RQ's `SimpleWorker` with a thread-based job timeout (no `fork()` or `SIGALRM`), and enqueues the overdue scan every `OVERDUE_SCAN_INTERVAL_SECONDS` (default 120) in place of the Kubernetes CronJob.

## Local run with Docker (later)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

API: http://localhost:8000/docs  
OpenAPI UI: http://localhost:8000/docs  

Compose starts MariaDB, Redis, runs Alembic, seeds demo users, then the API and RQ worker.

Without Docker (MariaDB + Redis already running):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
python -m scripts.seed
uvicorn app.main:app --reload --port 8000
python -m app.workers.worker
```

Demo login after seed: `owner@taskforge.local` / `password123`

## API sketch

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | Creates user + org (owner); queues verification email |
| POST | `/api/v1/auth/verify-email` | Verifies the code and returns tokens |
| POST | `/api/v1/auth/resend-verification` | New code, rate limited |
| POST | `/api/v1/auth/login` | JWT access + refresh (403 until email is verified) |
| GET | `/api/v1/orgs` | Tenants the user belongs to |
| POST | `/api/v1/orgs/{id}/projects` | Member+ |
| POST | `/api/v1/orgs/{id}/projects/{id}/tasks` | Assignees get notified via RQ |
| GET | `/api/v1/orgs/{id}/metrics` | Cached dashboard counts |
| GET | `/api/v1/orgs/{id}/activity` | Recent activity from Redis |
| GET | `/api/v1/orgs/{id}/events` | SSE |
| GET | `/api/v1/notifications` | Your inbox + unread count |
| POST | `/api/v1/internal/rpc/tasks.scan_overdue` | Cron / operators |

## Helm

```bash
helm upgrade --install taskforge ./helm/taskforge \
  --namespace taskforge --create-namespace \
  -f ./helm/taskforge/values-dev.yaml \
  --set image.repository=ghcr.io/your/taskforge \
  --set image.tag=1.0.0
```

Environment overlays: `values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml`.

The chart includes API + HPA, RQ workers, MariaDB StatefulSet, Redis, Ingress, migration Job/init, backup CronJob, overdue CronJob, ServiceMonitor, optional NetworkPolicy, probes, and resource requests/limits.

## Operate

Zero-downtime deploy (rolling, `maxUnavailable: 0`):

```bash
helm upgrade taskforge ./helm/taskforge -n taskforge --set image.tag=<sha>
```

Rollback:

```bash
./scripts/rollback.sh 1
```

Debug a pod:

```bash
kubectl get pods -n taskforge
kubectl describe pod -n taskforge <pod>
kubectl logs -n taskforge deploy/taskforge-taskforge-api
kubectl exec -it -n taskforge deploy/taskforge-taskforge-api -- /bin/sh
```

Backup / restore:

```bash
./scripts/backup-db.sh
./scripts/restore-db.sh backups/taskforge-<stamp>.sql.gz
```

Scale:

```bash
./scripts/scale.sh 4
```

HPA uses CPU and memory utilization on the API deployment.

## Observability

Metrics (Prometheus client): request rate, latency and status from the instrumentator, plus
`taskforge_up`, `taskforge_queue_length`, `taskforge_db_pool_checked_out`, `taskforge_sse_connections`,
`taskforge_cache_requests_total{result}`, `taskforge_jobs_enqueued_total{func}`,
`taskforge_jobs_processed_total{func,status}`, `taskforge_job_duration_seconds`, `taskforge_emails_total{result}`
and `taskforge_notifications_total{kind}`.

- **Scrape mode (Kubernetes / self-hosted Prometheus):** API at `/metrics`, worker at `:9101/metrics`.
  ServiceMonitor in `helm/taskforge/templates/servicemonitor.yaml`, alerts in `monitoring/prometheus-rules.yaml`.
- **Push mode (Grafana Cloud, nothing to install):** fill the `GRAFANA_CLOUD_*` settings in `.env`. The API and
  worker then push metrics every 15 s (Influx line protocol endpoint) and structured JSON logs to Loki.
  `GET /health/ready` reports whether pushing is on.
- **Dashboard:** import `monitoring/grafana-dashboard.json` (generated by `monitoring/build_dashboard.py`) and pick
  your Prometheus and Loki data sources. Panels: service health, request rate, 5xx rate, p95 latency, queue length,
  cache hit ratio, jobs processed and duration, emails, notifications, and logs.

## CI/CD

`.github/workflows/ci.yml` runs pytest, then builds/pushes the multi-stage image. `.github/workflows/deploy.yml` is the Helm upgrade skeleton (wire kubeconfig when you have a cluster).

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

## What I would improve next

- External managed MariaDB and Redis instead of in-cluster data
- Sealed Secrets / External Secrets (chart currently uses a Secret template)
- OpenTelemetry traces and a real SMTP/provider (SES)
- Fine-grained audit log table and Keycloak/OIDC
- Custom HPA metrics from queue depth
- Read replicas and online schema changes for large tenants

- Developed by Usanase Nice Josiane
