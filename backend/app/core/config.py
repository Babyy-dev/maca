from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Project MACA API"
    debug: bool = True
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    database_url: str = "sqlite:///./maca.db"
    redis_url: str = "redis://localhost:6379/0"

    secret_key: str = "change-this-secret-key"
    access_token_expire_minutes: int = 60 * 24
    rate_limit_enabled: bool = True
    rate_limit_global_limit: int = 180
    rate_limit_global_window_seconds: int = 60
    rate_limit_auth_limit: int = 20
    rate_limit_auth_window_seconds: int = 60
    rate_limit_sensitive_limit: int = 60
    rate_limit_sensitive_window_seconds: int = 60
    websocket_connect_limit: int = 20
    websocket_connect_window_seconds: int = 60
    websocket_event_limit: int = 180
    websocket_event_window_seconds: int = 60
    websocket_require_auth_payload_token: bool = True
    websocket_allow_query_token: bool = False
    auth_require_email_verification: bool = False
    auth_max_failed_login_attempts: int = 5
    auth_login_lockout_minutes: int = 15
    email_verification_token_ttl_minutes: int = 30
    email_verification_resend_cooldown_seconds: int = 45
    security_track_sessions: bool = True
    session_touch_interval_seconds: int = 60
    two_factor_issuer: str = "Project MACA"
    two_factor_time_step_seconds: int = 30
    two_factor_allowed_drift_steps: int = 1
    multiplayer_turn_seconds: int = 8
    multiplayer_timer_tick_seconds: float = 1.0
    multiplayer_reconnect_grace_seconds: int = 30
    referral_code_length: int = 8
    referral_referrer_bonus: float = 25.0
    referral_new_user_bonus: float = 10.0
    token_usd_rate: float = 1.0
    wallet_supported_chains: str = "BTC,ETH,SOL"
    wallet_btc_usd_rate: float = 60000.0
    wallet_eth_usd_rate: float = 3000.0
    wallet_sol_usd_rate: float = 150.0
    wallet_btc_min_confirmations: int = 2
    wallet_eth_min_confirmations: int = 12
    wallet_sol_min_confirmations: int = 20
    wallet_verification_mode: str = "real"
    wallet_verification_strict: bool = True
    wallet_real_verification_fallback_to_mock: bool = False
    wallet_http_timeout_seconds: float = 10.0
    wallet_btc_provider_url: str = "https://blockstream.info/api"
    wallet_eth_rpc_url: str = "https://rpc.flashbots.net"
    wallet_sol_rpc_url: str = "https://api.mainnet-beta.solana.com"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
