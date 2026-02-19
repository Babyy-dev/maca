from datetime import datetime, timedelta, timezone
import json

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import generate_random_token, hash_password, hash_token, verify_password
from app.db.models import EmailVerificationToken, SecurityEvent, User, UserSession
from app.schemas.auth import RegisterRequest
from app.services.referral_service import generate_unique_referral_code


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def create_user(
    db: Session,
    payload: RegisterRequest,
    referred_by_user_id: str | None = None,
) -> User:
    settings = get_settings()
    existing_user_count = db.scalar(select(func.count(User.id))) or 0
    initial_role = "super" if existing_user_count == 0 else "player"
    referral_code = generate_unique_referral_code(db)

    user = User(
        email=payload.email.lower(),
        username=payload.username.strip(),
        hashed_password=hash_password(payload.password),
        balance=1000.0,
        role=initial_role,
        referral_code=referral_code,
        referred_by_user_id=referred_by_user_id,
        referral_bonus_earned=0.0,
        display_name=payload.username.strip(),
        email_verified=not settings.auth_require_email_verification,
        email_verified_at=_utc_now() if not settings.auth_require_email_verification else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email.lower())
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


def is_login_locked(user: User) -> bool:
    locked_until = getattr(user, "login_locked_until", None)
    if not locked_until:
        return False
    return _utc_now() < _as_utc(locked_until)


def register_failed_login_attempt(db: Session, user: User) -> None:
    settings = get_settings()
    attempts = int(getattr(user, "failed_login_attempts", 0) or 0) + 1
    user.failed_login_attempts = attempts
    if attempts >= max(1, settings.auth_max_failed_login_attempts):
        user.login_locked_until = _utc_now() + timedelta(
            minutes=max(1, settings.auth_login_lockout_minutes)
        )
        user.failed_login_attempts = 0
    db.add(user)
    db.commit()
    db.refresh(user)


def clear_failed_login_attempts(db: Session, user: User) -> None:
    if not getattr(user, "failed_login_attempts", 0) and not getattr(user, "login_locked_until", None):
        return
    user.failed_login_attempts = 0
    user.login_locked_until = None
    db.add(user)
    db.commit()
    db.refresh(user)


def create_user_session(
    db: Session,
    *,
    user_id: str,
    token_jti: str,
    ip_address: str,
    user_agent: str,
    expires_at: datetime,
) -> UserSession:
    session = UserSession(
        user_id=user_id,
        token_jti=token_jti,
        ip_address=ip_address[:64],
        user_agent=user_agent[:500],
        expires_at=expires_at,
        last_seen_at=_utc_now(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_active_user_session_by_id(
    db: Session,
    *,
    user_id: str,
    session_id: str,
) -> UserSession | None:
    now = _utc_now()
    return db.scalar(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
    )


def get_active_user_session_by_jti(
    db: Session,
    *,
    user_id: str,
    token_jti: str,
) -> UserSession | None:
    now = _utc_now()
    return db.scalar(
        select(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.token_jti == token_jti,
            UserSession.revoked_at.is_(None),
            UserSession.expires_at > now,
        )
    )


def touch_user_session(db: Session, session: UserSession) -> UserSession:
    session.last_seen_at = _utc_now()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def list_user_sessions(db: Session, *, user_id: str, limit: int = 20) -> list[UserSession]:
    stmt = (
        select(UserSession)
        .where(UserSession.user_id == user_id)
        .order_by(desc(UserSession.last_seen_at))
        .limit(max(1, limit))
    )
    return db.scalars(stmt).all()


def revoke_user_session(db: Session, *, user_id: str, session_id: str) -> UserSession | None:
    session = db.scalar(
        select(UserSession).where(
            UserSession.id == session_id,
            UserSession.user_id == user_id,
            UserSession.revoked_at.is_(None),
        )
    )
    if not session:
        return None
    session.revoked_at = _utc_now()
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def issue_email_verification_token(db: Session, *, user: User) -> str:
    settings = get_settings()
    latest_token = db.scalar(
        select(EmailVerificationToken)
        .where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),
        )
        .order_by(desc(EmailVerificationToken.created_at))
        .limit(1)
    )
    now = _utc_now()
    if (
        latest_token
        and (now - _as_utc(latest_token.created_at)).total_seconds()
        < settings.email_verification_resend_cooldown_seconds
    ):
        raise ValueError("Please wait before requesting another verification email")

    raw_token = generate_random_token(24)
    row = EmailVerificationToken(
        user_id=user.id,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(minutes=max(5, settings.email_verification_token_ttl_minutes)),
    )
    db.add(row)
    db.commit()
    return raw_token


def verify_email_with_token(db: Session, *, token: str) -> User:
    now = _utc_now()
    normalized_token = token.strip()
    row = db.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(normalized_token),
        )
    )
    if not row:
        raise ValueError("Invalid verification token")
    if row.used_at is not None:
        raise ValueError("Verification token already used")
    if now >= row.expires_at:
        raise ValueError("Verification token expired")

    user = db.get(User, row.user_id)
    if not user:
        raise ValueError("User not found")

    user.email_verified = True
    user.email_verified_at = now
    row.used_at = now
    db.add(user)
    db.add(row)
    db.commit()
    db.refresh(user)
    return user


def list_security_events(db: Session, *, user_id: str, limit: int = 50) -> list[SecurityEvent]:
    stmt = (
        select(SecurityEvent)
        .where(SecurityEvent.user_id == user_id)
        .order_by(desc(SecurityEvent.created_at))
        .limit(max(1, limit))
    )
    return db.scalars(stmt).all()


def record_security_event(
    db: Session,
    *,
    event_type: str,
    severity: str = "info",
    user_id: str | None = None,
    ip_address: str = "",
    user_agent: str = "",
    metadata: dict | None = None,
) -> SecurityEvent:
    event = SecurityEvent(
        user_id=user_id,
        event_type=event_type[:60],
        severity=severity[:20] if severity else "info",
        ip_address=ip_address[:64],
        user_agent=user_agent[:500],
        metadata_json=json.dumps(metadata or {}),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
