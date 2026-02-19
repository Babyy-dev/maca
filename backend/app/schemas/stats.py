from datetime import datetime

from pydantic import BaseModel


class PeriodStatsRead(BaseModel):
    period: str
    total_games: int
    wins: int
    losses: int
    pushes: int
    blackjacks: int
    win_rate: float
    balance: float


class UserStatsRead(BaseModel):
    user_id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    all_time: PeriodStatsRead
    weekly: PeriodStatsRead
    monthly: PeriodStatsRead


class LeaderboardEntryRead(BaseModel):
    rank: int
    user_id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    balance: float
    total_games: int
    wins: int
    losses: int
    pushes: int
    blackjacks: int
    win_rate: float


class LeaderboardRead(BaseModel):
    scope: str
    period: str
    sort_by: str
    generated_at: datetime
    entries: list[LeaderboardEntryRead]
