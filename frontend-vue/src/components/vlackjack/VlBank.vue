<template>
  <span class="bank" :class="{ 'is-increasing': isIncreasing }">
    <span class="chip" :class="{ 'is-spinning': isIncreasing }">?</span>
    <small>x</small>
    <span class="number">{{ amount.toFixed(2) }}</span>
  </span>
</template>

<script setup lang="ts">
import { ref, watch } from "vue"

const props = defineProps<{
  amount: number
}>()

const isIncreasing = ref(false)

watch(
  () => props.amount,
  (current, previous) => {
    if (current > previous) {
      isIncreasing.value = true
      window.setTimeout(() => {
        isIncreasing.value = false
      }, 800)
    }
  },
)
</script>

<style scoped>
.bank {
  background: rgb(0 0 0 / 0.16);
  height: 3.4rem;
  display: inline-flex;
  padding: 0.6rem 0.9rem;
  justify-content: center;
  align-items: center;
  border-radius: 0.9rem;
  font-weight: 700;
  font-size: clamp(1rem, 2vw, 1.5rem);
  transition: all 0.2s ease;
  color: #facc15;
}

.bank small {
  font-size: 1rem;
  font-weight: 400;
  margin: 0 0.45rem;
  opacity: 0.9;
}

.bank.is-increasing {
  background: rgb(0 0 0 / 0.3);
}

.bank .number {
  transition: all 0.2s ease;
}

.bank.is-increasing .number {
  transform: scale(1.08);
}

.chip {
  display: inline-grid;
  place-items: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  color: #f43f5e;
  text-shadow:
    0 0 0 #facc15,
    -1px 0 #facc15,
    1px 0 #facc15,
    0 -1px #facc15,
    0 1px #facc15;
}

.is-spinning {
  animation: spin 0.8s ease;
  transform-origin: center;
}

@keyframes spin {
  from {
    transform: rotateY(0deg);
  }
  to {
    transform: rotateY(1440deg);
  }
}
</style>

