# MACA Vue Frontend

Vue 3 + Pinia (Vuex-style) frontend for MACA blackjack.

## Run

```bash
npm install
npm run dev
```

## Environment

Create `.env` if needed:

```bash
VITE_API_BASE_URL=https://rish.trinitum.xyz
```

## Notes

- Single-player logic is local and modeled from the reference `vlackjack` store architecture.
- Multiplayer is realtime and uses your backend Socket.IO events (`join_lobby`, `join_table`, `set_ready`, `table_action`, etc.).
