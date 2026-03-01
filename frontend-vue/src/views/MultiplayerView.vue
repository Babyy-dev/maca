<template>
  <section class="panel">
    <div class="row">
      <h2>Multiplayer (Realtime Backend)</h2>
      <div class="actions">
        <button class="btn" @click="refresh">Refresh</button>
        <button class="btn" :disabled="store.connected" @click="store.connect">Connect</button>
        <button class="btn" :disabled="!store.connected" @click="store.disconnect">Disconnect</button>
      </div>
    </div>
    <p v-if="!auth.token" class="error">
      Login required.
      <a href="/auth/login" target="_top">Sign in</a>
    </p>
    <p class="muted">{{ store.message }}</p>
    <p class="muted">Status: {{ store.connected ? "connected" : "offline" }}</p>

    <div v-if="store.activeGameState" class="table-wrap">
      <div class="table">
        <h3>Table {{ store.activeGameState.table_id }}</h3>
        <p class="muted">Phase: {{ store.activeGameState.phase ?? store.activeGameState.status }}</p>
        <p class="muted">Current turn: {{ store.activeGameState.current_turn_user_id ?? "none" }}</p>
        <div class="cards">
          <div
            v-for="(card, index) in store.activeGameState.dealer_cards ?? []"
            :key="`${card}-${index}`"
            class="card"
          >
            {{ card }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="store.activeTableId" class="actions">
      <label>
        Ready Bet
        <input v-model.number="readyBet" min="1" step="1" type="number" />
      </label>
      <button class="btn" @click="store.setReady(true, readyBet)">Ready</button>
      <button class="btn" @click="store.setReady(false, readyBet)">Unready</button>
      <button class="btn" @click="store.leaveTable">Leave</button>
    </div>

    <div v-if="store.activeTableId" class="actions">
      <button class="btn" :disabled="!availableActions.has('hit')" @click="store.sendAction('hit')">Hit</button>
      <button class="btn" :disabled="!availableActions.has('stand')" @click="store.sendAction('stand')">Stand</button>
      <button class="btn" :disabled="!availableActions.has('double_down')" @click="store.sendAction('double_down')">Double</button>
      <button class="btn" :disabled="!availableActions.has('split')" @click="store.sendAction('split')">Split</button>
    </div>

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

    <TableChat />
    <WalletPanel />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import TableChat from "../components/TableChat.vue"
import WalletPanel from "../components/WalletPanel.vue"
import { useAuthStore } from "../stores/auth"
import { useMultiplayerStore } from "../stores/multiplayer"

const auth = useAuthStore()
const store = useMultiplayerStore()
const readyBet = ref(10)
const error = ref<string | null>(null)
const availableActions = computed(
  () => new Set(store.activeGameState?.available_actions ?? []),
)

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
  await store.connect()
})
</script>
