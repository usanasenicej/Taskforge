from app import __version__


def test_live(client):
    response = client.get("/health/live")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["version"] == __version__
    assert body["env"] == "test"


def test_ready(client):
    response = client.get("/health/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] is True
    assert body["checks"]["redis"] is True
    assert body["redis_backend"] == "memory"
    assert body["version"] == __version__


def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "TaskForge"
    assert body["health"] == "/health/ready"
    assert body["docs"] == "/docs"


def test_response_headers(client):
    response = client.get("/health/live")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-TaskForge-Version") == __version__
    assert response.headers.get("X-Request-ID")


def test_request_id_is_echoed(client):
    response = client.get("/health/live", headers={"X-Request-ID": "trace-abc"})
    assert response.headers.get("X-Request-ID") == "trace-abc"
