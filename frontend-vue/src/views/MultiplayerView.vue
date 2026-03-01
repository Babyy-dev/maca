<template>
  <section class="panel multi-shell">
    <header class="top-row">
      <div>
        <h2>Multiplayer</h2>
        <p class="muted">{{ store.message }}</p>
        <p class="muted">Status: {{ store.connected ? "connected" : "offline" }}</p>
        <p v-if="!auth.token" class="error">
          Login required.
          <a href="/auth/login" target="_top">Sign in</a>
        </p>
      </div>
      <div class="actions">
        <button class="btn" @click="refresh">Refresh</button>
        <button class="btn" :disabled="store.connected || !auth.token" @click="store.connect">Connect</button>
        <button class="btn" :disabled="!store.connected" @click="store.disconnect">Disconnect</button>
      </div>
    </header>

    <VlGameArea
      :hands="displayHands"
      :active-hand-index="activeDisplayHandIndex"
      :is-split="isSplit"
      :overlay="null"
    >
      <div class="controls-row-vl">
        <div class="action-group">
          <button class="btn" :disabled="!availableActions.has('double_down')" @click="store.sendAction('double_down')">Double</button>
          <button class="btn" :disabled="!availableActions.has('split')" @click="store.sendAction('split')">Split</button>
          <button class="btn" :disabled="!availableActions.has('surrender')" @click="store.sendAction('surrender')">Surrender</button>
          <button class="btn" :disabled="!availableActions.has('insurance')" @click="store.sendAction('insurance')">Insurance</button>
          <button class="btn" :disabled="!availableActions.has('stand')" @click="store.sendAction('stand')">Stand</button>
          <button class="btn" :disabled="!availableActions.has('hit')" @click="store.sendAction('hit')">Hit</button>
        </div>

        <div class="meta-group">
          <label>
            Ready Bet
            <input v-model.number="readyBet" min="1" step="1" type="number" />
          </label>
          <div class="actions">
            <button class="btn" :disabled="!store.activeTableId" @click="store.setReady(true, readyBet)">Ready</button>
            <button class="btn" :disabled="!store.activeTableId" @click="store.setReady(false, readyBet)">Unready</button>
            <button class="btn" :disabled="!store.activeTableId" @click="store.leaveTable">Leave</button>
          </div>
          <p>Table: {{ store.activeTableId ?? "none" }}</p>
          <p>Turn: {{ store.activeGameState?.current_turn_user_id?.slice(0, 8) ?? "-" }}</p>
        </div>
      </div>
    </VlGameArea>

    <div class="multiplayer-layout">
      <div>
        <h3>Tables</h3>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="store.tables.length === 0" class="muted">No tables available.</p>
        <div class="table-list">
          <article v-for="table in store.tables" :key="table.id" class="card">
            <p class="title">{{ table.name }}</p>
            <p class="muted">{{ table.players.length }}/{{ table.max_players }} players</p>
            <div class="actions">
              <button class="btn" @click="store.joinTable(table.id)">Join</button>
              <button class="btn" @click="store.spectateTable(table.id)">Spectate</button>
            </div>
          </article>
        </div>
      </div>

      <aside>
        <TableChat />
        <WalletPanel />
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue"

import TableChat from "../components/TableChat.vue"
import WalletPanel from "../components/WalletPanel.vue"
import VlGameArea from "../components/vlackjack/VlGameArea.vue"
import { useAuthStore } from "../stores/auth"
import { useMultiplayerStore } from "../stores/multiplayer"

const auth = useAuthStore()
const store = useMultiplayerStore()
const readyBet = ref(10)
const error = ref<string | null>(null)

const availableActions = computed(
  () => new Set(store.activeGameState?.available_actions ?? []),
)

const displayHands = computed(() => {
  const state = store.activeGameState
  const dealerCards = (state?.dealer_cards ?? []).map((card, index) => ({
    id: `dealer-${index}-${card}`,
    code: card,
    isFaceDown: card === "??",
  }))

  const dealer = {
    id: `dealer-${state?.table_id ?? "idle"}`,
    isDealer: true,
    label: "Dealer",
    cards: dealerCards,
    bets: [],
    result: null,
    total: state?.dealer_score ?? null,
  }

  if (!state?.player_states) {
    return [dealer]
  }

  const ids = [
    ...(Array.isArray(state.players) ? state.players : []),
    ...Object.keys(state.player_states),
  ]
  const orderedIds = [...new Set(ids)]

  const players = orderedIds.flatMap((userId) => {
    const playerState = state.player_states?.[userId]
    if (!playerState) return []
    return playerState.hands.map((hand, handIndex) => ({
      id: `${userId}-${hand.hand_id}`,
      isDealer: false,
      label: auth.user?.id === userId ? `You · H${handIndex + 1}` : `P${userId.slice(0, 6)} · H${handIndex + 1}`,
      cards: hand.cards.map((card, index) => ({
        id: `${hand.hand_id}-${index}-${card}`,
        code: card,
        isFaceDown: card === "??",
      })),
      bets: [hand.bet],
      result: hand.result,
      total: hand.cards.includes("??") ? null : hand.score,
      ownerId: userId,
      handIndex,
    }))
  })

  return [dealer, ...players]
})

const activeDisplayHandIndex = computed(() => {
  const state = store.activeGameState
  if (!state?.current_turn_user_id || state.current_hand_index === null || state.current_hand_index === undefined) {
    return null
  }

  let running = 1
  const ids = [
    ...(Array.isArray(state.players) ? state.players : []),
    ...Object.keys(state.player_states ?? {}),
  ]

  for (const userId of [...new Set(ids)]) {
    const playerState = state.player_states?.[userId]
    if (!playerState) continue
    if (userId === state.current_turn_user_id) {
      return running + state.current_hand_index
    }
    running += playerState.hands.length
  }
  return null
})

const isSplit = computed(() => displayHands.value.length > 2)

async function refresh() {
  error.value = null
  try {
    await store.bootstrap()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Refresh failed"
  }
}

onMounted(async () => {
  await auth.bootstrap()
  await refresh()
  if (auth.token) {
    await store.connect()
  }
})

onBeforeUnmount(() => {
  store.disconnect()
})
</script>

