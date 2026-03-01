<template>
  <div class="playing-card" :class="{ 'face-down': isFaceDown, compact }">
    <div class="front">
      <div class="corner" :class="{ red: isRed }">
        <span class="value">{{ resolvedValue }}</span>
        <span class="suit">{{ resolvedSuit }}</span>
      </div>
    </div>
    <div class="back" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue"

const props = defineProps<{
  value?: string
  suit?: string
  card?: string
  faceDown?: boolean
  compact?: boolean
}>()

function parseCardCode(rawCode?: string): { value: string; suit: string; isFaceDown: boolean } {
  const code = (rawCode ?? "").trim().toUpperCase()
  if (!code || code === "??") {
    return {
      value: "",
      suit: "",
      isFaceDown: true,
    }
  }

  const match = /^([0-9]{1,2}|[AJQK])([SHDC])$/.exec(code)
  if (!match) {
    return {
      value: code,
      suit: "",
      isFaceDown: false,
    }
  }

  return {
    value: match[1],
    suit: match[2],
    isFaceDown: false,
  }
}

const parsed = computed(() => parseCardCode(props.card))

const resolvedValue = computed(() => (props.value ?? parsed.value.value ?? "").toUpperCase())
const rawSuit = computed(() => (props.suit ?? parsed.value.suit ?? "").toUpperCase())
const resolvedSuit = computed(() => {
  if (rawSuit.value === "S") return "â™ "
  if (rawSuit.value === "H") return "â™¥"
  if (rawSuit.value === "D") return "â™¦"
  if (rawSuit.value === "C") return "â™£"
  return rawSuit.value
})
const isFaceDown = computed(() => Boolean(props.faceDown) || parsed.value.isFaceDown)
const isRed = computed(() => {
  const suit = rawSuit.value
  return suit === "H" || suit === "D"
})
</script>

<style scoped>
.playing-card {
  position: relative;
  width: clamp(4rem, 6.4vw, 6.8rem);
  height: calc(clamp(4rem, 6.4vw, 6.8rem) * 1.5);
  transform-style: preserve-3d;
  perspective: 900px;
}

.playing-card.compact {
  width: clamp(3.2rem, 4.9vw, 5rem);
  height: calc(clamp(3.2rem, 4.9vw, 5rem) * 1.5);
}

.playing-card .front,
.playing-card .back {
  position: absolute;
  inset: 0;
  border-radius: 0.6rem;
  border: 1px solid rgb(255 255 255 / 0.45);
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  backface-visibility: hidden;
  transition: transform 280ms ease;
  box-shadow: 0 8px 18px rgb(0 0 0 / 0.3);
}

.playing-card .front {
  background-image: url("../assets/card-front.svg");
  background-color: #f8fafc;
}

.playing-card .back {
  background-image: url("../assets/card-back.svg");
  background-color: #f43f5e;
  transform: rotateY(-180deg);
}

.playing-card.face-down .front {
  transform: rotateY(180deg);
}

.playing-card.face-down .back {
  transform: rotateY(0deg);
}

.corner {
  position: absolute;
  top: 0.36rem;
  left: 0.36rem;
  display: grid;
  justify-items: center;
  line-height: 1;
  color: #0f172a;
  text-shadow: 0 1px 0 rgb(255 255 255 / 0.5);
}

.corner .value {
  font-size: clamp(0.68rem, 1.1vw, 0.92rem);
  font-weight: 800;
}

.corner .suit {
  margin-top: 0.08rem;
  font-size: clamp(0.58rem, 0.95vw, 0.84rem);
  font-weight: 800;
}

.corner.red {
  color: #b91c1c;
}
</style>

