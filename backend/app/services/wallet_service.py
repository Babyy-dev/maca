import json
import re
from datetime import datetime, timezone
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

import redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import User, WalletLink, WalletTransaction
from app.schemas.wallet import DepositVerifyRequest, WithdrawalRequest
from app.services.redis_client import get_redis_client

settings = get_settings()

BTC_ADDRESS_PATTERN = re.compile(
    r"^(bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$",
    re.IGNORECASE,
)
ETH_ADDRESS_PATTERN = re.compile(r"^0x[a-fA-F0-9]{40}$")
SOL_ADDRESS_PATTERN = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

BTC_TX_HASH_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")
ETH_TX_HASH_PATTERN = re.compile(r"^0x[a-fA-F0-9]{64}$")
SOL_TX_HASH_PATTERN = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{43,88}$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_token_usd_rate() -> float:
    return max(0.0001, float(settings.token_usd_rate))


def _configured_chain_order() -> list[str]:
    raw = str(settings.wallet_supported_chains or "")
    chains = [entry.strip().upper() for entry in raw.split(",") if entry.strip()]
    supported = [chain for chain in chains if chain in {"BTC", "ETH", "SOL"}]
    return supported or ["BTC", "ETH", "SOL"]


def _usd_rate_for_chain(chain: str) -> float:
    if chain == "BTC":
        return max(0.01, float(settings.wallet_btc_usd_rate))
    if chain == "ETH":
        return max(0.01, float(settings.wallet_eth_usd_rate))
    if chain == "SOL":
        return max(0.01, float(settings.wallet_sol_usd_rate))
    raise ValueError("Unsupported chain")


def _min_confirmations_for_chain(chain: str) -> int:
    if chain == "BTC":
        return max(1, int(settings.wallet_btc_min_confirmations))
    if chain == "ETH":
        return max(1, int(settings.wallet_eth_min_confirmations))
    if chain == "SOL":
        return max(1, int(settings.wallet_sol_min_confirmations))
    raise ValueError("Unsupported chain")


def get_supported_assets() -> list[dict]:
    rows: list[dict] = []
    for chain in _configured_chain_order():
        rows.append(
            {
                "chain": chain,
                "asset": chain,
                "display_name": f"{chain} Network",
                "usd_rate": round(_usd_rate_for_chain(chain), 2),
                "min_confirmations": _min_confirmations_for_chain(chain),
            }
        )
    return rows


def normalize_chain(chain: str | None) -> str:
    normalized = (chain or "").strip().upper()
    if normalized not in _configured_chain_order():
        raise ValueError("Unsupported chain. Allowed: BTC, ETH, SOL")
    return normalized


def normalize_asset(asset: str | None, chain: str) -> str:
    normalized = (asset or "").strip().upper()
    if normalized != chain:
        raise ValueError(f"Unsupported asset for {chain}. Expected {chain}")
    return normalized


def normalize_wallet_address(chain: str, wallet_address: str | None) -> str:
    value = (wallet_address or "").strip()
    if not value:
        raise ValueError("Wallet address is required")

    if chain == "BTC" and not BTC_ADDRESS_PATTERN.fullmatch(value):
        raise ValueError("Invalid BTC wallet address")
    if chain == "ETH" and not ETH_ADDRESS_PATTERN.fullmatch(value):
        raise ValueError("Invalid ETH wallet address")
    if chain == "SOL" and not SOL_ADDRESS_PATTERN.fullmatch(value):
        raise ValueError("Invalid SOL wallet address")
    return value


def normalize_tx_hash(chain: str, tx_hash: str | None) -> str:
    value = (tx_hash or "").strip()
    if not value:
        raise ValueError("Transaction hash is required")

    if chain == "BTC":
        if not BTC_TX_HASH_PATTERN.fullmatch(value):
            raise ValueError("Invalid BTC transaction hash")
        return value.lower()
    if chain == "ETH":
        if not ETH_TX_HASH_PATTERN.fullmatch(value):
            raise ValueError("Invalid ETH transaction hash")
        return value.lower()
    if chain == "SOL":
        if not SOL_TX_HASH_PATTERN.fullmatch(value):
            raise ValueError("Invalid SOL transaction hash")
        return value
    raise ValueError("Unsupported chain")


def _get_verification_mode() -> str:
    mode = (settings.wallet_verification_mode or "real").strip().lower()
    return mode if mode in {"real", "mock", "auto"} else "real"


def _http_timeout() -> float:
    return max(1.0, float(settings.wallet_http_timeout_seconds))


def _http_get_text(url: str) -> str:
    req = urllib_request.Request(url=url, method="GET")
    try:
        with urllib_request.urlopen(req, timeout=_http_timeout()) as response:
            return response.read().decode("utf-8")
    except urllib_error.URLError as exc:
        raise ValueError(f"HTTP GET failed: {exc.reason}") from exc


def _http_get_json(url: str) -> dict:
    payload = _http_get_text(url)
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON response from provider") from exc
    if not isinstance(data, dict):
        raise ValueError("Unexpected provider response shape")
    return data


def _http_post_json(url: str, payload: dict) -> dict:
    data = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    req = urllib_request.Request(
        url=url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=_http_timeout()) as response:
            text = response.read().decode("utf-8")
    except urllib_error.URLError as exc:
        raise ValueError(f"HTTP POST failed: {exc.reason}") from exc

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("Invalid JSON response from provider") from exc
    if not isinstance(parsed, dict):
        raise ValueError("Unexpected provider response shape")
    return parsed


def _parse_hex_to_int(value: str) -> int:
    normalized = value.strip().lower()
    if not normalized.startswith("0x"):
        raise ValueError("Expected hex value")
    try:
        return int(normalized, 16)
    except ValueError as exc:
        raise ValueError("Invalid hex value") from exc


def _btc_real_confirmation_count(tx_hash: str) -> int:
    base_url = str(settings.wallet_btc_provider_url or "").strip().rstrip("/")
    if not base_url:
        raise ValueError("BTC provider URL is not configured")
    escaped_hash = urllib_parse.quote(tx_hash, safe="")
    status = _http_get_json(f"{base_url}/tx/{escaped_hash}/status")
    confirmed = bool(status.get("confirmed"))
    if not confirmed:
        return 0

    block_height = status.get("block_height")
    if not isinstance(block_height, int) or block_height <= 0:
        return 0

    tip_text = _http_get_text(f"{base_url}/blocks/tip/height").strip()
    try:
        tip_height = int(tip_text)
    except ValueError as exc:
        raise ValueError("Invalid BTC tip height response") from exc

    return max(0, tip_height - block_height + 1)


def _eth_rpc_call(method: str, params: list) -> object:
    rpc_url = str(settings.wallet_eth_rpc_url or "").strip()
    if not rpc_url:
        raise ValueError("ETH RPC URL is not configured")
    response = _http_post_json(
        rpc_url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        },
    )
    if response.get("error"):
        error = response.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                raise ValueError(f"ETH RPC error: {message}")
        raise ValueError("ETH RPC returned an error")
    return response.get("result")


def _eth_real_confirmation_count(tx_hash: str) -> int:
    receipt = _eth_rpc_call("eth_getTransactionReceipt", [tx_hash])
    if receipt is None:
        return 0
    if not isinstance(receipt, dict):
        raise ValueError("Unexpected ETH receipt response")

    status_hex = str(receipt.get("status") or "0x1").lower()
    if status_hex == "0x0":
        raise ValueError("Ethereum transaction reverted")

    block_hex = receipt.get("blockNumber")
    if not isinstance(block_hex, str):
        return 0
    tx_block = _parse_hex_to_int(block_hex)

    latest_hex = _eth_rpc_call("eth_blockNumber", [])
    if not isinstance(latest_hex, str):
        raise ValueError("Unexpected ETH latest block response")
    latest_block = _parse_hex_to_int(latest_hex)

    return max(0, latest_block - tx_block + 1)


def _sol_rpc_call(method: str, params: list) -> object:
    rpc_url = str(settings.wallet_sol_rpc_url or "").strip()
    if not rpc_url:
        raise ValueError("SOL RPC URL is not configured")
    response = _http_post_json(
        rpc_url,
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        },
    )
    if response.get("error"):
        error = response.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if isinstance(message, str) and message.strip():
                raise ValueError(f"SOL RPC error: {message}")
        raise ValueError("SOL RPC returned an error")
    return response.get("result")


def _sol_real_confirmation_count(tx_hash: str) -> int:
    status_result = _sol_rpc_call(
        "getSignatureStatuses",
        [[tx_hash], {"searchTransactionHistory": True}],
    )
    if not isinstance(status_result, dict):
        raise ValueError("Unexpected SOL status response")

    values = status_result.get("value")
    if not isinstance(values, list) or len(values) == 0:
        return 0

    status = values[0]
    if status is None:
        return 0
    if not isinstance(status, dict):
        raise ValueError("Unexpected SOL status payload")

    if status.get("err") is not None:
        raise ValueError("Solana transaction failed")

    confirmations = status.get("confirmations")
    if isinstance(confirmations, int):
        return max(0, confirmations)

    slot = status.get("slot")
    if isinstance(slot, int):
        latest_slot = _sol_rpc_call("getSlot", [{"commitment": "finalized"}])
        if isinstance(latest_slot, int):
            return max(0, latest_slot - slot + 1)

    confirmation_status = str(status.get("confirmationStatus") or "").lower()
    if confirmation_status == "finalized":
        return _min_confirmations_for_chain("SOL")
    if confirmation_status == "confirmed":
        return max(1, _min_confirmations_for_chain("SOL") - 1)
    return 0


def _real_confirmation_count(chain: str, tx_hash: str) -> tuple[int, str]:
    if chain == "BTC":
        return _btc_real_confirmation_count(tx_hash), "blockstream"
    if chain == "ETH":
        return _eth_real_confirmation_count(tx_hash), "ethereum-jsonrpc"
    if chain == "SOL":
        return _sol_real_confirmation_count(tx_hash), "solana-jsonrpc"
    raise ValueError("Unsupported chain")


def _mock_confirmation_count(chain: str, tx_hash: str) -> int:
    required = _min_confirmations_for_chain(chain)
    cache_key = f"maca:wallet:confirmations:{chain}:{tx_hash}"
    redis_client = get_redis_client()

    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                parsed = int(cached)
                if parsed >= 0:
                    return parsed
            count = required + 1
            redis_client.setex(cache_key, 300, str(count))
            return count
        except (redis.RedisError, ValueError):
            pass

    return required + 1


def verify_on_chain_transaction(chain: str, tx_hash: str) -> dict:
    normalized_hash = normalize_tx_hash(chain, tx_hash)
    required = _min_confirmations_for_chain(chain)
    mode = _get_verification_mode()
    confirmations = 0
    provider = "mock"
    verification_mode = mode
    real_error: str | None = None

    if mode in {"real", "auto"}:
        try:
            confirmations, provider = _real_confirmation_count(chain, normalized_hash)
            verification_mode = "real"
        except ValueError as exc:
            real_error = str(exc)
            lowered_error = real_error.lower()
            if "reverted" in lowered_error or "transaction failed" in lowered_error:
                raise ValueError(f"Real on-chain verification failed: {real_error}") from exc
            should_fallback = mode == "auto" or bool(settings.wallet_real_verification_fallback_to_mock)
            if not should_fallback:
                raise ValueError(f"Real on-chain verification failed: {real_error}") from exc
            confirmations = _mock_confirmation_count(chain, normalized_hash)
            provider = "mock-fallback"
            verification_mode = "mock_fallback"
    else:
        confirmations = _mock_confirmation_count(chain, normalized_hash)
        verification_mode = "mock"
        provider = "mock"

    verified = confirmations >= required

    if settings.wallet_verification_strict:
        if verification_mode != "real":
            if real_error:
                raise ValueError(f"Strict verification requires real provider success: {real_error}")
            raise ValueError("Strict verification requires real provider mode")
        if not verified:
            raise ValueError("On-chain verification failed. Not enough confirmations")

    return {
        "verification_mode": verification_mode,
        "provider": provider,
        "tx_hash": normalized_hash,
        "confirmations": int(confirmations),
        "required_confirmations": int(required),
        "verified": bool(verified),
        "real_error": real_error,
    }


def list_user_wallet_links(db: Session, user_id: str) -> list[WalletLink]:
    return db.scalars(
        select(WalletLink).where(WalletLink.user_id == user_id).order_by(WalletLink.created_at.desc())
    ).all()


def link_wallet_address(
    db: Session,
    user: User,
    chain: str,
    wallet_address: str,
    label: str | None = None,
) -> WalletLink:
    normalized_chain = normalize_chain(chain)
    normalized_address = normalize_wallet_address(normalized_chain, wallet_address)

    existing_user_chain = db.scalar(
        select(WalletLink).where(WalletLink.user_id == user.id, WalletLink.chain == normalized_chain)
    )
    if existing_user_chain:
        raise ValueError(f"{normalized_chain} wallet already linked. Remove/replace is not implemented yet.")

    existing_global = db.scalar(
        select(WalletLink).where(
            WalletLink.chain == normalized_chain,
            WalletLink.wallet_address == normalized_address,
        )
    )
    if existing_global and existing_global.user_id != user.id:
        raise ValueError("Wallet address is already linked to another account")

    now = _utc_now()
    entry = WalletLink(
        user_id=user.id,
        chain=normalized_chain,
        wallet_address=normalized_address,
        label=(label or "").strip() or None,
        is_verified=True,
        created_at=now,
        verified_at=now,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def _get_user_wallet_for_chain(db: Session, user_id: str, chain: str) -> WalletLink | None:
    return db.scalar(
        select(WalletLink).where(
            WalletLink.user_id == user_id,
            WalletLink.chain == chain,
        )
    )


def list_user_transactions(db: Session, user_id: str, limit: int = 50) -> list[WalletTransaction]:
    clamped_limit = max(1, min(200, int(limit)))
    return db.scalars(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user_id)
        .order_by(WalletTransaction.created_at.desc())
        .limit(clamped_limit)
    ).all()


def get_wallet_overview(db: Session, user: User) -> dict:
    linked_wallets = list_user_wallet_links(db, user.id)
    recent_transactions = list_user_transactions(db, user.id, limit=30)
    pending_withdrawals = (
        db.scalar(
            select(func.count(WalletTransaction.id)).where(
                WalletTransaction.user_id == user.id,
                WalletTransaction.tx_type == "withdrawal",
                WalletTransaction.status == "pending_approval",
            )
        )
        or 0
    )

    return {
        "token_balance": round(float(user.balance), 2),
        "token_symbol": "MCT",
        "usd_per_token": round(_safe_token_usd_rate(), 4),
        "supported_assets": get_supported_assets(),
        "linked_wallets": linked_wallets,
        "recent_transactions": recent_transactions,
        "pending_withdrawals": int(pending_withdrawals),
    }


def _extract_verification_metadata(
    metadata_json: str | None,
    chain: str,
    tx_hash: str,
) -> dict:
    if metadata_json:
        try:
            parsed = json.loads(metadata_json)
            verification = parsed.get("verification")
            if isinstance(verification, dict):
                if not isinstance(verification.get("provider"), str):
                    verification["provider"] = "unknown"
                return verification
        except json.JSONDecodeError:
            pass

    required = _min_confirmations_for_chain(chain)
    return {
        "verification_mode": _get_verification_mode(),
        "provider": "unknown",
        "tx_hash": tx_hash,
        "confirmations": required,
        "required_confirmations": required,
        "verified": True,
    }


def verify_and_credit_deposit(
    db: Session,
    user: User,
    payload: DepositVerifyRequest,
) -> tuple[WalletTransaction, float, dict]:
    chain = normalize_chain(payload.chain)
    asset = normalize_asset(payload.asset, chain)
    tx_hash = normalize_tx_hash(chain, payload.tx_hash)

    existing = db.scalar(
        select(WalletTransaction).where(
            WalletTransaction.chain == chain,
            WalletTransaction.tx_hash == tx_hash,
        )
    )
    if existing:
        if existing.user_id != user.id:
            raise ValueError("Transaction hash already used by a different account")
        verification = _extract_verification_metadata(existing.metadata_json, chain, tx_hash)
        return existing, 0.0, verification

    linked_wallet = _get_user_wallet_for_chain(db, user.id, chain)
    wallet_address = payload.wallet_address
    if wallet_address:
        wallet_address = normalize_wallet_address(chain, wallet_address)
        if linked_wallet and linked_wallet.wallet_address != wallet_address:
            raise ValueError("Provided wallet address does not match your linked address")
        if not linked_wallet:
            linked_wallet = link_wallet_address(db, user, chain, wallet_address)
    elif linked_wallet:
        wallet_address = linked_wallet.wallet_address
    else:
        raise ValueError(f"Link a {chain} wallet first or provide a valid wallet address")

    usd_rate = float(payload.usd_rate) if payload.usd_rate else _usd_rate_for_chain(chain)
    if usd_rate <= 0:
        raise ValueError("USD rate must be positive")

    verification = verify_on_chain_transaction(chain, tx_hash)
    if not verification["verified"]:
        raise ValueError("On-chain verification failed")

    usd_amount = round(float(payload.crypto_amount) * usd_rate, 2)
    token_amount = round(usd_amount / _safe_token_usd_rate(), 2)
    if token_amount <= 0:
        raise ValueError("Deposit amount is too small")

    now = _utc_now()
    transaction = WalletTransaction(
        user_id=user.id,
        wallet_link_id=linked_wallet.id if linked_wallet else None,
        tx_type="deposit",
        status="completed",
        chain=chain,
        asset=asset,
        wallet_address=wallet_address,
        destination_address=None,
        tx_hash=tx_hash,
        crypto_amount=round(float(payload.crypto_amount), 8),
        usd_rate=round(usd_rate, 6),
        usd_amount=usd_amount,
        token_amount=token_amount,
        approval_required=False,
        approved_by_user_id=None,
        failure_reason=None,
        metadata_json=json.dumps({"verification": verification}, ensure_ascii=True),
        created_at=now,
        updated_at=now,
        processed_at=now,
    )

    user.balance = round(float(user.balance) + token_amount, 2)
    db.add(transaction)
    db.add(user)
    db.commit()
    db.refresh(transaction)
    db.refresh(user)
    return transaction, token_amount, verification


def request_withdrawal(
    db: Session,
    user: User,
    payload: WithdrawalRequest,
) -> WalletTransaction:
    chain = normalize_chain(payload.chain)
    asset = normalize_asset(payload.asset, chain)
    destination_address = normalize_wallet_address(chain, payload.destination_address)
    token_amount = round(float(payload.token_amount), 2)
    if token_amount <= 0:
        raise ValueError("Token amount must be positive")
    if float(user.balance) < token_amount:
        raise ValueError("Insufficient token balance")

    linked_wallet = _get_user_wallet_for_chain(db, user.id, chain)
    if not linked_wallet:
        raise ValueError(f"Link a {chain} wallet first before requesting withdrawal")

    usd_rate = float(payload.usd_rate) if payload.usd_rate else _usd_rate_for_chain(chain)
    if usd_rate <= 0:
        raise ValueError("USD rate must be positive")

    usd_amount = round(token_amount * _safe_token_usd_rate(), 2)
    crypto_amount = round(usd_amount / usd_rate, 8)

    now = _utc_now()
    transaction = WalletTransaction(
        user_id=user.id,
        wallet_link_id=linked_wallet.id,
        tx_type="withdrawal",
        status="pending_approval",
        chain=chain,
        asset=asset,
        wallet_address=linked_wallet.wallet_address,
        destination_address=destination_address,
        tx_hash=None,
        crypto_amount=crypto_amount,
        usd_rate=round(usd_rate, 6),
        usd_amount=usd_amount,
        token_amount=token_amount,
        approval_required=True,
        approved_by_user_id=None,
        failure_reason=None,
        metadata_json=json.dumps({"requested_by_user_id": user.id}, ensure_ascii=True),
        created_at=now,
        updated_at=now,
        processed_at=None,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def list_pending_withdrawals(db: Session, limit: int = 100) -> list[WalletTransaction]:
    clamped_limit = max(1, min(200, int(limit)))
    return db.scalars(
        select(WalletTransaction)
        .where(
            WalletTransaction.tx_type == "withdrawal",
            WalletTransaction.status == "pending_approval",
        )
        .order_by(WalletTransaction.created_at.desc())
        .limit(clamped_limit)
    ).all()


def decide_withdrawal(
    db: Session,
    actor_user: User,
    transaction_id: str,
    approve: bool,
    chain_tx_hash: str | None = None,
    reason: str | None = None,
) -> tuple[WalletTransaction, User, bool]:
    transaction = db.scalar(
        select(WalletTransaction).where(
            WalletTransaction.id == transaction_id,
            WalletTransaction.tx_type == "withdrawal",
        )
    )
    if not transaction:
        raise ValueError("Withdrawal request not found")
    if transaction.status != "pending_approval":
        raise ValueError("Withdrawal request already processed")

    user = db.scalar(select(User).where(User.id == transaction.user_id))
    if not user:
        raise ValueError("User not found for this withdrawal")

    now = _utc_now()
    transaction.approved_by_user_id = actor_user.id
    transaction.updated_at = now
    transaction.processed_at = now

    if approve:
        if float(user.balance) < float(transaction.token_amount):
            transaction.status = "rejected"
            transaction.failure_reason = "Insufficient balance at approval time"
            db.add(transaction)
            db.commit()
            db.refresh(transaction)
            return transaction, user, False

        normalized_chain_hash = None
        if chain_tx_hash:
            normalized_chain_hash = normalize_tx_hash(transaction.chain, chain_tx_hash)
            existing_hash = db.scalar(
                select(WalletTransaction.id).where(
                    WalletTransaction.chain == transaction.chain,
                    WalletTransaction.tx_hash == normalized_chain_hash,
                    WalletTransaction.id != transaction.id,
                )
            )
            if existing_hash:
                raise ValueError("Payout transaction hash already exists")

        user.balance = round(float(user.balance) - float(transaction.token_amount), 2)
        transaction.status = "completed"
        transaction.tx_hash = normalized_chain_hash or transaction.tx_hash
        transaction.failure_reason = None
        db.add(user)
        db.add(transaction)
        db.commit()
        db.refresh(user)
        db.refresh(transaction)
        return transaction, user, True

    transaction.status = "rejected"
    transaction.failure_reason = (reason or "").strip() or "Rejected by admin"
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction, user, False
