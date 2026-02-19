from datetime import datetime

from pydantic import BaseModel


class ReferralEntryRead(BaseModel):
    referral_id: str
    referred_user_id: str
    referred_username: str
    referred_display_name: str | None = None
    referrer_bonus: float
    new_user_bonus: float
    created_at: datetime


class ReferralDashboardRead(BaseModel):
    referral_code: str
    referral_code_length: int
    referrer_bonus_amount: float
    new_user_bonus_amount: float
    total_referrals: int
    total_bonus_earned: float
    total_bonus_given_to_friends: float
    total_new_user_bonus_received: float
    referred_by_user_id: str | None = None
    referred_by_username: str | None = None
    referrals: list[ReferralEntryRead]
