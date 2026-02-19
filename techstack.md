# 🧱 Project MACA – Complete Tech Stack

This document describes the full technology stack used for the development of **Project MACA**, a secure multiplayer crypto-enabled Blackjack platform.

---

## 🎨 Frontend Tech Stack

### Core Framework

- **Nextjs** – Server-side rendering, routing, SEO
- **TypeScript** – Type safety and scalability
- **Tailwind CSS** – Utility-first styling
- **ShadCN UI** – Modern component library
- **Framer Motion** – Animations

### Real-Time & Networking

- **Socket.IO Client** – Multiplayer gameplay, chat, lobby updates
- **WebSockets API** – Live game synchronization

### State Management

- **Zustand** or **Redux Toolkit**
- **React Query (TanStack Query)** – API data caching

### Authentication & Security

- **JWT-based authentication**
- **OAuth (Google, Discord, etc.)**
- **Protected routes**

### Crypto Wallet Integration

- **Web3.js / Ethers.js** – Ethereum
- **Solana Web3.js** – Solana
- **Bitcoin SDK / RPC** – Bitcoin
- **WalletConnect, MetaMask, Phantom**

### UI/UX Tools

- **Lucide Icons**
- **Emoji Picker**
- **Dark casino-themed UI**

---

## ⚙ Backend Tech Stack

### Core

- **Python 3.11+**
- **FastAPI** – High-performance REST API
- **Python-SocketIO** – Real-time communication
- **Uvicorn / Gunicorn** – ASGI server

### Database & Caching

- **PostgreSQL** – Main database
- **Redis** – Sessions, matchmaking, caching

### Authentication & Security

- **JWT (OAuth2)**
- **Argon2 / bcrypt** – Password hashing
- **Rate limiting** – SlowAPI / Redis
- **RBAC** – Role-based access control

### Game Engine

- **Custom Blackjack Engine**
- **Secure RNG (`secrets` module)**
- **Server-authoritative game logic**

### Crypto Gateway

- **Web3.py** – Ethereum
- **Solana Python SDK**
- **Bitcoin RPC / Blockstream API**
- **USDT / USDC (optional)**

### Admin & Logging

- **Audit logs (PostgreSQL + JSON)**
- **Admin command system**
- **Live spectator API**

---

## 🗄 Database & ORM

- **SQLAlchemy** – ORM
- **Alembic** – Migrations
- **UUID primary keys**
- **Transaction history tables**
- **Game state snapshots**

---

## 🔐 Security Stack

| Area             | Technology            |
| ---------------- | --------------------- |
| Password Hashing | Argon2 / bcrypt       |
| Authentication   | JWT + Refresh Tokens  |
| API Protection   | Rate Limiting         |
| WebSockets       | Token-based auth      |
| Crypto           | On-chain verification |
| Admin Actions    | Logged                |
| RNG              | secrets.SystemRandom  |
| Monitoring       | Sentry                |
| DDoS Protection  | Cloudflare            |

---

## 🔗 Crypto & Payments

- Solana RPC
- Ethereum RPC
- Bitcoin RPC
- Chain explorer APIs
- Wallet signature verification
- 1 Token = 1 USD system
- Withdrawal approval system

---

## 🏗 Infrastructure & DevOps

### Hosting & Deployment

- **AWS / DigitalOcean / Hetzner**
- **Docker**
- **Docker Compose**
- **NGINX**

### CI/CD

- **GitHub Actions**
- **Automated deployments**
- **Secrets management**

### Monitoring

- **Prometheus**
- **Grafana**
- **Sentry**
- **UptimeRobot**

---

## 🧪 Testing Stack

- **Pytest** – Backend testing
- **Jest** – Frontend testing
- **Playwright** – End-to-end tests
- **Postman / Insomnia** – API testing

---

## 🛠 Developer Tools

- **VS Code**
- **Prettier**
- **ESLint**
- **Black (Python formatter)**
- **Alembic CLI**
- **PostgreSQL CLI**
- **Redis CLI**

---

## 🧠 Optional Advanced Technologies

- **WebRTC** – Voice chat
- **AI Moderation** – Chat filtering
- **Fraud Detection (ML)**
- **KYC Integration**
- **NFT Avatars**
- **Mobile App (React Native)**

---

## 📊 Summary

| Layer      | Technology                   |
| ---------- | ---------------------------- |
| Frontend   | Next.js, Tailwind, Socket.IO |
| Backend    | FastAPI, Python, Redis       |
| Database   | PostgreSQL + Redis           |
| Realtime   | Socket.IO                    |
| Security   | JWT, Argon2, RBAC            |
| Crypto     | Web3, Solana SDK, BTC RPC    |
| DevOps     | Docker, NGINX                |
| Monitoring | Sentry, Grafana              |

---

## ✅ Final Note

This tech stack ensures a **secure, scalable, real-time, and crypto-ready** multiplayer Blackjack platform with strong administrative control and fair gameplay.
