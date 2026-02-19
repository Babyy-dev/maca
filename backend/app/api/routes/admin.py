from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_min_role
from app.db.models import User
from app.db.session import get_db
from app.schemas.admin import (
    AdminAuditLogRead,
    AdminBalanceAdjustRequest,
    AdminRoleUpdateRequest,
    AdminUserRead,
)
from app.services.admin_service import (
    adjust_user_balance,
    has_role_at_least,
    list_audit_logs,
    normalize_role,
    set_user_role,
    write_audit_log,
)
from app.realtime.socket_server import notify_balance_updated, notify_role_updated

router = APIRouter()


@router.get("/audits", response_model=list[AdminAuditLogRead])
def get_audit_logs(
    limit: int = Query(default=100, ge=1, le=200),
    _: User = Depends(require_min_role("mod")),
    db: Session = Depends(get_db),
) -> list[AdminAuditLogRead]:
    entries = list_audit_logs(db, limit=limit)
    return [AdminAuditLogRead.model_validate(entry) for entry in entries]


@router.get("/users", response_model=list[AdminUserRead])
def list_users(
    search: str = Query(default="", max_length=40),
    limit: int = Query(default=50, ge=1, le=200),
    _: User = Depends(require_min_role("admin")),
    db: Session = Depends(get_db),
) -> list[AdminUserRead]:
    query = select(User).order_by(User.created_at.desc()).limit(limit)
    normalized_search = search.strip()
    if normalized_search:
        query = (
            select(User)
            .where(User.username.like(f"%{normalized_search}%"))
            .order_by(User.created_at.desc())
            .limit(limit)
        )
    users = db.scalars(query).all()
    return [AdminUserRead.model_validate(user) for user in users]


@router.patch("/users/{user_id}/role", response_model=AdminUserRead)
async def update_user_role(
    user_id: str,
    payload: AdminRoleUpdateRequest,
    current_user: User = Depends(require_min_role("super")),
    db: Session = Depends(get_db),
) -> AdminUserRead:
    requested_role = payload.role.strip().lower()
    target_role = normalize_role(requested_role)
    if requested_role != target_role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    user = set_user_role(db, user_id, target_role)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        command_text=f"api:set_role {user_id} {target_role}",
        status="success",
        message=f"set role to {target_role}",
        target_user_id=user.id,
        metadata={"role": target_role},
    )
    await notify_role_updated(user.id, user.role)
    return AdminUserRead.model_validate(user)


@router.post("/users/{user_id}/balance", response_model=AdminUserRead)
async def adjust_balance(
    user_id: str,
    payload: AdminBalanceAdjustRequest,
    current_user: User = Depends(require_min_role("admin")),
    db: Session = Depends(get_db),
) -> AdminUserRead:
    mode = payload.mode.strip().lower()
    if mode not in {"add", "remove", "set"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid mode")
    if mode == "set" and not has_role_at_least(current_user.role, "super"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires super role")
    if mode in {"add", "remove"} and payload.amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount must be > 0")
    if mode == "set" and payload.amount < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Amount must be >= 0")

    user = adjust_user_balance(db, user_id, payload.amount, mode)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        command_text=f"api:{mode}_balance {user_id} {payload.amount}",
        status="success",
        message=f"balance {mode} applied",
        target_user_id=user.id,
        metadata={"amount": payload.amount, "mode": mode, "balance": user.balance},
    )
    await notify_balance_updated(user.id, float(user.balance))
    return AdminUserRead.model_validate(user)


@router.get("/me", response_model=AdminUserRead)
def get_admin_me(current_user: User = Depends(get_current_user)) -> AdminUserRead:
    return AdminUserRead.model_validate(current_user)
