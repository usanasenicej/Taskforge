from types import SimpleNamespace
from unittest.mock import patch

from app.models import User
from app.services.auth import send_verification_email
from app.services.email import is_deliverable


def register(client, email="owner@example.com"):
    return client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "password123",
            "full_name": "Owner User",
            "organization_name": "Acme Corp",
        },
    )


def verify(client, created, email="owner@example.com"):
    return client.post(
        "/api/v1/auth/verify-email",
        json={"email": email, "code": created.json()["dev_verification_code"]},
    )


def owner_headers(client, email="owner@example.com"):
    created = register(client, email)
    assert created.status_code == 201, created.text
    verified = verify(client, created, email)
    assert verified.status_code == 200, verified.text
    token = verified.json()["tokens"]["access_token"]
    return created.json()["organization"]["id"], {"Authorization": f"Bearer {token}"}


def test_verification_email_has_branded_html_and_plain_text(monkeypatch):
    monkeypatch.setattr(
        "app.services.email.get_settings",
        lambda: SimpleNamespace(
            smtp_host="smtp.example.com",
            smtp_port=587,
            smtp_tls=True,
            smtp_user="",
            smtp_password="",
            smtp_from="noreply@example.com",
        ),
    )
    user = User(full_name="<Avery & Co>", email="avery@example.com")

    with patch("smtplib.SMTP") as smtp:
        assert send_verification_email(user, "123456") is True

    message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
    parts = list(message.iter_parts())
    assert message.get_content_subtype() == "alternative"
    assert "123456" in parts[0].get_content()
    assert "TaskForge" in parts[1].get_content()
    assert "&lt;Avery &amp; Co&gt;" in parts[1].get_content()
    assert "123456" in parts[1].get_content()


def test_reserved_domains_are_never_sent_to_smtp():
    assert not is_deliverable("owner@taskforge.local")
    assert not is_deliverable("someone@example.test")
    assert is_deliverable("someone@example.com")


def test_register_accepts_local_demo_email_and_queues_email(client):
    response = register(client, email="owner@taskforge.local")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["user"]["email"] == "owner@taskforge.local"
    assert body["email_verification_required"] is True
    assert "email_verification_code" not in body["user"]
    assert "tokens" not in body
    assert ("app.workers.jobs.send_verification_code", body["user"]["id"]) in client.jobs


def test_register_requires_verification_before_login(client):
    created = register(client, email="new-owner@example.com")
    assert created.status_code == 201

    login_before = client.post(
        "/api/v1/auth/login",
        json={"email": "new-owner@example.com", "password": "password123"},
    )
    assert login_before.status_code == 403
    assert login_before.json()["detail"] == "Email not verified"

    wrong = client.post(
        "/api/v1/auth/verify-email",
        json={"email": "new-owner@example.com", "code": "000000"},
    )
    assert wrong.status_code == 400

    verified = verify(client, created, email="new-owner@example.com")
    assert verified.status_code == 200
    assert "access_token" in verified.json()["tokens"]

    login_after = client.post(
        "/api/v1/auth/login",
        json={"email": "new-owner@example.com", "password": "password123"},
    )
    assert login_after.status_code == 200
    assert "access_token" in login_after.json()


def test_verify_on_verified_account_does_not_issue_tokens(client):
    created = register(client)
    assert verify(client, created).status_code == 200
    again = client.post("/api/v1/auth/verify-email", json={"email": "owner@example.com", "code": "123456"})
    assert again.status_code == 200
    assert "tokens" not in again.json()


def test_resend_issues_a_new_code(client):
    created = register(client)
    first_code = created.json()["dev_verification_code"]
    resent = client.post("/api/v1/auth/resend-verification", json={"email": "owner@example.com"})
    assert resent.status_code == 200
    assert resent.json()["dev_verification_code"] != first_code or len(first_code) == 6


def test_verification_is_rate_limited(client):
    register(client)
    statuses = [
        client.post(
            "/api/v1/auth/verify-email",
            json={"email": "owner@example.com", "code": "999999"},
        ).status_code
        for _ in range(9)
    ]
    assert statuses[:8] == [400] * 8
    assert statuses[8] == 429


def test_register_login_and_create_task(client):
    org_id, headers = owner_headers(client)

    project = client.post(
        f"/api/v1/orgs/{org_id}/projects",
        headers=headers,
        json={"name": "Platform", "key": "PLAT", "description": "Core work"},
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    task = client.post(
        f"/api/v1/orgs/{org_id}/projects/{project_id}/tasks",
        headers=headers,
        json={"title": "Set up CI", "priority": "high", "status": "todo", "due_date": "2030-01-02T15:00:00+02:00"},
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]
    # Stored and returned in UTC with an explicit offset.
    assert task.json()["due_date"].startswith("2030-01-02T13:00:00")
    assert task.json()["due_date"].endswith(("+00:00", "Z"))

    listed = client.get(f"/api/v1/orgs/{org_id}/tasks", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == task_id

    metrics = client.get(f"/api/v1/orgs/{org_id}/metrics", headers=headers)
    assert metrics.status_code == 200
    assert metrics.json()["tasks_total"] == 1

    activity = client.get(f"/api/v1/orgs/{org_id}/activity", headers=headers)
    assert activity.status_code == 200
    assert [item["type"] for item in activity.json()] == ["task.created", "project.created"]


def test_assignment_and_update_queue_notifications_for_others_only(client):
    org_id, headers = owner_headers(client)
    member = client.post(
        f"/api/v1/orgs/{org_id}/members",
        headers=headers,
        json={"email": "member@example.com", "full_name": "Mem Ber", "password": "password123", "role": "member"},
    ).json()
    me = client.get("/api/v1/auth/me", headers=headers).json()
    project_id = client.post(
        f"/api/v1/orgs/{org_id}/projects", headers=headers, json={"name": "P", "key": "PP"}
    ).json()["id"]

    task = client.post(
        f"/api/v1/orgs/{org_id}/projects/{project_id}/tasks",
        headers=headers,
        json={"title": "Ship it", "assignee_ids": [me["id"], member["user_id"]]},
    ).json()
    assigned = [job for job in client.jobs if job[0] == "app.workers.jobs.notify_task_assigned"]
    assert assigned == [("app.workers.jobs.notify_task_assigned", task["id"], member["user_id"], me["id"])]

    updated = client.patch(f"/api/v1/orgs/{org_id}/tasks/{task['id']}", headers=headers, json={"status": "done"})
    assert updated.status_code == 200
    jobs = [job for job in client.jobs if job[0] == "app.workers.jobs.notify_task_updated"]
    assert len(jobs) == 1
    assert jobs[0][2] == member["user_id"]
    assert jobs[0][3] == {"status": ["todo", "done"]}


def test_notifications_inbox(client):
    from app.core.notifications import push_notification

    org_id, headers = owner_headers(client)
    me = client.get("/api/v1/auth/me", headers=headers).json()
    push_notification(me["id"], org_id, "assigned", "Casey assigned you a task", "Fix login", task_id=1)

    inbox = client.get("/api/v1/notifications", headers=headers).json()
    assert inbox["unread"] == 1
    assert inbox["items"][0]["title"] == "Casey assigned you a task"

    assert client.post("/api/v1/notifications/read", headers=headers).status_code == 204
    assert client.get("/api/v1/notifications", headers=headers).json()["unread"] == 0


def test_viewer_cannot_create_task(client):
    org_id, headers = owner_headers(client)

    invited = client.post(
        f"/api/v1/orgs/{org_id}/members",
        headers=headers,
        json={
            "email": "viewer@example.com",
            "full_name": "View Only",
            "password": "password123",
            "role": "viewer",
        },
    )
    assert invited.status_code == 201

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "viewer@example.com", "password": "password123"},
    )
    viewer_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    project = client.post(
        f"/api/v1/orgs/{org_id}/projects",
        headers=viewer_headers,
        json={"name": "Secret", "key": "SEC"},
    )
    assert project.status_code == 403


def test_reserved_test_domains_are_accepted_for_signup(client):
    for email in ("dev@northwind.test", "qa@acme.example"):
        assert register(client, email=email).status_code == 201
    bad = register(client, email="not-an-email@nodot")
    assert bad.status_code == 422
