"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { FormEvent, useEffect, useMemo, useReducer, useRef, useState } from "react"
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

const SUIT_SYMBOL: Record<string, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
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

function PlayingCard({ card, index }: { card: string; index: number }) {
  const parsed = cardToView(card)
  return (
    <motion.div
      className="playing-card"
      initial={{ opacity: 0, y: -100, rotate: -6 }}
      animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -2 : 2 }}
      transition={{ duration: 0.28, delay: index * 0.03 }}
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
}

export default function MultiplayerGamePage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const [readyBet, setReadyBet] = useState("10")
  const [tick, setTick] = useState(0)
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

  useEffect(() => {
    const timer = setInterval(() => setTick((prev) => prev + 1), 1000)
    return () => clearInterval(timer)
  }, [])

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
        setupSocket(authToken, persistedTableId, persistedSpectatorTableId)
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
    persistedTableId: string | null,
    persistedSpectatorTableId: string | null,
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
      socket.emit("join_lobby", {})
      socket.emit(
        "sync_state",
        {
          preferred_table_id: persistedTableId,
          preferred_mode: persistedSpectatorTableId ? "spectator" : "auto",
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
    })

    socket.on("table_game_started", (payload: TableGameState) => {
      if (!payload.table_id) return
      commit({ type: "upsert_game_state", payload })
      commit({ type: "set_notice", payload: `Round started on table ${payload.table_id}` })
    })

    socket.on("table_round_resolved", (payload: TableGameState) => {
      if (!payload.table_id) return
      commit({ type: "upsert_game_state", payload })
      commit({ type: "set_notice", payload: `Round settled on table ${payload.table_id}` })
    })

    socket.on("table_game_ended", (payload: { table_id?: string; reason?: string }) => {
      if (!payload.table_id) return
      commit({
        type: "set_notice",
        payload: `Table ${payload.table_id} ended: ${payload.reason ?? "unknown reason"}`,
      })
    })

    socket.on("table_joined", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      commit({ type: "set_active_table", payload: payload.table_id })
      commit({ type: "set_spectator_table", payload: null })
      setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, payload.table_id)
      setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
    })

    socket.on("table_left", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      commit({ type: "set_notice", payload: `Left table ${payload.table_id}` })
      commit({ type: "set_active_table", payload: null })
      commit({ type: "set_spectator_table", payload: null })
      setStoredTableId(ACTIVE_TABLE_STORAGE_KEY, null)
      setStoredTableId(SPECTATOR_TABLE_STORAGE_KEY, null)
    })

    socket.on("spectator_joined", (payload: { table_id?: string; mode?: "player" | "spectator" }) => {
      if (!payload.table_id) return
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
      commit({
        type: "set_notice",
        payload: `Turn timeout on ${payload.table_id}: ${shortId(payload.user_id)}`,
      })
    })

    socket.on("table_closed", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
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
      const timer = setTimeout(() => reject(new Error("Realtime request timeout")), 8000)
      socket.emit(eventName, payload, (response: RealtimeAck) => {
        clearTimeout(timer)
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
    if (!activeTable) return
    const parsedBet = Number.parseFloat(readyBet)
    const bet = Number.isFinite(parsedBet) ? parsedBet : 10
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
    }
  }

  async function onTurnAction(
    action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance",
  ): Promise<void> {
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
    <main className="min-h-screen px-3 pb-10 pt-4 sm:px-5 sm:pt-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
          <div>
            <h1 className="font-title text-2xl text-emerald-300 sm:text-4xl">Multiplayer Poker Table</h1>
            <p className="text-xs text-slate-200 sm:text-sm">
              Backend-driven realtime blackjack with turn timers and table actions.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-lg border px-3 py-2 text-xs ${
                state.isRealtimeConnected
                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-300/40 bg-amber-400/10 text-amber-200"
              }`}
            >
              {state.isRealtimeConnected ? "Realtime Connected" : "Realtime Offline"}
            </span>
            <Link className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white sm:text-sm" href="/lobby">
              Lobby
            </Link>
            <Link className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white sm:text-sm" href="/game/single-player">
              Single Player
            </Link>
            <AuthActionButtons
              loginClassName="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 sm:text-sm"
              logoutClassName="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 sm:text-sm"
            />
          </div>
        </header>

        {state.notice ? (
          <div className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100 sm:text-sm">
            {state.notice}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
          <section className="glass-card glow-ring rounded-3xl p-4 sm:p-6">
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
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                      onClick={() => {
                        onSpectateTable(activeTable.id).catch(() => undefined)
                      }}
                      type="button"
                    >
                      Spectate
                    </button>
                    <button
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
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
                  <div className="premium-table">
                    <div className="dealer-arc" />
                    <div className="table-text">LIVE MULTIPLAYER ROUND</div>
                    <div className="table-glow" />

                    <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-white/20 bg-black/30 px-4 py-1 text-xs text-slate-100 sm:top-4 sm:text-sm">
                      Phase: {activeGameState?.phase ?? "idle"} | Turn:{" "}
                      {shortId(activeGameState?.current_turn_user_id)}
                      {activeGameState?.status === "active" ? ` (${activeTurnRemaining}s)` : ""}
                    </div>

                    <div className="absolute left-1/2 top-14 flex -translate-x-1/2 flex-wrap justify-center gap-2 sm:gap-3">
                      <AnimatePresence>
                        {(activeGameState?.dealer_cards ?? []).map((card, index) => (
                          <PlayingCard card={card} index={index} key={`dealer-${card}-${index}`} />
                        ))}
                      </AnimatePresence>
                    </div>

                    <div className="absolute bottom-24 left-1/2 w-[96%] -translate-x-1/2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {activeTable.players.map((playerId) => {
                          const playerState = activeGameState?.player_states?.[playerId]
                          const isTurn = activeGameState?.current_turn_user_id === playerId
                          return (
                            <div
                              className={`rounded-2xl border p-3 ${
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
                                      <p className="text-[11px] text-slate-300">
                                        Hand {handIndex + 1} | Score {hand.score} | Bet {hand.bet} |{" "}
                                        {hand.result ?? hand.status}
                                      </p>
                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {hand.cards.map((card, cardIndex) => (
                                          <PlayingCard
                                            card={card}
                                            index={cardIndex}
                                            key={`${hand.hand_id}-${card}-${cardIndex}`}
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

                    <div className="chip-stack chip-a"><span>100</span></div>
                    <div className="chip-stack chip-b"><span>25</span></div>
                    <div className="chip-stack chip-c"><span>10</span></div>
                  </div>
                </div>

                <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(event) => void onSetReady(event)}>
                  <label className="text-xs text-slate-200 sm:text-sm">
                    Ready Bet
                    <input
                      className="mt-1 w-24 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-sm text-white"
                      min={1}
                      onChange={(event) => setReadyBet(event.target.value)}
                      step="0.5"
                      type="number"
                      value={readyBet}
                    />
                  </label>
                  <button
                    className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                    disabled={!isCurrentUserParticipant || isViewingAsSpectator}
                    type="submit"
                  >
                    {isCurrentUserReady ? "Set Not Ready" : "Set Ready"}
                  </button>
                </form>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {[
                    ["hit", "Hit", "bg-emerald-300"],
                    ["stand", "Stand", "bg-cyan-300"],
                    ["double_down", "Double", "bg-amber-300"],
                    ["split", "Split", "bg-violet-300"],
                    ["insurance", "Insurance", "bg-indigo-300"],
                    ["surrender", "Surrender", "bg-rose-300"],
                  ].map(([action, label, color]) => (
                    <button
                      className={`rounded-xl ${color} px-3 py-2 text-sm font-semibold text-slate-900 disabled:opacity-45`}
                      disabled={
                        !isMyTurn ||
                        isViewingAsSpectator ||
                        !myAvailableActions.includes(action)
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

          <aside className="glass-card rounded-3xl p-4 sm:p-5">
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
                        className="rounded-md bg-gradient-to-r from-orange-300 to-rose-500 px-3 py-1 text-sm font-semibold text-slate-900"
                        onClick={() => {
                          void onJoinTable(table.id)
                        }}
                        type="button"
                      >
                        Join
                      </button>
                      <button
                        className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-sm font-semibold text-white"
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
