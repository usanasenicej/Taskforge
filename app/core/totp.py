"""Time-based one-time passwords (RFC 6238), compatible with Google/Microsoft Authenticator, 1Password, etc."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote, urlencode

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

PERIOD_SECONDS = 30
DIGITS = 6
# Accept the previous and next 30s step too, to tolerate clock drift between phone and server.
DRIFT_STEPS = 1
RECOVERY_CODE_COUNT = 10


def generate_secret() -> str:
    """160-bit secret, base32 without padding (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code_at(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(value % 10**DIGITS).zfill(DIGITS)


def current_counter(now: float | None = None) -> int:
    return int((time.time() if now is None else now) // PERIOD_SECONDS)


def code_for(secret: str, now: float | None = None) -> str:
    return _code_at(secret, current_counter(now))


def verify(secret: str, code: str, last_counter: int | None = None, now: float | None = None) -> int | None:
    """Return the matched time step, or None. Steps at or before last_counter are rejected (no replay)."""
    code = code.replace(" ", "").strip()
    if len(code) != DIGITS or not code.isdigit():
        return None
    counter = current_counter(now)
    for step in range(counter - DRIFT_STEPS, counter + DRIFT_STEPS + 1):
        if last_counter is not None and step <= last_counter:
            continue
        if hmac.compare_digest(_code_at(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    label = quote(f"{issuer}:{account}", safe=":@")
    query = urlencode({"secret": secret, "issuer": issuer, "digits": DIGITS, "period": PERIOD_SECONDS})
    return f"otpauth://totp/{label}?{query}"


# --- Secret encryption at rest ------------------------------------------------------------------


def _fernet() -> Fernet:
    # Derive a dedicated key so a leaked database alone can't produce valid codes.
    digest = hashlib.sha256(f"totp:{get_settings().secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt_secret(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


# --- Recovery codes -----------------------------------------------------------------------------


def generate_recovery_codes() -> list[str]:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes (0/o, 1/l/i)
    return ["-".join("".join(secrets.choice(alphabet) for _ in range(5)) for _ in range(2)) for _ in range(RECOVERY_CODE_COUNT)]


def hash_recovery_code(code: str) -> str:
    return hashlib.sha256(code.strip().lower().replace(" ", "").encode()).hexdigest()
