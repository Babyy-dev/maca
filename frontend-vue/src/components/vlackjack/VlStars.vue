<template>
  <div class="stars-container" aria-hidden="true">
    <div class="stars">
      <svg
        v-for="(starStyle, i) in starStyles"
        :key="i"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        :style="starStyle"
      >
        <path
          opacity="0.12"
          fill="currentColor"
          class="text-white"
          d="M14.1,14.1L12,24l-2.1-9.9L0,12l9.9-2.1L12,0l2.1,9.9L24,12L14.1,14.1z"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue"

const starStyles = ref<Array<Record<string, string>>>([])

onMounted(() => {
  const numStars = 10
  const minSize = 10
  const maxSize = 70
  const minDuration = 10
  const maxDuration = 28
  const next: Array<Record<string, string>> = []
  for (let i = 0; i < numStars; i += 1) {
    const size = `${minSize + Math.random() * (maxSize - minSize)}px`
    const top = `${Math.random() * window.innerHeight}px`
    const animationDuration = `${minDuration + Math.random() * (maxDuration - minDuration)}s`
    const animationDelay = `${Math.random() * maxDuration}s`
    next.push({
      position: "absolute",
      animationDuration,
      animationDelay,
      width: size,
      height: size,
      top,
    })
  }
  starStyles.value = next
})
</script>

<style scoped>
.stars-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.stars {
  position: relative;
  width: 100%;
  height: 100%;
}

.stars svg {
  left: -80px;
  animation: slide-right linear infinite;
}

@keyframes slide-right {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(calc(100vw + 80px));
  }
}
</style>

