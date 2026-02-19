from datetime import datetime

from pydantic import BaseModel, Field


class AdminCommandRequest(BaseModel):
    command: str = Field(min_length=2, max_length=500)


class AdminCommandResult(BaseModel):
    ok: bool
    message: str
    data: dict | None = None


class AdminAuditLogRead(BaseModel):
    id: str
    actor_user_id: str
    actor_role: str
    command_text: str
    status: str
    message: str
    target_user_id: str | None = None
    target_table_id: str | None = None
    metadata_json: str
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserRead(BaseModel):
    id: str
    username: str
    role: str
    balance: float

    class Config:
        from_attributes = True


class AdminRoleUpdateRequest(BaseModel):
    role: str = Field(min_length=3, max_length=20)


class AdminBalanceAdjustRequest(BaseModel):
    amount: float
    mode: str = Field(default="add", min_length=3, max_length=10)
