from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.game import (
    RoundActionRequest,
    RoundLogRead,
    SinglePlayerRoundRead,
    SinglePlayerStartRequest,
)
from app.services.blackjack_service import blackjack_service

router = APIRouter(prefix="/single-player")


@router.post("/start", response_model=SinglePlayerRoundRead, status_code=status.HTTP_201_CREATED)
def start_round(
    payload: SinglePlayerStartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SinglePlayerRoundRead:
    try:
        return blackjack_service.start_round(db, current_user.id, payload.bet)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/{round_id}", response_model=SinglePlayerRoundRead)
def get_round(
    round_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SinglePlayerRoundRead:
    round_view = blackjack_service.get_round(db, current_user.id, round_id)
    if not round_view:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    return round_view


@router.post("/{round_id}/hit", response_model=SinglePlayerRoundRead)
def hit(
    round_id: str,
    payload: RoundActionRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SinglePlayerRoundRead:
    action_id = payload.action_id if payload else None
    try:
        round_view = blackjack_service.hit(db, current_user.id, round_id, action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not round_view:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    return round_view


@router.post("/{round_id}/stand", response_model=SinglePlayerRoundRead)
def stand(
    round_id: str,
    payload: RoundActionRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SinglePlayerRoundRead:
    action_id = payload.action_id if payload else None
    try:
        round_view = blackjack_service.stand(db, current_user.id, round_id, action_id=action_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not round_view:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Round not found")
    return round_view


@router.get("/history/list", response_model=list[RoundLogRead])
def history(
    limit: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[RoundLogRead]:
    return blackjack_service.history(db, current_user.id, limit=limit)
