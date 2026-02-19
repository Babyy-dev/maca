import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AdminAuditLog, User

ROLE_LEVELS: dict[str, int] = {
    "player": 0,
    "mod": 1,
    "admin": 2,
    "super": 3,
}

ROLE_VALUES = set(ROLE_LEVELS.keys())


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_role(role: str | None) -> str:
    normalized = (role or "").strip().lower()
    if normalized in ROLE_VALUES:
        return normalized
    return "player"


def has_role_at_least(role: str | None, minimum_role: str) -> bool:
    minimum = ROLE_LEVELS.get(normalize_role(minimum_role), 0)
    actual = ROLE_LEVELS.get(normalize_role(role), 0)
    return actual >= minimum


def set_user_role(db: Session, user_id: str, role: str) -> User | None:
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        return None
    normalized = normalize_role(role)
    user.role = normalized
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def adjust_user_balance(
    db: Session,
    user_id: str,
    amount: float,
    mode: str,
) -> User | None:
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        return None

    normalized_mode = mode.strip().lower()
    if normalized_mode == "add":
        user.balance = round(float(user.balance) + float(amount), 2)
    elif normalized_mode == "remove":
        user.balance = round(max(0.0, float(user.balance) - float(amount)), 2)
    elif normalized_mode == "set":
        user.balance = round(max(0.0, float(amount)), 2)
    else:
        raise ValueError("Unsupported balance adjustment mode")

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def write_audit_log(
    db: Session,
    actor_user_id: str,
    actor_role: str,
    command_text: str,
    status: str,
    message: str,
    target_user_id: str | None = None,
    target_table_id: str | None = None,
    metadata: dict | None = None,
) -> AdminAuditLog:
    entry = AdminAuditLog(
        actor_user_id=actor_user_id,
        actor_role=normalize_role(actor_role),
        command_text=command_text[:500],
        status=status[:20],
        message=message[:500],
        target_user_id=target_user_id,
        target_table_id=target_table_id,
        metadata_json=json.dumps(metadata or {}, ensure_ascii=True),
        created_at=_utc_now(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_audit_logs(db: Session, limit: int = 100) -> list[AdminAuditLog]:
    clamped_limit = max(1, min(200, int(limit)))
    return db.scalars(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).limit(clamped_limit)
    ).all()
