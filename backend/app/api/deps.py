from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token_payload
from app.db.models import User
from app.db.session import get_db
from app.services.auth_service import (
    get_active_user_session_by_id,
    get_user_by_email,
    touch_user_session,
)
from app.services.admin_service import has_role_at_least

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_access_token_payload(token: str = Depends(oauth2_scheme)) -> dict:
    payload = decode_access_token_payload(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token subject",
        )
    return payload


def get_current_session_id(payload: dict = Depends(get_access_token_payload)) -> str | None:
    session_id = payload.get("sid")
    if isinstance(session_id, str) and session_id.strip():
        return session_id.strip()
    return None


def get_current_user(
    request: Request,
    payload: dict = Depends(get_access_token_payload),
    db: Session = Depends(get_db),
) -> User:
    subject = payload["sub"]
    user = get_user_by_email(db, subject)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    settings = get_settings()
    if settings.security_track_sessions:
        session_id = payload.get("sid")
        if not isinstance(session_id, str) or not session_id.strip():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token session missing",
            )
        user_session = get_active_user_session_by_id(
            db,
            user_id=user.id,
            session_id=session_id.strip(),
        )
        if not user_session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired or revoked",
            )
        now = datetime.now(timezone.utc)
        last_seen_at = user_session.last_seen_at
        if last_seen_at.tzinfo is None:
            last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
        elapsed = (now - last_seen_at).total_seconds()
        if elapsed >= max(1, settings.session_touch_interval_seconds):
            touch_user_session(db, user_session)
            request.state.session_id = session_id.strip()
        else:
            request.state.session_id = session_id.strip()

    return user


def require_min_role(min_role: str):
    def _require(current_user: User = Depends(get_current_user)) -> User:
        if not has_role_at_least(current_user.role, min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {min_role} role",
            )
        return current_user

    return _require
