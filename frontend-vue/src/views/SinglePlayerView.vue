<template>
  <section class="panel single-shell">
    <header class="top-row">
      <div>
        <h2>Single Player</h2>
        <p class="muted">{{ store.message }}</p>
        <p v-if="!auth.token" class="error">
          Login required.
          <a href="/auth/login" target="_top">Sign in</a>
        </p>
      </div>
      <button class="btn" @click="store.resetGame">Reset Bankroll</button>
    </header>

    <VlGameArea
      :hands="displayHands"
      :active-hand-index="activeDisplayHandIndex"
      :is-split="store.players.length > 1"
      :overlay="store.overlay"
    >
      <div class="controls-row-vl">
        <div class="action-group">
          <button class="btn primary" :disabled="!canDeal" @click="store.startRound(bet)">{{ dealLabel }}</button>
          <button class="btn" :disabled="!store.canDouble" @click="store.doubleDown">Double</button>
          <button class="btn" :disabled="!store.canSplit" @click="store.splitHand">Split</button>
          <button class="btn" :disabled="!store.canStand" @click="store.stand">Stand</button>
          <button class="btn" :disabled="!store.canHit" @click="store.hit">Hit</button>
        </div>

        <div class="meta-group">
          <label>
            Bet
            <input v-model.number="bet" min="1" step="1" type="number" />
          </label>
          <VlBank :amount="store.bank" />
          <p>Hint: {{ store.strategyHint ?? "-" }}</p>
          <p>Phase: {{ store.phase }}</p>
        </div>
      </div>
    </VlGameArea>

    <WalletPanel />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue"

import WalletPanel from "../components/WalletPanel.vue"
import VlBank from "../components/vlackjack/VlBank.vue"
import VlGameArea from "../components/vlackjack/VlGameArea.vue"
import { score } from "../lib/blackjack"
import { useAuthStore } from "../stores/auth"
import { useSinglePlayerStore } from "../stores/single-player"

const auth = useAuthStore()
const store = useSinglePlayerStore()
const bet = ref(10)

const canDeal = computed(
  () =>
    (store.phase === "idle" || store.phase === "settled") &&
    !store.isDealing &&
    !store.actionLock,
)

const dealLabel = computed(() => (store.phase === "settled" ? "Deal Next Round" : "Deal Round"))

const activeDisplayHandIndex = computed(() =>
  store.activeHandIndex === null ? null : store.activeHandIndex + 1,
)

const displayHands = computed(() => {
  const dealerTotal = store.dealer.cards.some((card) => card.isFaceDown)
    ? null
    : store.dealer.cards.length > 0
      ? score(store.dealer.cards)
      : null

  const dealer = {
    id: `dealer-${store.dealer.id}`,
    isDealer: true,
    label: "Dealer",
    cards: store.dealer.cards.map((card) => ({
      id: card.id,
      value: card.value,
      suit: card.suit,
      isFaceDown: Boolean(card.isFaceDown),
    })),
    bets: [],
    result: null,
    total: dealerTotal,
  }

  const players = store.players.map((hand, index) => ({
    id: hand.id,
    isDealer: false,
    label: hand.isSplitHand ? `Hand ${index + 1} (Split)` : `Hand ${index + 1}`,
    cards: hand.cards.map((card) => ({
      id: card.id,
      value: card.value,
      suit: card.suit,
      isFaceDown: Boolean(card.isFaceDown),
    })),
    bets: hand.bets,
    result: hand.result,
    total: hand.cards.length > 0 ? score(hand.cards) : null,
  }))

  return [dealer, ...players]
})

onMounted(() => {
  void auth.bootstrap()
})
</script>

