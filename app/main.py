from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator

from app import __version__
from app.api import api_router
from app.api.health import router as health_router
from app.config import get_settings
from app.core import grafana_cloud
from app.core.telemetry import db_pool_checked_out, queue_length, service_up
from app.logging import configure_logging

settings = get_settings()
json_log_formatter = configure_logging(settings)
logger = structlog.get_logger(__name__)



@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env != "test":
        from app.core.cache import redis_backend
        from app.db.session import engine

        try:
            # Staging/production migrate in the Helm pre-upgrade Job, never at pod start.
            if settings.app_env == "development":
                # Same Alembic path as that Job, so a broken migration fails here first
                # instead of hiding behind create_all().
                from app.db.migrate import upgrade_to_head
                from scripts.seed import main as seed_demo_data

                upgrade_to_head()

                seed_demo_data()
        except Exception:
            logger.exception("startup_bootstrap_failed")
        logger.info("startup_complete", database=engine.dialect.name, redis_backend=redis_backend())
        service_up.labels(service="api").set(1)
        grafana_cloud.start(settings, "api", json_log_formatter)
    yield
    grafana_cloud.stop()



app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="Multi-tenant task and project management API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

instrumentator = Instrumentator(should_group_status_codes=False)
instrumentator.instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.middleware("http")
async def add_request_context(request: Request, call_next):
    from app.core.queue import get_queue
    from app.db.session import engine

    try:
        queue_length.set(get_queue().count)
        db_pool_checked_out.set(engine.pool.checkedout())
    except Exception:
        pass
    response = await call_next(request)
    response.headers["X-TaskForge-Version"] = __version__
    return response


app.include_router(health_router)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/")
def root() -> dict:
    return {"name": settings.app_name, "version": __version__, "docs": "/docs"}
