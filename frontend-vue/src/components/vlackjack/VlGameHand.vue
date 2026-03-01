<template>
  <div class="game-hand" :class="handClasses">
    <transition-group name="deal" tag="div" class="cards">
      <TableCard
        v-for="card in hand.cards"
        :key="card.id"
        :card="card.code"
        :face-down="card.isFaceDown"
        :suit="card.suit"
        :value="card.value"
      />
    </transition-group>

    <transition name="pop">
      <span v-if="showTotal" class="hand-total" :class="totalClass">{{ hand.total }}</span>
    </transition>

    <transition-group name="coin" tag="div" class="hand-bet" :class="betClass">
      <span v-for="(_, i) in displayCoins" :key="i" class="chip"></span>
    </transition-group>

    <transition name="balloon">
      <div v-if="hand.result" class="hand-result">
        <span :class="resultClass">{{ hand.result }}</span>
      </div>
    </transition>

    <p v-if="hand.label" class="hand-owner">{{ hand.label }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

import TableCard from "../TableCard.vue"

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

const props = defineProps<{
  hand: DisplayHand
  index: number
  activeHandIndex: number | null
  isSplit: boolean
}>()

const isActiveHand = computed(() => props.activeHandIndex === props.index)
const isInactiveHand = computed(
  () => props.isSplit && !props.hand.isDealer && props.activeHandIndex !== null && !isActiveHand.value,
)

const handClasses = computed(() => ({
  "is-active": isActiveHand.value && !props.hand.isDealer,
  "is-split": props.isSplit && !props.hand.isDealer,
  "is-dealer": Boolean(props.hand.isDealer),
  "is-inactive": isInactiveHand.value,
}))

const showTotal = computed(() => props.hand.total !== null)
const totalClass = computed(() => ({
  bust: (props.hand.total ?? 0) > 21,
  "twenty-one": props.hand.total === 21,
}))

const displayCoins = computed(() => {
  const raw = props.hand.bets.length > 0 ? props.hand.bets.length : 0
  return Array.from({ length: Math.min(raw, 8) })
})

const betClass = computed(() => ({
  "is-win": ["WIN", "BLACKJACK", "PUSH"].includes(props.hand.result ?? ""),
  "is-loss": ["LOSE", "BUST"].includes(props.hand.result ?? ""),
}))

const resultClass = computed(() => {
  const result = (props.hand.result ?? "").toUpperCase()
  if (result === "WIN" || result === "BLACKJACK") return "win"
  if (result === "PUSH") return "push"
  return "lose"
})
</script>

<style scoped>
.game-hand {
  position: relative;
  transition: transform 0.2s ease;
}

.game-hand.is-dealer,
.game-hand.is-split {
  transform: scale(0.9);
}

.game-hand.is-active,
.game-hand.is-split.is-active {
  position: relative;
  transform: scale(1.15);
  z-index: 8;
}

.game-hand.is-inactive {
  opacity: 0.3;
  transform: translateY(-2.8rem) scale(0.82);
}

.cards {
  min-height: 10.8rem;
  min-width: 6.8rem;
  display: flex;
  flex-flow: row wrap;
  justify-content: center;
  align-items: center;
  gap: 0.25rem;
}

.hand-total {
  display: inline-block;
  position: absolute;
  top: -1rem;
  right: -1rem;
  width: 2.6rem;
  height: 2.6rem;
  font-size: 1.12rem;
  font-weight: 800;
  line-height: 2.34rem;
  background: #f1f5f9;
  border-radius: 999px;
  text-align: center;
  color: #0f172a;
  border: 1px solid rgb(255 255 255 / 0.35);
}

.hand-total.bust {
  background: #f43f5e;
  color: #fff;
}

.hand-total.twenty-one {
  background: #facc15;
}

.hand-bet {
  position: absolute;
  bottom: -2.7rem;
  left: 0;
  width: 100%;
  text-align: center;
}

.hand-bet .chip {
  display: inline-block;
  width: 1.1rem;
  height: 1.1rem;
  margin: 0.08rem;
  border-radius: 999px;
  background: radial-gradient(circle at 35% 30%, #fde68a 20%, #f43f5e 21%, #f43f5e 80%);
  border: 1px solid rgb(255 255 255 / 0.4);
  transition: all 0.3s ease-in;
}

.hand-result {
  position: absolute;
  width: 100%;
  top: 1.1rem;
  left: 0;
  text-align: center;
}

.hand-result span {
  display: inline-block;
  padding: 0.3rem 0.7rem;
  border-radius: 0.65rem;
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: rgb(2 6 23 / 0.75);
  border: 1px solid rgb(255 255 255 / 0.25);
}

.hand-result span.win {
  color: #facc15;
}

.hand-result span.push {
  color: #bae6fd;
}

.hand-result span.lose {
  color: #fda4af;
}

.hand-owner {
  margin: 0.4rem 0 0;
  text-align: center;
  font-size: 0.78rem;
  color: #cbd5e1;
}

.deal-enter-active {
  animation: deal 0.26s;
}

.deal-leave-active {
  animation: deal 0.26s reverse;
}

.pop-enter-active {
  transition: all 0.3s ease-out;
}

.pop-leave-active {
  transition: all 0.12s ease-in;
}

.pop-enter-from,
.pop-leave-to {
  transform: scale(0) rotate(300deg);
}

.coin-enter-from,
.is-win .coin-leave-to {
  transform: translateY(45vh);
  opacity: 0;
}

.coin-leave-to,
.is-win .coin-enter-from {
  transform: translateY(-45vh);
  opacity: 0;
}

.balloon-enter-active {
  animation: balloon-in ease-in-out 0.45s;
  transform-origin: 50% 100%;
}

.balloon-leave-active {
  transition: all 0.1s;
  transform-origin: 50% 100%;
}

.balloon-leave-to {
  transform: scale(0);
  opacity: 0;
}

@keyframes deal {
  from {
    transform: translateY(-100vh);
  }
  to {
    transform: translateY(0);
  }
}

@keyframes balloon-in {
  0% {
    transform: scale(0) skewX(0deg) rotate(-20deg);
  }
  40% {
    transform: scale(1) skewX(-5deg) rotate(10deg);
  }
  100% {
    transform: skewX(0deg) rotate(0deg);
  }
}

@media (max-width: 900px) {
  .game-hand.is-active,
  .game-hand.is-split.is-active {
    transform: scale(1.05);
  }

  .hand-bet {
    bottom: -2.2rem;
  }
}
</style>

