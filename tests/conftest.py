import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Assign (not setdefault): values from a developer's .env must never leak into tests,
# especially SMTP credentials, which would make tests send real email.
os.environ["APP_ENV"] = "test"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
os.environ["INTERNAL_API_KEY"] = "test-internal"
os.environ["JSON_LOGS"] = "false"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["REDIS_URL"] = "memory://"
os.environ["SMTP_HOST"] = ""

from app.config import get_settings

get_settings.cache_clear()

from app.core import cache as cache_module
from app.core import queue as queue_module
from app.db.session import Base, get_db
from app.main import app
from app.models import *  # noqa: F401,F403


class _Registry:
    count = 0


class DummyQueue:
    name = "taskforge"
    count = 0
    failed_job_registry = _Registry()
    started_job_registry = _Registry()
    finished_job_registry = _Registry()

    def __init__(self) -> None:
        self.jobs: list[tuple] = []

    def enqueue(self, func_path, *args, **kwargs):
        self.jobs.append((func_path, *args))
        return None


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    TestingSession = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session, monkeypatch) -> Generator[TestClient, None, None]:
    memory = cache_module.InMemoryRedis()
    dummy_queue = DummyQueue()
    monkeypatch.setattr(cache_module, "_client", memory)
    monkeypatch.setattr(cache_module, "get_redis", lambda: memory)
    monkeypatch.setattr(queue_module, "_queue", dummy_queue)
    monkeypatch.setattr(queue_module, "get_queue", lambda: dummy_queue)

    def override_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        test_client.jobs = dummy_queue.jobs
        test_client.redis = memory
        yield test_client
    app.dependency_overrides.clear()
