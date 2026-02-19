import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import ReferralReward, User

REFERRAL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
MAX_CODE_GENERATION_ATTEMPTS = 40
settings = get_settings()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_referral_code(code: str | None) -> str:
    if not isinstance(code, str):
        return ""
    return code.strip().upper()


def get_user_by_referral_code(db: Session, referral_code: str | None) -> User | None:
    normalized = normalize_referral_code(referral_code)
    if not normalized:
        return None
    return db.scalar(select(User).where(User.referral_code == normalized))


def ensure_user_referral_code(db: Session, user: User) -> str:
    existing = normalize_referral_code(user.referral_code)
    if existing:
        return existing
    generated = generate_unique_referral_code(db)
    user.referral_code = generated
    db.add(user)
    db.commit()
    db.refresh(user)
    return generated


def generate_unique_referral_code(db: Session) -> str:
    length = max(6, min(16, int(settings.referral_code_length)))
    for _ in range(MAX_CODE_GENERATION_ATTEMPTS):
        candidate = "".join(secrets.choice(REFERRAL_CODE_CHARS) for _ in range(length))
        exists = db.scalar(select(User.id).where(User.referral_code == candidate))
        if not exists:
            return candidate
    raise ValueError("Unable to generate unique referral code")


def apply_referral_signup_bonus(
    db: Session,
    referrer: User,
    new_user: User,
    referral_code: str,
) -> ReferralReward:
    if referrer.id == new_user.id:
        raise ValueError("Invalid referral: cannot refer yourself")

    existing_reward = db.scalar(
        select(ReferralReward).where(ReferralReward.referred_user_id == new_user.id)
    )
    if existing_reward:
        return existing_reward

    referrer_bonus = round(max(0.0, float(settings.referral_referrer_bonus)), 2)
    new_user_bonus = round(max(0.0, float(settings.referral_new_user_bonus)), 2)

    referrer.balance = round(float(referrer.balance) + referrer_bonus, 2)
    new_user.balance = round(float(new_user.balance) + new_user_bonus, 2)
    referrer.referral_bonus_earned = round(float(referrer.referral_bonus_earned) + referrer_bonus, 2)
    new_user.referred_by_user_id = referrer.id

    reward = ReferralReward(
        referrer_user_id=referrer.id,
        referred_user_id=new_user.id,
        referral_code=normalize_referral_code(referral_code),
        referrer_bonus=referrer_bonus,
        new_user_bonus=new_user_bonus,
        created_at=_utc_now(),
    )
    db.add(referrer)
    db.add(new_user)
    db.add(reward)
    db.commit()
    db.refresh(reward)
    return reward


def get_referral_dashboard(db: Session, user: User) -> dict:
    referral_code = ensure_user_referral_code(db, user)
    rewards = db.scalars(
        select(ReferralReward)
        .where(ReferralReward.referrer_user_id == user.id)
        .order_by(ReferralReward.created_at.desc())
    ).all()

    referred_user_ids = [reward.referred_user_id for reward in rewards]
    referred_users = (
        db.scalars(select(User).where(User.id.in_(referred_user_ids))).all() if referred_user_ids else []
    )
    referred_user_map = {entry.id: entry for entry in referred_users}

    referred_by_username: str | None = None
    new_user_received_bonus = 0.0
    if user.referred_by_user_id:
        referrer = db.scalar(select(User).where(User.id == user.referred_by_user_id))
        if referrer:
            referred_by_username = referrer.username
        my_reward = db.scalar(
            select(ReferralReward).where(ReferralReward.referred_user_id == user.id)
        )
        if my_reward:
            new_user_received_bonus = float(my_reward.new_user_bonus)

    total_bonus_earned = round(sum(float(reward.referrer_bonus) for reward in rewards), 2)
    total_bonus_given = round(sum(float(reward.new_user_bonus) for reward in rewards), 2)

    entries = []
    for reward in rewards:
        referred = referred_user_map.get(reward.referred_user_id)
        entries.append(
            {
                "referral_id": reward.id,
                "referred_user_id": reward.referred_user_id,
                "referred_username": referred.username if referred else reward.referred_user_id,
                "referred_display_name": referred.display_name if referred else None,
                "referrer_bonus": float(reward.referrer_bonus),
                "new_user_bonus": float(reward.new_user_bonus),
                "created_at": reward.created_at,
            }
        )

    return {
        "referral_code": referral_code,
        "referral_code_length": max(6, min(16, int(settings.referral_code_length))),
        "referrer_bonus_amount": round(max(0.0, float(settings.referral_referrer_bonus)), 2),
        "new_user_bonus_amount": round(max(0.0, float(settings.referral_new_user_bonus)), 2),
        "total_referrals": len(rewards),
        "total_bonus_earned": total_bonus_earned,
        "total_bonus_given_to_friends": total_bonus_given,
        "total_new_user_bonus_received": round(new_user_received_bonus, 2),
        "referred_by_user_id": user.referred_by_user_id,
        "referred_by_username": referred_by_username,
        "referrals": entries,
    }
