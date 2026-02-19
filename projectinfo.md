# 🎮 Project MACA – Multiplayer Blackjack Platform

---

## 📌 Project Overview

Project MACA is a secure, real-time, multiplayer Blackjack platform designed to transform a basic single-player Blackjack prototype (Vlackjack) into a **social, competitive, and feature-rich online casino experience**.

The platform supports **2–8 players per table**, real-time gameplay using **WebSockets**, and a **server-authoritative game engine** to ensure fairness, prevent cheating, and synchronize all game actions.

Players can create accounts, customize profiles, chat with emojis, invite friends, earn referral rewards, track statistics, and compete on leaderboards.  
Administrators and moderators have full control over players, tables, economy, and security through a powerful command system.

The platform also includes an **independent crypto gateway** that allows users to deposit cryptocurrency (BTC, ETH, SOL, etc.), convert it to in-game tokens at a **1:1 USD ratio**, and withdraw their tokens back into cryptocurrency.

---

## 🚀 High-Level Goals

- Transform Vlackjack into a full multiplayer platform
- Support real-time gameplay with WebSockets
- Implement server-authoritative game logic
- Provide strong admin and moderation tools
- Enable crypto deposits & withdrawals
- Add social, competitive, and customization features
- Maintain strong security and fairness

---

## 🧑‍🤝‍🧑 Multiplayer System

- 2–8 players per table
- Public tables
- Private tables with invite codes
- Real-time gameplay
- Spectator mode (read-only)
- Server validates all player actions

### Flow

(User connects → Lobby → Create/Join Table → Ready → Game Starts)

---

## 👤 Player Accounts & Profiles

### Stored Fields

- userID
- username
- profileImage
- balance (tokens)
- total games
- wins / losses
- referralCode
- friends list

### Player Actions

- Change display name
- Upload/change avatar
- Secure login & sessions
- Persistent balance and history

---

## 🔐 Authentication & Security

- JWT or session-based authentication
- Password hashing
- Email verification
- Optional 2FA
- Role system:
  - Player
  - Moderator
  - Admin
  - Super Admin

---

## 🎮 Game Features

### Core Gameplay

- Server-side Blackjack engine
- Authoritative rules
- Secure RNG
- Real-time sync
- Cheating prevention
- Action validation

### Spectator Mode

- Watch live games
- Read-only access
- See table state

---

## 🛠 Admin Controls

All admin actions are logged with:

- Timestamp
- Admin ID
- Action type

### Admin Capabilities

- Kick / ban players
- Mute / unmute chat
- Spectate games
- End or pause tables
- Adjust balances
- View logs
- Rollback rounds (debug)

---

## 💬 Chat & Emojis

- Table chat
- Emoji reactions
- Animated emojis
- Moderation tools
- Profanity filter

---

## 🧑‍🤝‍🧑 Friends & Invitations

- Add / remove friends
- Send game invites
- Accept / decline invites
- Push notifications

---

## 🔗 Referral System

Each user has a unique referral code.

### Tracking

- Referral count
- Referral rewards

---

## 📊 Statistics & Leaderboards

### Tracked Per User

- Total games
- Wins / losses
- Blackjack count
- Win percentage
- Referral count

### Leaderboards

- Weekly
- Monthly
- All-time
- Friends leaderboard

### Sorting

- Win rate
- Balance
- Most games

---

## 💰 Balance & Economy

- Token balance stored in DB
- All transactions logged
- Anti-cheat monitoring
- Optional:
  - In-game currency
  - Micro-transactions
  - Daily rewards

---

## 👀 Spectator Mode

- Live game viewing
- Read-only
- No interaction
- See public game state

---

## 🎨 UI / UX Features

### Player Customization

- Username color themes
- Profile bios
- Emoji reactions
- Table skins

### Social Interaction

- Friend invites
- Chat
- Emojis
- Table emotes

---

## ⚙ Moderator Commands

| Command               | Purpose           |
| --------------------- | ----------------- |
| /kick <user>          | Remove from table |
| /mute <user> <time>   | Chat moderation   |
| /unmute <user>        | Restore chat      |
| /warn <user> <reason> | Logged warning    |
| /view_profile <user>  | View stats        |

---

## ⚙ Admin Commands

| Command                | Purpose          |
| ---------------------- | ---------------- |
| /ban <user>            | Permanent ban    |
| /tempban <user> <time> | Temporary ban    |
| /lock_account <user>   | Freeze play      |
| /unlock_account <user> | Restore          |
| /reset_session <user>  | Kill active game |

---

## 🎮 Table Control Commands

### Moderator+

- /spectate <tableId>
- /pause_table <tableId>
- /resume_table <tableId>

### Admin+

- /end_round <tableId>
- /remove_player <user>
- /restart_table <tableId>
- /force_stand <user>

### Super Admin+

- /force_result <tableId> <result>
- /rollback_round <tableId>
- /replay_round <roundId>

⚠️ Forced results must notify players.

---

## 💰 Economy & Betting Controls

### Admin+

- /add_balance <user> <amount>
- /remove_balance <user> <amount>
- /refund_bet <roundId>
- /lock_betting <tableId>
- /unlock_betting <tableId>

### Super Admin+

- /set_balance <user> <amount>
- /adjust_payout <roundId>
- /reset_balance <user>

---

## 🛡 Anti-Cheat & Security

### Moderator+

- /flag <user>
- /view_recent_actions <user>
- /check_ip <user>

### Admin+

- /ip_ban <ip>
- /device_ban <user>
- /lock_table <tableId>
- /audit_round <roundId>

---

## 🎲 RNG & Fairness (Admin Only)

### Super Admin+

- /verify_rng <roundId>
- /reseed_rng
- /dump_deck <roundId>
- /dump_state <roundId>

⚠️ Read-only in production.

---

## ⚙ System Commands

### Admin+

- /broadcast <message>
- /maintenance on/off
- /table_limit <tableId> <min/max>

### Owner+

- /restart_server
- /shutdown <time>
- /enable_feature <flag>
- /disable_feature <flag>

---

## 🧪 Dev / Debug (Staging Only)

- /simulate_round
- /force_card <card>
- /skip_shuffle
- /test_payouts

---

## 🔗 Crypto Gateway (Independent System)

### Features

- User ID
- Wallet address
- Crypto balance
- Token balance

### Supported

- Bitcoin (BTC)
- Ethereum (ETH)
- Solana (SOL)
- Others

The crypto gateway is fully independent from the game engine.

---

## 🧠 Development Notes

- Project is written in **Python**
- Strong focus on:
  - Security
  - Fairness
  - Server authority
  - Anti-cheat
- Can reuse logic from:
  https://github.com/kevinleedrum/vlackjack
- Multiplayer, admin tools, statistics, wallet, and crypto systems must be built on top of it.

---

## ✅ Summary

Project MACA is a **feature-rich multiplayer Blackjack platform** with:

- Real-time gameplay
- Strong admin control
- Crypto economy
- Social interaction
- Competitive leaderboards
- High security standards

Designed to be **independent, scalable, and production-ready**.

the customer login and the flow we want :-

-- User connects → Lobby → Create/Join Table → Ready → Game Starts

-- User A shares code → User B signs up → Both receive bonus

-- Deposit Crypto → Convert to Tokens (1 Token = 1 USD) → Play → Withdraw Crypto
