from fastapi import APIRouter

from app.api import auth, events, internal, metrics, notifications, orgs, projects, tasks

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(orgs.router, prefix="/orgs", tags=["organizations"])
api_router.include_router(projects.router, prefix="/orgs/{org_id}/projects", tags=["projects"])
api_router.include_router(tasks.router, prefix="/orgs/{org_id}", tags=["tasks"])
api_router.include_router(metrics.router, prefix="/orgs/{org_id}/metrics", tags=["metrics"])
api_router.include_router(events.router, prefix="/orgs/{org_id}/events", tags=["events"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(internal.router, prefix="/internal", tags=["internal"])
