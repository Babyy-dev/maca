from pydantic import BaseModel, Field


class TableCreateRequest(BaseModel):
    name: str = Field(min_length=3, max_length=60)
    max_players: int = Field(default=8, ge=2, le=8)
    is_private: bool = False


class TableJoinByCodeRequest(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class TableRead(BaseModel):
    id: str
    name: str
    owner_id: str
    max_players: int
    is_private: bool
    invite_code: str | None = None
    players: list[str]
