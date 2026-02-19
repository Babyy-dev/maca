# 🎮 Project MACA

Multiplayer Crypto-Enabled Blackjack Platform

---

## 📌 Overview

Project MACA is a secure, real-time, multiplayer Blackjack platform that combines social gaming, competitive features, and cryptocurrency-based economy. The platform allows 2–8 players per table, supports live chat with emojis, provides advanced admin moderation tools, and enables crypto deposits and withdrawals with a 1:1 USD token conversion system.

The system is built using a server-authoritative game engine to ensure fairness, prevent cheating, and maintain transparency. Players can create accounts, customize their profiles, track statistics, invite friends, earn referral rewards, and compete on global leaderboards.

The platform is designed to be independent, scalable, and secure, making it suitable for long-term production use.

---

## 🎯 Objectives

- Real-time multiplayer Blackjack
- Strong security & anti-cheat protection
- Cryptocurrency deposits & withdrawals
- Social & competitive gameplay
- Admin & moderation tools
- Transparent and fair game logic

---

## 🧩 Core Features

### 🧑‍🤝‍🧑 Multiplayer Gameplay

- 2–8 players per table
- Public & private tables
- Invite codes
- Spectator mode
- Real-time turns via WebSockets
- Server-authoritative rules

### 👤 Player Accounts

- Secure authentication (JWT + OAuth optional)
- Custom username & profile picture
- Persistent balance and statistics
- Friends list & invitations
- Referral codes

### 💬 Chat & Emojis

- Table chat
- Emoji reactions
- Mute / ban moderation
- Profanity filter

### 🏆 Stats & Leaderboards

- Wins / losses
- Blackjack count
- Win percentage
- Weekly / monthly / all-time rankings
- Friends leaderboard

### 🛠 Admin Controls

- Kick / mute / ban players
- Spectate live games
- Adjust balances
- End or pause tables
- Full audit logs

### 🔐 Security

- Server-side game logic
- Secure RNG
- Anti-cheat validation
- Encrypted credentials
- Admin action logging

### 💰 Economy System

- Token-based balance
- Transaction history
- Daily rewards
- Fraud detection

### 🔗 Crypto Gateway

- Deposit crypto → receive tokens
- Withdraw tokens → receive crypto
- 1 Token = 1 USD
- Supports BTC, ETH, SOL
- Wallet linking
- On-chain verification

---

## 🖥 Frontend Stack

| Layer     | Technology            |
| --------- | --------------------- |
| Framework | React / Next.js       |
| Styling   | Tailwind CSS          |
| State     | Redux / Zustand       |
| Realtime  | Socket.IO Client      |
| Auth      | JWT                   |
| Wallet    | Web3.js / Solana SDK  |
| UI        | Framer Motion, ShadCN |

### Frontend Features

- Lobby & table UI
- Real-time game board
- Chat with emojis
- Profile customization
- Leaderboards
- Admin dashboard
- Wallet management
- Spectator mode

---

## ⚙ Backend Stack

| Layer    | Technology        |
| -------- | ----------------- |
| Language | Python 3.11+      |
| API      | FastAPI           |
| Realtime | Socket.IO         |
| DB       | PostgreSQL        |
| Cache    | Redis             |
| Auth     | JWT + OAuth       |
| Security | bcrypt / Argon2   |
| Crypto   | Web3 / Solana SDK |

---

## 🎲 Game Engine

- Secure RNG (Python `secrets`)
- Server-authoritative logic
- Round validation
- Betting limits
- Timeout auto-stand
- Full game logs
- Anti-cheat enforcement

---

## 🔒 Security & Fairness

- Encrypted passwords
- Authenticated WebSockets
- Rate limiting
- IP/device tracking
- Audit logs
- RNG verification
- Admin accountability

---

## 🏗 System Architecture
