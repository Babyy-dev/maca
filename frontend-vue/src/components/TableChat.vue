<template>
  <section class="card chat-panel">
    <div class="row">
      <h4>Table Chat</h4>
      <button class="btn" :disabled="!store.activeTableId" @click="clearDraft">Clear</button>
    </div>
    <p v-if="!store.activeTableId" class="muted">Join a table to chat.</p>

    <div ref="chatBox" class="chat-box">
      <article v-for="message in store.activeChatMessages" :key="message.id" class="chat-item">
        <p class="meta">{{ message.username }} | {{ formatTime(message.created_at) }}</p>
        <p class="text">{{ message.message }}</p>
      </article>
    </div>

    <form class="chat-form" @submit.prevent="send">
      <input v-model="draft" :disabled="!store.activeTableId" maxlength="280" placeholder="Type message..." />
      <button class="btn" :disabled="!store.activeTableId || !draft.trim()" type="submit">Send</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue"

import { useMultiplayerStore } from "../stores/multiplayer"

const store = useMultiplayerStore()
const draft = ref("")
const chatBox = ref<HTMLDivElement | null>(null)

watch(
  () => store.activeChatMessages.length,
  async () => {
    await nextTick()
    if (chatBox.value) {
      chatBox.value.scrollTop = chatBox.value.scrollHeight
    }
  },
)

async function send() {
  if (!draft.value.trim()) return
  await store.sendTableChat(draft.value)
  draft.value = ""
}

function clearDraft() {
  draft.value = ""
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleTimeString()
}
</script>

