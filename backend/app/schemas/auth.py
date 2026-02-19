from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=8, max_length=128)
    referral_code: str | None = Field(default=None, min_length=4, max_length=20)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    otp_code: str | None = Field(default=None, min_length=6, max_length=8)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    session_id: str | None = None


class UserRead(BaseModel):
    id: str
    email: EmailStr
    username: str
    balance: float
    role: str
    referral_code: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    bio: str | None = None
    email_verified: bool = False
    two_factor_enabled: bool = False

    class Config:
        from_attributes = True


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirmRequest(BaseModel):
    token: str = Field(min_length=12, max_length=255)


class EmailVerificationStatusRead(BaseModel):
    verified: bool
    message: str


class TwoFactorSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str
    issuer: str


class TwoFactorEnableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class TwoFactorDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class TwoFactorStatusRead(BaseModel):
    enabled: bool
    updated_at: datetime
