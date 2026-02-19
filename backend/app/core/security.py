import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
import struct
import time
from typing import Any
from uuid import uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload: dict[str, Any] = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_access_token_with_claims(
    subject: str,
    *,
    session_id: str | None = None,
    token_jti: str | None = None,
) -> str:
    settings = get_settings()
    issued_at = datetime.now(timezone.utc)
    expire = issued_at + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iat": issued_at,
        "jti": token_jti or uuid4().hex,
    }
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token_payload(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def decode_access_token(token: str) -> str | None:
    payload = decode_access_token_payload(token)
    if not payload:
        return None
    subject = payload.get("sub")
    if not isinstance(subject, str):
        return None
    return subject


def generate_random_token(length: int = 32) -> str:
    return secrets.token_urlsafe(length)


def hash_token(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def generate_totp_secret() -> str:
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def build_totp_uri(secret: str, account_name: str, issuer: str) -> str:
    normalized_issuer = issuer.replace(":", "")
    normalized_account = account_name.replace(":", "")
    return (
        f"otpauth://totp/{normalized_issuer}:{normalized_account}"
        f"?secret={secret}&issuer={normalized_issuer}&algorithm=SHA1&digits=6&period=30"
    )


def _totp_code_for_counter(secret: str, counter: int) -> str:
    padded_secret = secret.upper() + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded_secret, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{binary % 1_000_000:06d}"


def verify_totp_code(
    secret: str,
    code: str,
    *,
    step_seconds: int = 30,
    allowed_drift_steps: int = 1,
) -> bool:
    normalized = "".join(ch for ch in code if ch.isdigit())
    if len(normalized) != 6:
        return False
    current_counter = int(time.time() // max(1, step_seconds))
    for delta in range(-max(0, allowed_drift_steps), max(0, allowed_drift_steps) + 1):
        expected = _totp_code_for_counter(secret, current_counter + delta)
        if hmac.compare_digest(expected, normalized):
            return True
    return False
