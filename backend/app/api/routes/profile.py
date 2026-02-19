from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_session_id, get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.profile import (
    ProfileRead,
    ProfileUpdateRequest,
    SecurityEventRead,
    UserSessionRead,
)
from app.services.auth_service import list_security_events, list_user_sessions, revoke_user_session

router = APIRouter()


@router.get("/me", response_model=ProfileRead)
def get_my_profile(current_user: User = Depends(get_current_user)) -> ProfileRead:
    return ProfileRead.model_validate(current_user)


@router.patch("/me", response_model=ProfileRead)
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileRead:
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(current_user, key, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return ProfileRead.model_validate(current_user)


@router.get("/security/sessions", response_model=list[UserSessionRead])
def list_my_sessions(
    current_user: User = Depends(get_current_user),
    current_session_id: str | None = Depends(get_current_session_id),
    db: Session = Depends(get_db),
) -> list[UserSessionRead]:
    sessions = list_user_sessions(db, user_id=current_user.id, limit=50)
    payload: list[UserSessionRead] = []
    for session in sessions:
        item = UserSessionRead.model_validate(session)
        item.is_current = bool(current_session_id and session.id == current_session_id)
        payload.append(item)
    return payload


@router.post("/security/sessions/{session_id}/revoke", response_model=UserSessionRead)
def revoke_my_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserSessionRead:
    session = revoke_user_session(db, user_id=current_user.id, session_id=session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return UserSessionRead.model_validate(session)


@router.get("/security/events", response_model=list[SecurityEventRead])
def list_my_security_events(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[SecurityEventRead]:
    rows = list_security_events(db, user_id=current_user.id, limit=100)
    return [SecurityEventRead.model_validate(entry) for entry in rows]
