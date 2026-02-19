from datetime import datetime

from pydantic import BaseModel, Field


class SinglePlayerStartRequest(BaseModel):
    bet: float = Field(gt=0, le=10000)


class RoundActionRequest(BaseModel):
    action_id: str | None = Field(default=None, min_length=8, max_length=80)


class SinglePlayerRoundRead(BaseModel):
    round_id: str
    status: str
    bet: float
    player_cards: list[str]
    dealer_cards: list[str]
    player_score: int
    dealer_score: int | None = None
    can_hit: bool
    can_stand: bool
    result: str | None = None
    payout: float | None = None
    message: str | None = None
    actions: list[str]
    created_at: datetime
    ended_at: datetime | None = None


class RoundLogRead(BaseModel):
    id: str
    user_id: str
    bet: float
    result: str
    payout: float
    player_score: int
    dealer_score: int
    player_cards: list[str]
    dealer_cards: list[str]
    actions: list[str]
    created_at: datetime
    ended_at: datetime
