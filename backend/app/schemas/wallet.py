from datetime import datetime

from pydantic import BaseModel, Field


class SupportedAssetRead(BaseModel):
    chain: str
    asset: str
    display_name: str
    usd_rate: float
    min_confirmations: int


class WalletLinkRequest(BaseModel):
    chain: str = Field(min_length=2, max_length=10)
    wallet_address: str = Field(min_length=8, max_length=120)
    label: str | None = Field(default=None, max_length=80)


class WalletLinkRead(BaseModel):
    id: str
    user_id: str
    chain: str
    wallet_address: str
    label: str | None = None
    is_verified: bool
    created_at: datetime
    verified_at: datetime | None = None

    class Config:
        from_attributes = True


class OnChainVerificationRead(BaseModel):
    verification_mode: str
    provider: str
    tx_hash: str
    confirmations: int
    required_confirmations: int
    verified: bool


class WalletTransactionRead(BaseModel):
    id: str
    user_id: str
    wallet_link_id: str | None = None
    tx_type: str
    status: str
    chain: str
    asset: str
    wallet_address: str
    destination_address: str | None = None
    tx_hash: str | None = None
    crypto_amount: float
    usd_rate: float
    usd_amount: float
    token_amount: float
    approval_required: bool
    approved_by_user_id: str | None = None
    failure_reason: str | None = None
    metadata_json: str
    created_at: datetime
    updated_at: datetime
    processed_at: datetime | None = None

    class Config:
        from_attributes = True


class WalletOverviewRead(BaseModel):
    token_balance: float
    token_symbol: str
    usd_per_token: float
    supported_assets: list[SupportedAssetRead]
    linked_wallets: list[WalletLinkRead]
    recent_transactions: list[WalletTransactionRead]
    pending_withdrawals: int


class DepositVerifyRequest(BaseModel):
    chain: str = Field(min_length=2, max_length=10)
    asset: str = Field(min_length=2, max_length=10)
    tx_hash: str = Field(min_length=20, max_length=128)
    crypto_amount: float = Field(gt=0)
    usd_rate: float | None = Field(default=None, gt=0)
    wallet_address: str | None = Field(default=None, min_length=8, max_length=120)


class DepositVerifyResultRead(BaseModel):
    transaction: WalletTransactionRead
    token_balance: float
    credited_tokens: float
    verification: OnChainVerificationRead


class WithdrawalRequest(BaseModel):
    chain: str = Field(min_length=2, max_length=10)
    asset: str = Field(min_length=2, max_length=10)
    destination_address: str = Field(min_length=8, max_length=120)
    token_amount: float = Field(gt=0)
    usd_rate: float | None = Field(default=None, gt=0)


class WithdrawalRequestResultRead(BaseModel):
    transaction: WalletTransactionRead
    token_balance: float
    requested_tokens: float


class WithdrawalDecisionRequest(BaseModel):
    approve: bool
    chain_tx_hash: str | None = Field(default=None, min_length=20, max_length=128)
    reason: str | None = Field(default=None, max_length=500)
