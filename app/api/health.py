from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.config import get_settings
from app.core import grafana_cloud
from app.core.cache import get_redis, redis_backend
from app.db.session import engine

router = APIRouter()


@router.get("/health/live", include_in_schema=False)
def live() -> dict:
    return {"status": "ok"}


@router.get("/health/ready", include_in_schema=False)
def ready(response: Response) -> dict:
    checks = {"database": False, "redis": False}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        pass
    try:
        checks["redis"] = bool(get_redis().ping())
    except Exception:
        pass
    body = {
        "checks": checks,
        "redis_backend": redis_backend(),
        "database_backend": engine.dialect.name,
        "grafana_cloud": grafana_cloud.describe(get_settings()),
    }
    if not all(checks.values()):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "degraded", **body}
    return {"status": "ok", **body}
