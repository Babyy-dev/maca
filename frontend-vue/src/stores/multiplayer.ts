import { defineStore } from "pinia"
import { io, Socket } from "socket.io-client"

import { Table, TableGameState, getApiBase, listTables } from "../lib/api"
import { useAuthStore } from "./auth"

type MultiplayerState = {
  socket: Socket | null
  connected: boolean
  tables: Table[]
  gameStates: Record<string, TableGameState>
  activeTableId: string | null
  spectatorTableId: string | null
  message: string
  loading: boolean
  chatByTable: Record<
    string,
    Array<{
      id: string
      table_id: string
      user_id: string
      username: string
      message: string
      created_at: string
    }>
  >
}

type Ack = {
  ok?: boolean
  error?: string
  table_id?: string | null
  spectator_table_id?: string | null
}

const ACTIVE_TABLE_STORAGE_KEY = "maca_active_table_id"
const SPECTATOR_TABLE_STORAGE_KEY = "maca_spectator_table_id"

function getStored(key: string): string | null {
  return localStorage.getItem(key)
}

function setStored(key: string, value: string | null) {
  if (!value) localStorage.removeItem(key)
  else localStorage.setItem(key, value)
}

export const useMultiplayerStore = defineStore("multiplayer", {
  state: (): MultiplayerState => ({
    socket: null,
    connected: false,
    tables: [],
    gameStates: {},
    activeTableId: null,
    spectatorTableId: null,
    message: "Not connected.",
    loading: false,
    chatByTable: {},
  }),
  getters: {
    activeTable: (state) => state.tables.find((table) => table.id === state.activeTableId) ?? null,
    activeGameState: (state) =>
      state.activeTableId ? (state.gameStates[state.activeTableId] ?? null) : null,
    activeChatMessages: (state) =>
      state.activeTableId ? (state.chatByTable[state.activeTableId] ?? []) : [],
  },
  actions: {
    async bootstrap() {
      const auth = useAuthStore()
      if (!auth.token) return
      this.loading = true
      try {
        this.tables = await listTables(auth.token)
        this.activeTableId = getStored(ACTIVE_TABLE_STORAGE_KEY)
        this.spectatorTableId = getStored(SPECTATOR_TABLE_STORAGE_KEY)
      } finally {
        this.loading = false
      }
    },
    async connect() {
      const auth = useAuthStore()
      if (!auth.token) {
        this.message = "Login required."
        return
      }
      if (this.socket?.connected) return

      const socket = io(getApiBase(), {
        path: "/socket.io",
        transports: ["websocket"],
        auth: { token: auth.token },
      })

      socket.on("connect", () => {
        this.connected = true
        this.message = "Connected to realtime lobby."
        socket.emit("join_lobby", {})
        const preferredTableId = getStored(ACTIVE_TABLE_STORAGE_KEY)
        const preferredMode = getStored(SPECTATOR_TABLE_STORAGE_KEY) ? "spectator" : "auto"
        socket.emit("sync_state", {
          preferred_table_id: preferredTableId,
          preferred_mode: preferredMode,
        })
      })

      socket.on("disconnect", () => {
        this.connected = false
        this.message = "Socket disconnected."
      })

      socket.on("lobby_snapshot", (payload: { tables?: Table[] }) => {
        if (Array.isArray(payload.tables)) this.tables = payload.tables
      })
      socket.on("table_snapshot", (payload: Table) => {
        this.tables = upsertTable(this.tables, payload)
      })
      socket.on("table_game_state", (payload: TableGameState) => {
        if (!payload.table_id) return
        this.gameStates = { ...this.gameStates, [payload.table_id]: payload }
      })
      socket.on("table_chat_history", (payload: { table_id?: string; messages?: Array<any> }) => {
        if (!payload.table_id || !Array.isArray(payload.messages)) return
        this.chatByTable = {
          ...this.chatByTable,
          [payload.table_id]: payload.messages,
        }
      })
      socket.on("table_chat_message", (payload: any) => {
        if (!payload?.table_id) return
        const current = this.chatByTable[payload.table_id] ?? []
        this.chatByTable = {
          ...this.chatByTable,
          [payload.table_id]: [...current, payload].slice(-100),
        }
      })
      socket.on("table_game_started", (payload: TableGameState) => {
        if (!payload.table_id) return
        this.gameStates = { ...this.gameStates, [payload.table_id]: payload }
        this.message = `Round started on ${payload.table_id}`
      })
      socket.on("table_round_resolved", (payload: TableGameState) => {
        if (!payload.table_id) return
        this.gameStates = { ...this.gameStates, [payload.table_id]: payload }
        this.message = `Round resolved on ${payload.table_id}`
      })
      socket.on("table_joined", (payload: { table_id?: string }) => {
        if (!payload.table_id) return
        this.activeTableId = payload.table_id
        this.spectatorTableId = null
        setStored(ACTIVE_TABLE_STORAGE_KEY, payload.table_id)
        setStored(SPECTATOR_TABLE_STORAGE_KEY, null)
      })
      socket.on("table_left", () => {
        this.activeTableId = null
        this.spectatorTableId = null
        setStored(ACTIVE_TABLE_STORAGE_KEY, null)
        setStored(SPECTATOR_TABLE_STORAGE_KEY, null)
      })
      socket.on("spectator_joined", (payload: { table_id?: string; mode?: "player" | "spectator" }) => {
        if (!payload.table_id) return
        this.activeTableId = payload.table_id
        if (payload.mode === "spectator") {
          this.spectatorTableId = payload.table_id
          setStored(SPECTATOR_TABLE_STORAGE_KEY, payload.table_id)
        }
        setStored(ACTIVE_TABLE_STORAGE_KEY, payload.table_id)
      })
      socket.on("spectator_left", () => {
        this.spectatorTableId = null
        setStored(SPECTATOR_TABLE_STORAGE_KEY, null)
      })

      this.socket = socket
    },
    disconnect() {
      this.socket?.disconnect()
      this.socket = null
      this.connected = false
    },
    async emitAck(eventName: string, payload: Record<string, unknown>) {
      const socket = this.socket
      if (!socket || !socket.connected) {
        throw new Error("Realtime socket is not connected")
      }
      const response = await new Promise<Ack>((resolve) => {
        socket.emit(eventName, payload, (ack: Ack) => resolve(ack ?? {}))
      })
      if (response.error || response.ok === false) {
        throw new Error(response.error ?? `Failed to execute ${eventName}`)
      }
      return response
    },
    async joinTable(tableId: string) {
      try {
        await this.emitAck("join_table", { table_id: tableId })
        this.message = `Joined ${tableId}`
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Failed to join table"
      }
    },
    async spectateTable(tableId: string) {
      try {
        await this.emitAck("spectate_table", { table_id: tableId })
        this.message = `Spectating ${tableId}`
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Failed to spectate table"
      }
    },
    async leaveTable() {
      try {
        await this.emitAck("leave_table", {})
        this.message = "Left table."
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Failed to leave table"
      }
    },
    async setReady(ready: boolean, bet = 10) {
      try {
        await this.emitAck("set_ready", { ready, bet_amount: bet })
        this.message = ready ? "Ready set." : "Not ready."
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Failed to update ready state"
      }
    },
    async sendAction(action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance") {
      const actionId =
        globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      try {
        await this.emitAck("take_turn_action", { action, action_id: actionId })
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Action failed"
      }
    },
    async sendTableChat(message: string) {
      const text = message.trim()
      if (!text) return
      try {
        await this.emitAck("send_table_chat", { message: text })
      } catch (error) {
        this.message = error instanceof Error ? error.message : "Chat send failed"
      }
    },
  },
})

function upsertTable(tables: Table[], table: Table): Table[] {
  const index = tables.findIndex((item) => item.id === table.id)
  if (index === -1) return [table, ...tables]
  const next = tables.slice()
  next[index] = table
  return next
}
