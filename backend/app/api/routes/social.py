from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.social import (
    FriendRequestCreateRequest,
    FriendRequestRead,
    NotificationRead,
    SocialOverviewRead,
    TableInviteCreateRequest,
    TableInviteRead,
)
from app.services.lobby_service import lobby_service
from app.services.social_service import social_service

router = APIRouter()


@router.get("/overview", response_model=SocialOverviewRead)
def get_social_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SocialOverviewRead:
    payload = social_service.get_overview(db, current_user)
    return SocialOverviewRead.model_validate(payload)


@router.get("/notifications", response_model=list[NotificationRead])
def list_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[NotificationRead]:
    notifications = social_service.list_notifications(db, current_user)
    return [NotificationRead.model_validate(notification) for notification in notifications]


@router.post("/friends/request", response_model=FriendRequestRead, status_code=status.HTTP_201_CREATED)
def send_friend_request(
    payload: FriendRequestCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FriendRequestRead:
    try:
        request = social_service.send_friend_request(db, current_user, payload.username)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FriendRequestRead.model_validate(request)


@router.post("/friends/requests/{request_id}/accept", response_model=FriendRequestRead)
def accept_friend_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FriendRequestRead:
    try:
        request = social_service.respond_to_friend_request(
            db,
            request_id=request_id,
            actor_user_id=current_user.id,
            accept=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FriendRequestRead.model_validate(request)


@router.post("/friends/requests/{request_id}/decline", response_model=FriendRequestRead)
def decline_friend_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FriendRequestRead:
    try:
        request = social_service.respond_to_friend_request(
            db,
            request_id=request_id,
            actor_user_id=current_user.id,
            accept=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return FriendRequestRead.model_validate(request)


@router.delete("/friends/{friend_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friend_user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    social_service.remove_friend(db, current_user.id, friend_user_id)


@router.post("/invites", response_model=TableInviteRead, status_code=status.HTTP_201_CREATED)
def send_table_invite(
    payload: TableInviteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TableInviteRead:
    requested_table_id = payload.table_id.strip() if payload.table_id else ""
    table_ids = lobby_service.table_ids_for_user(current_user.id)
    table_id = requested_table_id or (table_ids[0] if table_ids else "")

    if not table_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Join a table before sending invites",
        )

    table = lobby_service.get_table(table_id)
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    if current_user.id not in table.players:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only table participants can send invites",
        )

    try:
        invite = social_service.send_table_invite(
            db,
            sender=current_user,
            recipient_username=payload.recipient_username,
            table_id=table_id,
            invite_code=table.invite_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TableInviteRead.model_validate(invite)


@router.post("/invites/{invite_id}/accept", response_model=TableInviteRead)
def accept_table_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TableInviteRead:
    try:
        invite = social_service.respond_to_table_invite(
            db,
            invite_id=invite_id,
            actor_user_id=current_user.id,
            accept=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TableInviteRead.model_validate(invite)


@router.post("/invites/{invite_id}/decline", response_model=TableInviteRead)
def decline_table_invite(
    invite_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TableInviteRead:
    try:
        invite = social_service.respond_to_table_invite(
            db,
            invite_id=invite_id,
            actor_user_id=current_user.id,
            accept=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return TableInviteRead.model_validate(invite)
