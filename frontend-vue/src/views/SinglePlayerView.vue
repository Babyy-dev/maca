<template>
  <section class="panel">
    <div class="row">
      <h2>Single Player Table (Vuex-style)</h2>
      <div class="actions">
        <button class="btn" @click="store.resetGame">Reset</button>
      </div>
    </div>
    <p v-if="!auth.token" class="error">
      Login required.
      <a href="/auth/login" target="_top">Sign in</a>
    </p>
    <p class="muted">{{ store.message }}</p>

    <div class="table-wrap">
      <div class="table">
        <div class="dealer">
          <h3>Dealer Total: {{ store.dealerTotalLabel }}</h3>
          <div class="cards">
            <div v-for="card in store.dealer.cards" :key="card.id" class="card" :class="{ hidden: card.isFaceDown }">
              <span v-if="card.isFaceDown">?</span>
              <template v-else>{{ card.value }}{{ card.suit }}</template>
            </div>
          </div>
        </div>

        <div class="players">
          <article
            v-for="(hand, handIndex) in store.players"
            :key="hand.id"
            class="hand"
            :class="{ active: store.activeHandIndex === handIndex }"
          >
            <div class="row">
              <p>Hand {{ handIndex + 1 }} {{ hand.isSplitHand ? "(Split)" : "" }}</p>
              <p>{{ hand.result ?? "Playing" }}</p>
            </div>
            <p class="muted">Total: {{ score(hand.cards) }} | Bet: {{ hand.bets.reduce((a, b) => a + b, 0).toFixed(2) }}</p>
            <div class="cards">
              <div v-for="card in hand.cards" :key="card.id" class="card">
                {{ card.value }}{{ card.suit }}
              </div>
            </div>
          </article>
        </div>

        <div v-if="store.overlay" class="overlay" :class="store.overlay.net >= 0 ? 'win' : 'lose'">
          <p class="label">{{ store.overlay.label }}</p>
          <p class="amount">{{ store.overlay.net >= 0 ? "+" : "" }}{{ store.overlay.net.toFixed(2) }}</p>
        </div>
      </div>
    </div>

    <div class="betbar">
      <label>
        Bet
        <input v-model.number="bet" min="1" type="number" />
      </label>
      <p>Bank: {{ store.bank.toFixed(2) }}</p>
      <p>Hint: {{ store.strategyHint ?? "-" }}</p>
    </div>

    <div class="actions">
      <button class="btn primary" :disabled="store.phase === 'dealing' || store.phase === 'player_turn' || store.phase === 'dealer_turn'" @click="store.startRound(bet)">Deal</button>
      <button class="btn" :disabled="!store.canHit" @click="store.hit">Hit</button>
      <button class="btn" :disabled="!store.canStand" @click="store.stand">Stand</button>
      <button class="btn" :disabled="!store.canDouble" @click="store.doubleDown">Double</button>
      <button class="btn" :disabled="!store.canSplit" @click="store.splitHand">Split</button>
    </div>

    <WalletPanel />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"

import WalletPanel from "../components/WalletPanel.vue"
import { score } from "../lib/blackjack"
import { useAuthStore } from "../stores/auth"
import { useSinglePlayerStore } from "../stores/single-player"

const auth = useAuthStore()
const store = useSinglePlayerStore()
const bet = ref(10)

onMounted(() => {
  void auth.bootstrap()
})
</script>
