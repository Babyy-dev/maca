<template>
  <main class="vl-game-area">
    <VlStars />

    <section class="dealer-side">
      <VlGameHand
        v-if="hands.length"
        :hand="hands[0]"
        :index="0"
        :active-hand-index="activeHandIndex"
        :is-split="isSplit"
      />
    </section>

    <section class="player-side">
      <VlGameHand
        v-for="(hand, i) in hands"
        :key="hand.id"
        v-show="i > 0"
        :hand="hand"
        :index="i"
        :active-hand-index="activeHandIndex"
        :is-split="isSplit"
      />
    </section>

    <transition name="result-overlay">
      <div v-if="overlay" class="result-overlay" :class="overlay.net >= 0 ? 'win' : 'lose'">
        <p class="label">{{ overlay.label }}</p>
        <p class="amount">{{ overlay.net >= 0 ? "+" : "" }}{{ overlay.net.toFixed(2) }}</p>
      </div>
    </transition>

    <div class="controls-slot">
      <slot />
    </div>
  </main>
</template>

<script setup lang="ts">
import VlGameHand from "./VlGameHand.vue"
import VlStars from "./VlStars.vue"

type DisplayCard = {
  id: string
  code?: string
  value?: string
  suit?: string
  isFaceDown?: boolean
}

type DisplayHand = {
  id: string
  cards: DisplayCard[]
  bets: number[]
  result: string | null
  total: number | null
  label?: string
  isDealer?: boolean
}

defineProps<{
  hands: DisplayHand[]
  activeHandIndex: number | null
  isSplit: boolean
  overlay?: { label: string; net: number } | null
}>()
</script>

<style scoped>
.vl-game-area {
  position: relative;
  min-height: 74vh;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 0.15);
  background: radial-gradient(circle at 50% 50%, rgb(7 66 52 / 0.9), rgb(2 6 23 / 0.95));
  display: flex;
  flex-direction: column;
}

.dealer-side {
  margin-top: 0.9rem;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 11.8rem;
  z-index: 2;
}

.player-side {
  flex: 1 1 auto;
  display: flex;
  flex-flow: row nowrap;
  justify-content: space-around;
  align-items: center;
  padding-inline: 0.6rem;
  z-index: 2;
}

.controls-slot {
  padding: 0.6rem 0.8rem 0.9rem;
  z-index: 3;
}

.result-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  background: rgb(2 6 23 / 0.24);
  backdrop-filter: blur(2px);
  z-index: 6;
  pointer-events: none;
}

.result-overlay .label {
  margin: 0;
  font-size: clamp(2.2rem, 10vw, 6rem);
  font-weight: 900;
  letter-spacing: 0.06em;
}

.result-overlay .amount {
  margin: 0.3rem 0 0;
  font-size: clamp(1rem, 4vw, 2rem);
  font-weight: 800;
}

.result-overlay.win .label,
.result-overlay.win .amount {
  color: #facc15;
}

.result-overlay.lose .label,
.result-overlay.lose .amount {
  color: #fda4af;
}

.result-overlay-enter-active {
  animation: pulse-in 0.35s ease;
}

.result-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.result-overlay-enter-from,
.result-overlay-leave-to {
  opacity: 0;
}

@keyframes pulse-in {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@media (max-width: 900px) {
  .vl-game-area {
    min-height: 79vh;
  }

  .player-side {
    flex-wrap: wrap;
    align-content: center;
    gap: 0.4rem;
  }
}
</style>

