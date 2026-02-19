from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.stats import LeaderboardRead, UserStatsRead
from app.services.stats_service import build_leaderboard, get_user_stats_bundle

router = APIRouter()

PeriodValue = Literal["all", "weekly", "monthly"]
SortValue = Literal["win_rate", "balance", "games", "blackjacks"]


@router.get("/me", response_model=UserStatsRead)
def get_my_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserStatsRead:
    payload = get_user_stats_bundle(db, current_user)
    return UserStatsRead.model_validate(payload)


@router.get("/leaderboard/global", response_model=LeaderboardRead)
def get_global_leaderboard(
    period: PeriodValue = Query(default="all"),
    sort_by: SortValue = Query(default="win_rate"),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaderboardRead:
    payload = build_leaderboard(
        db,
        period=period,
        sort_by=sort_by,
        limit=limit,
        scope_user_id=None,
    )
    return LeaderboardRead.model_validate(payload)


@router.get("/leaderboard/friends", response_model=LeaderboardRead)
def get_friends_leaderboard(
    period: PeriodValue = Query(default="all"),
    sort_by: SortValue = Query(default="win_rate"),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LeaderboardRead:
    payload = build_leaderboard(
        db,
        period=period,
        sort_by=sort_by,
        limit=limit,
        scope_user_id=current_user.id,
    )
    return LeaderboardRead.model_validate(payload)
