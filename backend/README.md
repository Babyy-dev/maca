# Project MACA Backend (Foundation)

This backend scaffold aligns to Milestone 1 + Milestone 2 + Milestone 3 + Milestone 4 + Milestone 5 + Milestone 6 + Milestone 7 preparation:

- Python + FastAPI API layer
- Redis-ready cache/session integration
- JWT authentication
- Profile endpoints
- Lobby/table foundation APIs
- Single-player blackjack engine APIs
- Anti-cheat foundation (action timeout + idempotent actions)
- Socket.IO realtime skeleton
- Social/chat foundation (friends, invites, chat moderation)
- Role-based admin controls (commands + audit logs)
- Stats and leaderboard foundation (global + friends + profile cards)
- Referral system (codes, rewards, and tracking dashboard)
- Crypto gateway foundation (wallet linking, deposit verification, withdrawal approvals, transaction logs)
- Real on-chain verification wiring (BTC: Blockstream API, ETH/SOL: JSON-RPC providers)
- Security hardening foundation (API/socket rate limiting, email verification, optional TOTP 2FA, IP/device session tracking)

## Quick Start

1. Create and activate a Python virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy environment config:

```bash
cp .env.example .env
```

4. Run API:

```bash
uvicorn app.main:app --reload --port 8000
```

## PostgreSQL Notes

- For local SQLite (default): keep `.env` as-is.
- For PostgreSQL, set:

```env
DATABASE_URL=postgresql+psycopg://maca:your-password@127.0.0.1:5432/maca
```

- `psycopg` driver is included in `requirements.txt`.

## API Base

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/email/verify/request`
- `POST /api/v1/auth/email/verify/confirm`
- `POST /api/v1/auth/2fa/setup`
- `POST /api/v1/auth/2fa/enable`
- `POST /api/v1/auth/2fa/disable`
- `GET /api/v1/profile/me`
- `PATCH /api/v1/profile/me`
- `GET /api/v1/profile/security/sessions`
- `POST /api/v1/profile/security/sessions/{session_id}/revoke`
- `GET /api/v1/profile/security/events`
- `GET /api/v1/lobby/tables`
- `POST /api/v1/lobby/tables`
- `POST /api/v1/lobby/tables/{table_id}/join`
- `POST /api/v1/lobby/tables/join-by-code`
- `GET /api/v1/social/overview`
- `GET /api/v1/social/notifications`
- `POST /api/v1/social/friends/request`
- `POST /api/v1/social/friends/requests/{request_id}/accept`
- `POST /api/v1/social/friends/requests/{request_id}/decline`
- `DELETE /api/v1/social/friends/{friend_user_id}`
- `POST /api/v1/social/invites`
- `POST /api/v1/social/invites/{invite_id}/accept`
- `POST /api/v1/social/invites/{invite_id}/decline`
- `GET /api/v1/referrals/me`
- `GET /api/v1/wallet/assets`
- `GET /api/v1/wallet/me`
- `POST /api/v1/wallet/link`
- `GET /api/v1/wallet/transactions`
- `POST /api/v1/wallet/deposits/verify`
- `POST /api/v1/wallet/withdrawals/request`
- `GET /api/v1/wallet/withdrawals/pending`
- `POST /api/v1/wallet/withdrawals/{transaction_id}/decision`
- `GET /api/v1/admin/me`
- `GET /api/v1/admin/audits`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{user_id}/role`
- `POST /api/v1/admin/users/{user_id}/balance`
- `GET /api/v1/stats/me`
- `GET /api/v1/stats/leaderboard/global`
- `GET /api/v1/stats/leaderboard/friends`
- `POST /api/v1/game/single-player/start`
- `GET /api/v1/game/single-player/{round_id}`
- `POST /api/v1/game/single-player/{round_id}/hit`
- `POST /api/v1/game/single-player/{round_id}/stand`
- `GET /api/v1/game/single-player/history/list`

## Realtime

Socket.IO path is `/socket.io` with events:

- `join_lobby`
- `create_table`
- `join_table`
- `spectate_table`
- `stop_spectating`
- `leave_table`
- `set_ready`
- `take_turn_action`
- `send_table_chat`
- `send_table_reaction`
- `moderate_table_chat`
- `admin_command`
- `sync_state`
- `rate_limited` (server event)
- `session_restored` (server event)
- `player_auto_removed` (server event after reconnect grace timeout)
- `spectator_joined` (server event)
- `spectator_left` (server event)
- `table_chat_history` (server event)
- `table_chat_message` (server event)
- `table_reaction` (server event)
- `table_moderation_updated` (server event)
- `table_moderation_notice` (server event)
- `admin_command_result` (server event)
- `role_updated` (server event)
- `balance_updated` (server event)

## Wallet Provider Notes

- Verification mode is controlled by `WALLET_VERIFICATION_MODE`:
  - `real`: call real providers directly.
  - `auto`: try real first, then optional mock fallback.
  - `mock`: development-only mocked confirmations.
- BTC provider uses `WALLET_BTC_PROVIDER_URL` (default: Blockstream public API).
- ETH provider uses `WALLET_ETH_RPC_URL` (Ethereum JSON-RPC).
- SOL provider uses `WALLET_SOL_RPC_URL` (Solana JSON-RPC).
- To enforce strict real verification only, set:
  - `WALLET_VERIFICATION_STRICT=true`
  - `WALLET_REAL_VERIFICATION_FALLBACK_TO_MOCK=false`

### Recommended Production Values

- `WALLET_VERIFICATION_MODE=real`
- `WALLET_VERIFICATION_STRICT=true`
- `WALLET_REAL_VERIFICATION_FALLBACK_TO_MOCK=false`
- Replace RPC/provider URLs with your own managed endpoints for uptime/SLA.

## Security Notes

- API requests are rate-limited (global/auth/sensitive buckets).
- Socket connections and socket events are rate-limited.
- Socket auth defaults to auth-payload token only (`WEBSOCKET_ALLOW_QUERY_TOKEN=false`).
- Login sessions are persisted with IP/User-Agent for security tracking.
- Email verification tokens are generated and logged to server output in this scaffold build.
- TOTP 2FA setup/enable/disable is available via auth routes.

### Security/Load Smoke Commands

```bash
python tools/pen_test_smoke.py --base-url http://127.0.0.1:8000/api/v1
python tools/load_test.py --url http://127.0.0.1:8000/api/v1/health --seconds 20 --workers 20
```

## VPS Deployment

- Full VPS deployment runbook: `deploy/VPS_DEPLOYMENT.md`
- pgAdmin4 setup guide (VPS/local): `deploy/PGADMIN4_SETUP.md`
- VPS compose stack (API + PostgreSQL + Redis): `docker-compose.vps.yml`
- VPS env template: `.env.vps.example`
