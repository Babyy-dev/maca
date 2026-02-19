from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.auth import UserRead


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=60)
    avatar_url: str | None = Field(default=None, max_length=500)
    bio: str | None = Field(default=None, max_length=500)


class ProfileRead(UserRead):
    pass


class UserSessionRead(BaseModel):
    id: str
    ip_address: str
    user_agent: str
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    is_current: bool = False

    class Config:
        from_attributes = True


class SecurityEventRead(BaseModel):
    id: str
    event_type: str
    severity: str
    ip_address: str
    user_agent: str
    created_at: datetime
    metadata_json: str

    class Config:
        from_attributes = True
