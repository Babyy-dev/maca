from datetime import datetime

from pydantic import BaseModel, Field


class SocialUserRead(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None


class FriendRequestRead(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    sender_username: str
    recipient_username: str
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class TableInviteRead(BaseModel):
    id: str
    sender_id: str
    recipient_id: str
    sender_username: str
    recipient_username: str
    table_id: str
    invite_code: str | None = None
    status: str
    created_at: datetime
    resolved_at: datetime | None = None


class NotificationRead(BaseModel):
    id: str
    type: str
    message: str
    created_at: datetime
    meta: dict[str, str] = Field(default_factory=dict)


class SocialOverviewRead(BaseModel):
    friends: list[SocialUserRead]
    incoming_friend_requests: list[FriendRequestRead]
    outgoing_friend_requests: list[FriendRequestRead]
    incoming_table_invites: list[TableInviteRead]
    outgoing_table_invites: list[TableInviteRead]


class FriendRequestCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=40)


class TableInviteCreateRequest(BaseModel):
    recipient_username: str = Field(min_length=3, max_length=40)
    table_id: str | None = Field(default=None, min_length=4, max_length=32)
