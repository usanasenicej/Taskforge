import base64

from app.core import totp
from tests.test_auth_and_tasks import owner_headers


def test_matches_rfc6238_reference_vector():
    # RFC 6238 Appendix B: SHA-1 secret "12345678901234567890", T=59s -> 94287082 (last 6 digits).
    secret = base64.b32encode(b"12345678901234567890").decode()
    assert totp.code_for(secret, now=59) == "287082"
    assert totp.code_for(secret, now=1111111109) == "081804"


def test_verify_tolerates_drift_and_blocks_replay():
    secret = totp.generate_secret()
    now = 1_800_000_000
    previous_step = totp.code_for(secret, now=now - 30)
    assert totp.verify(secret, previous_step, now=now) == totp.current_counter(now) - 1
    assert totp.verify(secret, totp.code_for(secret, now=now - 90), now=now) is None
    step = totp.verify(secret, totp.code_for(secret, now=now), now=now)
    assert totp.verify(secret, totp.code_for(secret, now=now), last_counter=step, now=now) is None


def test_secret_is_encrypted_at_rest():
    secret = totp.generate_secret()
    token = totp.encrypt_secret(secret)
    assert secret not in token
    assert totp.decrypt_secret(token) == secret
    assert totp.decrypt_secret("not-a-token") is None


def _enable(client, headers):
    setup = client.post("/api/v1/auth/2fa/setup", headers=headers).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/TaskForge:")
    enabled = client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": totp.code_for(setup["secret"])})
    assert enabled.status_code == 200, enabled.text
    return setup["secret"], enabled.json()["recovery_codes"]


def _login(client):
    return client.post("/api/v1/auth/login", json={"email": "owner@example.com", "password": "password123"}).json()


def test_enable_requires_a_valid_code(client):
    _, headers = owner_headers(client)
    client.post("/api/v1/auth/2fa/setup", headers=headers)
    bad = client.post("/api/v1/auth/2fa/enable", headers=headers, json={"code": "000000"})
    assert bad.status_code == 400
    assert client.get("/api/v1/auth/me", headers=headers).json()["totp_enabled"] is False


def test_login_needs_second_factor_once_enabled(client, db_session):
    _, headers = owner_headers(client)
    secret, recovery = _enable(client, headers)
    assert len(recovery) == 10
    assert client.get("/api/v1/auth/2fa", headers=headers).json() == {"enabled": True, "recovery_codes_left": 10}

    from app.models import User

    stored = db_session.query(User).filter_by(email="owner@example.com").one()
    assert secret not in stored.totp_secret  # encrypted, not plain

    first = _login(client)
    assert first["mfa_required"] is True and "access_token" not in first

    # The mfa_token is not a session.
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first['mfa_token']}"}).status_code == 401

    wrong = client.post("/api/v1/auth/login/2fa", json={"mfa_token": first["mfa_token"], "code": "123456"})
    assert wrong.status_code == 400

    # A recovery code works exactly once. (The current TOTP step was already spent by _enable.)
    ok = client.post("/api/v1/auth/login/2fa", json={"mfa_token": first["mfa_token"], "code": recovery[0]})
    assert ok.status_code == 200 and "access_token" in ok.json()
    again = client.post("/api/v1/auth/login/2fa", json={"mfa_token": _login(client)["mfa_token"], "code": recovery[0]})
    assert again.status_code == 400
    assert client.get("/api/v1/auth/2fa", headers=headers).json()["recovery_codes_left"] == 9


def test_disable_requires_password_and_code(client):
    _, headers = owner_headers(client)
    _, recovery = _enable(client, headers)
    wrong_password = client.post("/api/v1/auth/2fa/disable", headers=headers, json={"password": "nope", "code": recovery[1]})
    assert wrong_password.status_code == 400
    ok = client.post("/api/v1/auth/2fa/disable", headers=headers, json={"password": "password123", "code": recovery[1]})
    assert ok.status_code == 204
    assert "access_token" in _login(client)
