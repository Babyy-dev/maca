from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_min_role
from app.db.models import User
from app.db.session import get_db
from app.realtime.socket_server import notify_balance_updated
from app.schemas.wallet import (
    DepositVerifyRequest,
    DepositVerifyResultRead,
    SupportedAssetRead,
    WalletLinkRead,
    WalletLinkRequest,
    WalletOverviewRead,
    WalletTransactionRead,
    WithdrawalDecisionRequest,
    WithdrawalRequest,
    WithdrawalRequestResultRead,
)
from app.services.wallet_service import (
    decide_withdrawal,
    get_supported_assets,
    get_wallet_overview,
    link_wallet_address,
    list_pending_withdrawals,
    list_user_transactions,
    verify_and_credit_deposit,
    request_withdrawal,
)

router = APIRouter()


@router.get("/assets", response_model=list[SupportedAssetRead])
def list_assets(_: User = Depends(get_current_user)) -> list[SupportedAssetRead]:
    return [SupportedAssetRead.model_validate(entry) for entry in get_supported_assets()]


@router.get("/me", response_model=WalletOverviewRead)
def get_my_wallet_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WalletOverviewRead:
    payload = get_wallet_overview(db, current_user)
    return WalletOverviewRead.model_validate(payload)


@router.post("/link", response_model=WalletLinkRead, status_code=status.HTTP_201_CREATED)
def link_wallet(
    payload: WalletLinkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WalletLinkRead:
    try:
        linked = link_wallet_address(
            db,
            current_user,
            chain=payload.chain,
            wallet_address=payload.wallet_address,
            label=payload.label,
        )
        return WalletLinkRead.model_validate(linked)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/transactions", response_model=list[WalletTransactionRead])
def get_my_wallet_transactions(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[WalletTransactionRead]:
    rows = list_user_transactions(db, current_user.id, limit=limit)
    return [WalletTransactionRead.model_validate(entry) for entry in rows]


@router.post("/deposits/verify", response_model=DepositVerifyResultRead)
async def verify_deposit(
    payload: DepositVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DepositVerifyResultRead:
    try:
        transaction, credited_tokens, verification = verify_and_credit_deposit(db, current_user, payload)
        db.refresh(current_user)
        if credited_tokens > 0:
            await notify_balance_updated(current_user.id, float(current_user.balance))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return DepositVerifyResultRead.model_validate(
        {
            "transaction": transaction,
            "token_balance": round(float(current_user.balance), 2),
            "credited_tokens": round(float(credited_tokens), 2),
            "verification": verification,
        }
    )


@router.post("/withdrawals/request", response_model=WithdrawalRequestResultRead)
def create_withdrawal_request(
    payload: WithdrawalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WithdrawalRequestResultRead:
    try:
        transaction = request_withdrawal(db, current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return WithdrawalRequestResultRead.model_validate(
        {
            "transaction": transaction,
            "token_balance": round(float(current_user.balance), 2),
            "requested_tokens": round(float(transaction.token_amount), 2),
        }
    )


@router.get("/withdrawals/pending", response_model=list[WalletTransactionRead])
def get_pending_withdrawal_requests(
    limit: int = Query(default=100, ge=1, le=200),
    _: User = Depends(require_min_role("admin")),
    db: Session = Depends(get_db),
) -> list[WalletTransactionRead]:
    rows = list_pending_withdrawals(db, limit=limit)
    return [WalletTransactionRead.model_validate(entry) for entry in rows]


@router.post("/withdrawals/{transaction_id}/decision", response_model=WalletTransactionRead)
async def decide_withdrawal_request(
    transaction_id: str,
    payload: WithdrawalDecisionRequest,
    current_user: User = Depends(require_min_role("admin")),
    db: Session = Depends(get_db),
) -> WalletTransactionRead:
    try:
        transaction, target_user, balance_changed = decide_withdrawal(
            db,
            actor_user=current_user,
            transaction_id=transaction_id,
            approve=payload.approve,
            chain_tx_hash=payload.chain_tx_hash,
            reason=payload.reason,
        )
        if balance_changed:
            await notify_balance_updated(target_user.id, float(target_user.balance))
        return WalletTransactionRead.model_validate(transaction)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
