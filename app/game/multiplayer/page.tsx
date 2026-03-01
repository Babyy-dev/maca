"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { FormEvent, memo, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

import AuthActionButtons from "@/components/auth-action-buttons"
import { ApiError, Table, TableGameState, getMe, getStoredToken, listTables } from "@/lib/maca-api"
import {
  MultiplayerMutation,
  createInitialMultiplayerState,
  multiplayerGetters,
  multiplayerReducer,
} from "@/lib/multiplayer-store"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"
const ACTIVE_TABLE_STORAGE_KEY = "maca_active_table_id"
const SPECTATOR_TABLE_STORAGE_KEY = "maca_spectator_table_id"

type RealtimeAck = {
  ok?: boolean
  error?: string
  duplicate?: boolean
  table?: Table
  state?: TableGameState
  table_id?: string | null
  spectator_table_id?: string | null
  mode?: "player" | "spectator"
}

type TableCardView = {
  rank: string
  suit: string
  red: boolean
  hidden: boolean
}

type RoundBanner = {
  id: string
  label: "WIN" | "LOSE" | "PUSH" | "BLACKJACK"
  net: number
}

const SUIT_SYMBOL: Record<string, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2)
}

function cardNumericValue(raw: string): number {
  if (!raw || raw === "??") return 0
  const rank = raw.slice(0, -1).toUpperCase()
  if (rank === "A") return 11
  if (rank === "K" || rank === "Q" || rank === "J") return 10
  return Number.parseInt(rank, 10) || 0
}

function handTotalFromCards(cards: string[]): number {
  let total = 0
  let aces = 0
  cards.forEach((card) => {
    if (card === "??") return
    const rank = card.slice(0, -1).toUpperCase()
    if (rank === "A") aces += 1
    total += cardNumericValue(card)
  })
  while (total > 21 && aces > 0) {
    total -= 10
    aces -= 1
  }
  return total
}

function dealerTotalLabel(cards: string[] | undefined, fallbackScore: number | null | undefined): string {
  if (!cards || cards.length === 0) return "-"
  if (cards.includes("??")) {
    const visibleCards = cards.filter((card) => card !== "??")
    const visibleTotal = handTotalFromCards(visibleCards)
    return `${visibleTotal} + ?`
  }
  if (typeof fallbackScore === "number") return String(fallbackScore)
  return String(handTotalFromCards(cards))
}

function shortId(value: string | null | undefined): string {
  if (!value) return "n/a"
  return value.slice(0, 8)
}

function cardToView(raw: string): TableCardView {
  if (raw === "??") {
    return { rank: "?", suit: "?", red: false, hidden: true }
  }
  const suitCode = raw.slice(-1)
  const rank = raw.slice(0, -1)
  const suit = SUIT_SYMBOL[suitCode] ?? suitCode
  const red = suitCode === "H" || suitCode === "D"
  return { rank, suit, red, hidden: false }
}

function createActionId(
  action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance",
): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${action}-${globalThis.crypto.randomUUID()}`
  }
  return `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getStoredTableId(key: string): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(key)
}

function setStoredTableId(key: string, value: string | null): void {
  if (typeof window === "undefined") return
  if (!value) {
    localStorage.removeItem(key)
    return
  }
  localStorage.setItem(key, value)
}

function remainingFromDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  const ms = new Date(deadline).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 1000))
}

const PlayingCard = memo(function PlayingCard({
  card,
  index,
  liteMotion,
}: {
  card: string
  index: number
  liteMotion: boolean
}) {
  const parsed = cardToView(card)
  return (
    <motion.div
      className="playing-card"
      initial={liteMotion ? false : { opacity: 0, y: -100, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -2 : 2 }}
      transition={liteMotion ? { duration: 0 } : { duration: 0.28, delay: index * 0.03 }}
    >
      <div
        className="card-face card-front"
        style={{
          transform: parsed.hidden ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        <div className="card-corner top" style={{ color: parsed.red ? "#be123c" : "#0f172a" }}>
          <span>{parsed.rank}</span>
          <span>{parsed.suit}</span>
        </div>
        <div className="card-suit-main" style={{ color: parsed.red ? "#be123c" : "#0f172a" }}>
          {parsed.suit}
        </div>
        <div className="card-corner bottom" style={{ color: parsed.red ? "#be123c" : "#0f172a" }}>
          <span>{parsed.rank}</span>
          <span>{parsed.suit}</span>
        </div>
      </div>
      <div
        className="card-face card-back"
        style={{
          transform: parsed.hidden ? "rotateY(0deg)" : "rotateY(180deg)",
        }}
      >
        <div className="card-back-inner">MACA</div>
      </div>
    </motion.div>
  )
})

export default function MultiplayerGamePage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const pendingReadyRef = useRef(false)
  const pendingActionRef = useRef(false)
  const reducedMotion = useReducedMotion()
  const [readyBet, setReadyBet] = useState("10")
  const [tick, setTick] = useState(0)
  const [roundBanner, setRoundBanner] = useState<RoundBanner | null>(null)
  const [isSubmittingReady, setIsSubmittingReady] = useState(false)
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [state, dispatch] = useReducer(multiplayerReducer, createInitialMultiplayerState())

  const commit = (mutation: MultiplayerMutation) => dispatch(mutation)

  const activeTable = useMemo(() => multiplayerGetters.activeTable(state), [state])
  const activeGameState = useMemo(() => multiplayerGetters.activeGameState(state), [state])
  const isViewingAsSpectator = useMemo(
    () => multiplayerGetters.isViewingAsSpectator(state),
    [state],
  )
  const isCurrentUserParticipant = useMemo(
    () => multiplayerGetters.isCurrentUserParticipant(state),
    [state],
  )
  const isCurrentUserReady = useMemo(
    () => multiplayerGetters.isCurrentUserReady(state),
    [state],
  )
  const isMyTurn = useMemo(() => multiplayerGetters.isMyTurn(state), [state])
  const myAvailableActions = useMemo(() => multiplayerGetters.myAvailableActions(state), [state])
  const activeTurnRemaining = useMemo(() => {
    void tick
    return remainingFromDeadline(activeGameState?.turn_deadline)
  }, [activeGameState, tick])
  const liteMotion = Boolean(reducedMotion)
  const dealerTotal = useMemo(
    () => dealerTotalLabel(activeGameState?.dealer_cards, activeGameState?.dealer_score),
    [activeGameState?.dealer_cards, activeGameState?.dealer_score],
  )

  useEffect(() => {
    const myUserId = state.user?.id
    if (!myUserId) return
    const isMyActiveTurn =
      activeGameState?.status === "active" &&
      activeGameState.current_turn_user_id === myUserId
    if (isMyActiveTurn) return
    if (pendingActionRef.current || isSubmittingAction) {
      pendingActionRef.current = false
      setIsSubmittingAction(false)
    }
  }, [
    activeGameState?.status,
    activeGameState?.current_turn_user_id,
    state.user?.id,
    isSubmittingAction,
  ])

  useEffect(() => {
    if (!roundBanner) return
    const timer = setTimeout(() => setRoundBanner(null), 2200)
    return () => clearTimeout(timer)
  }, [roundBanner])

  useEffect(() => {
    if (activeGameState?.status !== "active" || !activeGameState.turn_deadline) return
    const timer = setInterval(() => setTick((prev) => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [activeGameState?.status, activeGameState?.turn_deadline])

  useEffect(() => {
    const storedToken = getStoredToken()
    if (!storedToken) {
      router.replace("/auth/login")
      return
    }
    const authToken = storedToken
    commit({ type: "set_token", payload: authToken })

    const persistedTableId = getStoredTableId(ACTIVE_TABLE_STORAGE_KEY)
    const persistedSpectatorTableId = getStoredTableId(SPECTATOR_TABLE_STORAGE_KEY)
    if (persistedTableId) {
      commit({ type: "set_active_table", payload: persistedTableId })
    }
    if (persistedSpectatorTableId) {
      commit({ type: "set_spectator_table", payload: persistedSpectatorTableId })
    }

    async function bootstrap(): Promise<void> {
      try {
        const [me, tables] = await Promise.all([getMe(authToken), listTables(authToken)])
        commit({ type: "set_user", payload: me })
        commit({ type: "set_tables", payload: tables })
        setupSocket(authToken, me.id)
      } catch (caught) {
        const message =
          caught instanceof ApiError ? caught.message : "Failed to load multiplayer state"
        commit({ type: "set_notice", payload: message })
      } finally {
        commit({ type: "set_loading", payload: false })
      }
    }

    void bootstrap()

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [router])

  function setupSocket(
    authToken: string,
    userId: string,
  ): void {
    const socket = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { token: authToken },
      reconnection: true,
      reconnectionAttempts: 25,
      reconnectionDelay: 600,
      reconnectionDelayMax: 2500,
    })

    socket.on("connect", () => {
      commit({ type: "set_realtime_connected", payload: true })
      commit({ type: "set_notice", payload: "Realtime connected." })
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
      socket.emit("join_lobby", {})
      const preferredTableId = getStoredTableId(ACTIVE_TABLE_STORAGE_KEY)
      const preferredSpectatorTableId = getStoredTableId(SPECTATOR_TABLE_STORAGE_KEY)
      socket.emit(
        "sync_state",
        {
          preferred_table_id: preferredTableId,
          preferred_mode: preferredSpectatorTableId ? "spectator" : "auto",
        },
        (response: RealtimeAck) => {
          if (!response?.ok) return
          if (response.table_id) {
            commit({ type: "set_active_table", payload: response.table_id })
            setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, response.table_id)
          }
          if (response.spectator_table_id) {
            commit({ type: "set_spectator_table", payload: response.spectator_table_id })
            setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, response.spectator_table_id)
          } else {
            commit({ type: "set_spectator_table", payload: null })
            setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
          }
        },
      )
    })

    socket.on("disconnect", () => {
      commit({ type: "set_realtime_connected", payload: false })
      commit({ type: "set_notice", payload: "Realtime disconnected." })
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
    })

    socket.on("reconnect_attempt", () => {
      commit({ type: "set_notice", payload: "Reconnecting to realtime server..." })
    })

    socket.on("lobby_snapshot", (payload: { tables?: Table[] }) => {
      if (!Array.isArray(payload.tables)) return
      commit({ type: "set_tables", payload: payload.tables })
    })

    socket.on("table_snapshot", (payload: Table) => {
      commit({ type: "upsert_table", payload })
    })

    socket.on("table_game_state", (payload: TableGameState) => {
      if (!payload.table_id) return
      commit({ type: "upsert_game_state", payload })
      if (payload.status !== "active") {
        pendingActionRef.current = false
        setIsSubmittingAction(false)
      }
    })

    socket.on("table_game_started", (payload: TableGameState) => {
      if (!payload.table_id) return
      commit({ type: "upsert_game_state", payload })
      commit({ type: "set_notice", payload: `Round started on table ${payload.table_id}` })
      pendingActionRef.current = false
      setIsSubmittingAction(false)
    })

    socket.on("table_round_resolved", (payload: TableGameState) => {
      if (!payload.table_id) return
      commit({ type: "upsert_game_state", payload })
      commit({ type: "set_notice", payload: `Round settled on table ${payload.table_id}` })
      pendingActionRef.current = false
      setIsSubmittingAction(false)
      const myState = payload.player_states?.[userId]
      if (!myState) return
      const net = roundMoney(myState.total_payout ?? 0)
      const hasBlackjack = myState.hands.some((hand) => hand.result === "blackjack")
      const label: RoundBanner["label"] = hasBlackjack
        ? "BLACKJACK"
        : net > 0
          ? "WIN"
          : net < 0
            ? "LOSE"
            : "PUSH"
      setRoundBanner({
        id: createActionId("stand"),
        label,
        net,
      })
    })

    socket.on("table_game_ended", (payload: { table_id?: string; reason?: string }) => {
      if (!payload.table_id) return
      pendingActionRef.current = false
      setIsSubmittingAction(false)
      commit({
        type: "set_notice",
        payload: `Table ${payload.table_id} ended: ${payload.reason ?? "unknown reason"}`,
      })
    })

    socket.on("table_joined", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
      commit({ type: "set_active_table", payload: payload.table_id })
      commit({ type: "set_spectator_table", payload: null })
      setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, payload.table_id)
      setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
    })

    socket.on("table_left", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
      commit({ type: "set_notice", payload: `Left table ${payload.table_id}` })
      commit({ type: "set_active_table", payload: null })
      commit({ type: "set_spectator_table", payload: null })
      setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, null)
      setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
    })

    socket.on("spectator_joined", (payload: { table_id?: string; mode?: "player" | "spectator" }) => {
      if (!payload.table_id) return
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
      commit({ type: "set_active_table", payload: payload.table_id })
      setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, payload.table_id)
      if (payload.mode === "spectator") {
        commit({ type: "set_spectator_table", payload: payload.table_id })
        setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, payload.table_id)
      } else {
        commit({ type: "set_spectator_table", payload: null })
        setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
      }
    })

    socket.on("spectator_left", () => {
      commit({ type: "set_spectator_table", payload: null })
      setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
    })

    socket.on("turn_timeout", (payload: { table_id?: string; user_id?: string }) => {
      if (!payload.table_id) return
      if (payload.user_id && payload.user_id === userId) {
        pendingActionRef.current = false
        setIsSubmittingAction(false)
      }
      commit({
        type: "set_notice",
        payload: `Turn timeout on ${payload.table_id}: ${shortId(payload.user_id)}`,
      })
    })

    socket.on("table_closed", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      pendingActionRef.current = false
      pendingReadyRef.current = false
      setIsSubmittingAction(false)
      setIsSubmittingReady(false)
      commit({ type: "remove_table", payload: payload.table_id })
      commit({ type: "remove_game_state", payload: payload.table_id })
      if (getStoredTableId(ACTIVE_TABLE_STORAGE_KEY) === payload.table_id) {
        commit({ type: "set_active_table", payload: null })
        commit({ type: "set_spectator_table", payload: null })
        setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, null)
        setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
      }
    })

    socketRef.current = socket
  }

  async function emitRealtime(eventName: string, payload: Record<string, unknown>): Promise<RealtimeAck> {
    const socket = socketRef.current
    if (!socket || !socket.connected) {
      throw new Error("Realtime connection unavailable")
    }
    return new Promise((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        socket.off("disconnect", onDisconnect)
      }
      const onDisconnect = (): void => {
        cleanup()
        reject(new Error("Realtime disconnected"))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error("Realtime request timeout"))
      }, 8000)
      socket.on("disconnect", onDisconnect)
      socket.emit(eventName, payload, (response: RealtimeAck) => {
        cleanup()
        if (!response?.ok) {
          reject(new Error(response?.error ?? "Realtime request failed"))
          return
        }
        resolve(response)
      })
    })
  }

  async function onJoinTable(tableId: string): Promise<void> {
    try {
      await emitRealtime("join_table", { table_id: tableId })
      commit({ type: "set_notice", payload: `Joined table ${tableId}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to join table"
      commit({ type: "set_notice", payload: message })
    }
  }

  async function onSpectateTable(tableId: string): Promise<void> {
    try {
      await emitRealtime("spectate_table", { table_id: tableId })
      commit({ type: "set_notice", payload: `Spectating table ${tableId}` })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to spectate table"
      commit({ type: "set_notice", payload: message })
    }
  }

  async function onLeaveTable(): Promise<void> {
    try {
      await emitRealtime("leave_table", {})
      commit({ type: "set_notice", payload: "Left table" })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to leave table"
      commit({ type: "set_notice", payload: message })
    }
  }

  async function onSetReady(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (pendingReadyRef.current) return
    if (!activeTable) return
    const parsedBet = Number.parseFloat(readyBet)
    const bet = Number.isFinite(parsedBet) && parsedBet > 0 ? parsedBet : 10
    pendingReadyRef.current = true
    setIsSubmittingReady(true)
    try {
      await emitRealtime("set_ready", {
        ready: !isCurrentUserReady,
        bet,
      })
      commit({
        type: "set_notice",
        payload: isCurrentUserReady
          ? "Marked not ready."
          : `Marked ready with ${bet.toFixed(2)} chips.`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update ready state"
      commit({ type: "set_notice", payload: message })
    } finally {
      pendingReadyRef.current = false
      setIsSubmittingReady(false)
    }
  }

  async function onTurnAction(
    action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance",
  ): Promise<void> {
    if (pendingActionRef.current) return
    if (!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes(action)) return
    pendingActionRef.current = true
    setIsSubmittingAction(true)
    try {
      const response = await emitRealtime("take_turn_action", {
        action,
        action_id: createActionId(action),
      })
      if (response.state) {
        commit({ type: "upsert_game_state", payload: response.state })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit turn action"
      commit({ type: "set_notice", payload: message })
    } finally {
      pendingActionRef.current = false
      setIsSubmittingAction(false)
    }
  }

  if (state.isLoading) {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-white/15 bg-slate-900/55 p-6 text-slate-200">
          Loading multiplayer table...
        </div>
      </main>
    )
  }

  return (
    <main className="safe-bottom-pad min-h-screen px-3 pb-10 pt-4 max-[360px]:px-2 max-[360px]:pt-3 sm:px-5 sm:pt-6">
      <div className="mx-auto flex w-full max-w-[98vw] flex-col gap-4">
        <header className="glass-card flex flex-wrap items-start justify-between gap-3 rounded-2xl px-3 py-3 max-[360px]:gap-2 max-[360px]:px-2.5 sm:items-center sm:px-4">
          <div>
            <h1 className="font-title text-2xl text-emerald-300 max-[360px]:text-xl sm:text-4xl">Multiplayer Poker Table</h1>
            <p className="text-xs text-slate-200 sm:text-sm">
              Backend-driven realtime blackjack with turn timers and table actions.
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 max-[360px]:gap-1.5 sm:w-auto sm:justify-end">
            <span
              className={`touch-target inline-flex items-center rounded-lg border px-3 py-2 text-xs max-[360px]:px-2 max-[360px]:text-[11px] ${
                state.isRealtimeConnected
                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-300/40 bg-amber-400/10 text-amber-200"
              }`}
            >
              {state.isRealtimeConnected ? "Realtime Connected" : "Realtime Offline"}
            </span>
            <Link className="touch-target inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm" href="/lobby">
              Lobby
            </Link>
            <Link className="touch-target inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm" href="/game/single-player">
              Single Player
            </Link>
            <AuthActionButtons
              loginClassName="touch-target inline-flex items-center rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm"
              logoutClassName="touch-target inline-flex items-center rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm"
            />
          </div>
        </header>

        {state.notice ? (
          <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 sm:text-sm">
            {state.notice}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.9fr_0.7fr]">
          <section className="glass-card glow-ring rounded-3xl p-4 max-[360px]:p-3 sm:p-6">
            {activeTable ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm text-slate-100">
                      Table: <span className="text-cyan-300">{activeTable.name}</span>
                    </p>
                    <p className="text-xs text-slate-300">
                      {activeTable.players.length}/{activeTable.max_players} players |{" "}
                      {activeTable.spectator_count ?? 0} spectators
                    </p>
                    <p className="text-xs text-slate-300">
                      Mode:{" "}
                      <span className="text-emerald-200">
                        {isViewingAsSpectator
                          ? "Spectator"
                          : isCurrentUserParticipant
                            ? "Player"
                            : "Viewer"}
                      </span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="touch-target inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white max-[360px]:px-2 max-[360px]:text-xs"
                      onClick={() => {
                        onSpectateTable(activeTable.id).catch(() => undefined)
                      }}
                      type="button"
                    >
                      Spectate
                    </button>
                    <button
                      className="touch-target inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white max-[360px]:px-2 max-[360px]:text-xs"
                      onClick={() => {
                        onLeaveTable().catch(() => undefined)
                      }}
                      type="button"
                    >
                      Leave
                    </button>
                  </div>
                </div>

                <div className="table-scene mt-5">
                  <div className="premium-table !min-h-[70vh] sm:!min-h-[74vh]">
                    <div className="dealer-arc" />
                    <div className="table-text">LIVE MULTIPLAYER ROUND</div>
                    <div className="table-glow" />

                    <AnimatePresence>
                      {roundBanner ? (
                        <motion.div
                          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
                          initial={{ opacity: 0, scale: 0.74 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 1.06 }}
                          transition={{ duration: 0.42, ease: "easeOut" }}
                        >
                          <div
                            className={`rounded-2xl border px-8 py-5 text-center shadow-2xl backdrop-blur max-[360px]:px-4 max-[360px]:py-3 ${
                              roundBanner.net > 0
                                ? "border-emerald-200/40 bg-emerald-400/15"
                                : roundBanner.net < 0
                                  ? "border-rose-200/40 bg-rose-400/15"
                                  : "border-amber-200/40 bg-amber-400/15"
                            }`}
                          >
                            <p className="font-title text-3xl max-[360px]:text-2xl sm:text-6xl">{roundBanner.label}</p>
                            <p
                              className={`mt-1 text-lg font-semibold max-[360px]:text-base sm:text-2xl ${
                                roundBanner.net > 0
                                  ? "text-emerald-100"
                                  : roundBanner.net < 0
                                    ? "text-rose-100"
                                    : "text-amber-100"
                              }`}
                            >
                              {roundBanner.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(roundBanner.net))}
                            </p>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>

                    <div className="absolute left-1/2 top-3 max-w-[94%] -translate-x-1/2 rounded-full border border-white/20 bg-black/30 px-4 py-1 text-xs text-slate-100 max-[360px]:px-2.5 max-[360px]:text-[10px] sm:top-4 sm:text-sm">
                      Phase: {activeGameState?.phase ?? "idle"} | Turn:{" "}
                      {shortId(activeGameState?.current_turn_user_id)}
                      {activeGameState?.status === "active" ? ` (${activeTurnRemaining}s)` : ""}
                    </div>
                    <div className="absolute left-1/2 top-10 max-w-[94%] -translate-x-1/2 rounded-full border border-white/20 bg-black/30 px-4 py-1 text-xs text-cyan-100 max-[360px]:px-2.5 max-[360px]:text-[10px] sm:top-12 sm:text-sm">
                      Dealer Total: {dealerTotal}
                    </div>

                    <div className="absolute left-1/2 top-14 flex -translate-x-1/2 flex-wrap justify-center gap-2 sm:gap-3">
                      {(activeGameState?.dealer_cards ?? []).map((card, index) => (
                        <PlayingCard
                          card={card}
                          index={index}
                          key={`dealer-${card}-${index}`}
                          liteMotion={liteMotion}
                        />
                      ))}
                    </div>

                    <div className="absolute bottom-20 left-1/2 w-[96%] -translate-x-1/2 max-[360px]:bottom-16 max-[360px]:w-[97%] sm:bottom-24">
                      <div className="table-mobile-scroll pr-1 max-[360px]:pr-0">
                        <div className="grid gap-3 sm:grid-cols-2">
                          {activeTable.players.map((playerId) => {
                            const playerState = activeGameState?.player_states?.[playerId]
                            const isTurn = activeGameState?.current_turn_user_id === playerId
                            return (
                              <div
                                className={`rounded-2xl border p-3 max-[360px]:p-2 ${
                                  isTurn
                                    ? "border-cyan-300/55 bg-cyan-500/10"
                                    : "border-white/20 bg-black/25"
                                }`}
                                key={playerId}
                              >
                                <p className="text-xs text-slate-100">
                                  {shortId(playerId)}
                                  {playerId === state.user?.id ? " (you)" : ""}
                                </p>
                                {!playerState ? (
                                  <p className="mt-2 text-xs text-slate-400">Waiting for round state...</p>
                                ) : (
                                  <div className="mt-2 space-y-2">
                                    {playerState.hands.map((hand, handIndex) => (
                                      <div className="rounded-lg border border-white/15 bg-black/20 p-2" key={hand.hand_id}>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-[11px] text-slate-300 max-[360px]:text-[10px]">
                                            Hand {handIndex + 1} | {hand.result ?? hand.status}
                                          </span>
                                          <span className="rounded-full border border-cyan-200/35 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-100 max-[360px]:px-1.5 max-[360px]:text-[9px]">
                                            TOTAL {hand.score}
                                          </span>
                                        </div>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <span className="rounded-full border border-white/20 bg-black/20 px-2 py-1 text-[10px] text-slate-200 max-[360px]:px-1.5 max-[360px]:text-[9px]">
                                            BET {formatMoney(hand.bet)}
                                          </span>
                                          {hand.payout !== null ? (
                                            <span
                                              className={`rounded-full border px-2 py-1 text-[10px] max-[360px]:px-1.5 max-[360px]:text-[9px] ${
                                                hand.payout >= 0
                                                  ? "border-emerald-300/35 bg-emerald-400/10 text-emerald-200"
                                                  : "border-rose-300/35 bg-rose-400/10 text-rose-200"
                                              }`}
                                            >
                                              {hand.payout >= 0 ? "+" : "-"}{formatMoney(Math.abs(hand.payout))}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1">
                                          {hand.cards.map((card, cardIndex) => (
                                            <PlayingCard
                                              card={card}
                                              index={cardIndex}
                                              key={`${hand.hand_id}-${card}-${cardIndex}`}
                                              liteMotion={liteMotion}
                                            />
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="chip-stack chip-a"><span>100</span></div>
                    <div className="chip-stack chip-b"><span>25</span></div>
                    <div className="chip-stack chip-c"><span>10</span></div>
                  </div>
                </div>

                <form className="mt-4 flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end" onSubmit={(event) => void onSetReady(event)}>
                  <label className="text-xs text-slate-200 sm:text-sm">
                    Ready Bet
                    <input
                      className="touch-target mt-1 w-24 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-sm text-white max-[360px]:w-20 max-[360px]:text-xs"
                      min={1}
                      onChange={(event) => setReadyBet(event.target.value)}
                      step="0.5"
                      type="number"
                      value={readyBet}
                    />
                  </label>
                  <button
                    className="touch-target inline-flex items-center justify-center rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60 max-[360px]:px-3 max-[360px]:text-xs"
                    disabled={!isCurrentUserParticipant || isViewingAsSpectator || !state.isRealtimeConnected || isSubmittingReady}
                    type="submit"
                  >
                    {isSubmittingReady ? "Updating..." : isCurrentUserReady ? "Set Not Ready" : "Set Ready"}
                  </button>
                </form>

                <div className="safe-sticky-bottom sticky z-30 mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-white/20 bg-slate-950/70 p-2 backdrop-blur max-[360px]:gap-1.5 max-[360px]:p-1.5 sm:static sm:z-auto sm:grid-cols-6 sm:border-0 sm:bg-transparent sm:p-0">
                  {[
                    ["hit", "Hit", "bg-emerald-300"],
                    ["stand", "Stand", "bg-cyan-300"],
                    ["double_down", "Double", "bg-amber-300"],
                    ["split", "Split", "bg-violet-300"],
                    ["insurance", "Insurance", "bg-indigo-300"],
                    ["surrender", "Surrender", "bg-rose-300"],
                  ].map(([action, label, color]) => (
                    <button
                      className={`touch-target rounded-xl ${color} px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs`}
                      disabled={
                        !isMyTurn ||
                        isViewingAsSpectator ||
                        !myAvailableActions.includes(action) ||
                        !state.isRealtimeConnected ||
                        isSubmittingAction
                      }
                      key={action}
                      onClick={() => {
                        void onTurnAction(
                          action as
                            | "hit"
                            | "stand"
                            | "double_down"
                            | "split"
                            | "surrender"
                            | "insurance",
                        )
                      }}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-300">Join or spectate a table to open multiplayer game view.</p>
            )}
          </section>

          <aside className="glass-card rounded-3xl p-4 max-[360px]:p-3 sm:p-5">
            <h2 className="font-title text-2xl text-white">Table List</h2>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">Pick a table to join or spectate.</p>
            <div className="mt-4 space-y-2">
              {state.tables.length === 0 ? (
                <p className="text-sm text-slate-300">No open tables right now.</p>
              ) : (
                state.tables.map((table) => (
                  <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={table.id}>
                    <p className="text-sm text-white">
                      {table.name} ({table.players.length}/{table.max_players})
                    </p>
                    <p className="text-xs text-slate-300">
                      Owner {shortId(table.owner_id)} | Spectators {table.spectator_count ?? 0}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="touch-target inline-flex items-center rounded-md bg-gradient-to-r from-orange-300 to-rose-500 px-3 py-1 text-sm font-semibold text-slate-900"
                        onClick={() => {
                          void onJoinTable(table.id)
                        }}
                        type="button"
                      >
                        Join
                      </button>
                      <button
                        className="touch-target inline-flex items-center rounded-md border border-white/20 bg-white/5 px-3 py-1 text-sm font-semibold text-white"
                        onClick={() => {
                          void onSpectateTable(table.id)
                        }}
                        type="button"
                      >
                        Spectate
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
