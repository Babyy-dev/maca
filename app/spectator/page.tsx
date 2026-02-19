"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

import {
  ApiError,
  AuthUser,
  Table,
  TableGameState,
  getMe,
  getStoredToken,
  listTables,
} from "@/lib/maca-api"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"

type RealtimeAck = {
  ok?: boolean
  error?: string
  table_id?: string | null
  mode?: "player" | "spectator"
}

type TableChatMessage = {
  id: string
  table_id: string
  user_id: string
  username: string
  message: string
  filtered?: boolean
  created_at: string
}

type TableReaction = {
  id: string
  table_id: string
  user_id: string
  username: string
  emoji: string
  created_at: string
}

function shortId(value: string | null | undefined): string {
  if (!value) return "n/a"
  return value.slice(0, 8)
}

function remainingFromDeadline(deadline: string | null | undefined): number {
  if (!deadline) return 0
  const ms = new Date(deadline).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 1000))
}

export default function SpectatorPage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [tableGameStates, setTableGameStates] = useState<Record<string, TableGameState>>({})
  const [chatByTable, setChatByTable] = useState<Record<string, TableChatMessage[]>>({})
  const [reactionsByTable, setReactionsByTable] = useState<Record<string, TableReaction[]>>({})
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [spectatorTableId, setSpectatorTableId] = useState<string | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)

  const canUseAdminTools = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  const activeTable = useMemo(
    () => tables.find((table) => table.id === activeTableId) ?? null,
    [tables, activeTableId],
  )
  const activeGameState = useMemo(
    () => (activeTableId ? tableGameStates[activeTableId] ?? null : null),
    [activeTableId, tableGameStates],
  )
  const activeChatMessages = useMemo(
    () => (activeTableId ? chatByTable[activeTableId] ?? [] : []),
    [activeTableId, chatByTable],
  )
  const activeReactions = useMemo(
    () => (activeTableId ? reactionsByTable[activeTableId] ?? [] : []),
    [activeTableId, reactionsByTable],
  )
  const activeTurnRemaining = useMemo(() => {
    void clockTick
    return remainingFromDeadline(activeGameState?.turn_deadline)
  }, [activeGameState, clockTick])

  useEffect(() => {
    const timer = setInterval(() => setClockTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [activeTableId, activeChatMessages.length])

  useEffect(() => {
    const stored = getStoredToken()
    if (!stored) {
      router.replace("/auth/login")
      return
    }
    setToken(stored)
    const authToken = stored

    async function bootstrap() {
      try {
        const [me, availableTables] = await Promise.all([getMe(authToken), listTables(authToken)])
        setUser(me)
        setTables(availableTables)
        setupSocket(authToken)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Failed to load spectator view"
        setMessage(text)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap()

    return () => {
      socketRef.current?.disconnect()
      socketRef.current = null
    }
  }, [router])

  function replaceTable(updated: Table) {
    setTables((previous) => {
      const index = previous.findIndex((table) => table.id === updated.id)
      if (index < 0) return [updated, ...previous]
      const next = [...previous]
      next[index] = updated
      return next
    })
  }

  function pushChatMessage(messageItem: TableChatMessage) {
    setChatByTable((previous) => {
      const existing = previous[messageItem.table_id] ?? []
      return { ...previous, [messageItem.table_id]: [...existing, messageItem].slice(-120) }
    })
  }

  function pushReaction(reaction: TableReaction) {
    setReactionsByTable((previous) => {
      const existing = previous[reaction.table_id] ?? []
      return { ...previous, [reaction.table_id]: [...existing, reaction].slice(-24) }
    })
  }

  async function emitRealtime(eventName: string, payload: Record<string, unknown>): Promise<RealtimeAck> {
    const socket = socketRef.current
    if (!socket || !socket.connected) {
      throw new Error("Realtime connection unavailable")
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Realtime request timeout")), 7000)
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

  function setupSocket(authToken: string) {
    const socket = io(API_BASE, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: { token: authToken },
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 700,
      reconnectionDelayMax: 2500,
    })

    socket.on("connect", () => {
      setIsRealtimeConnected(true)
      socket.emit("join_lobby", {})
    })

    socket.on("disconnect", () => {
      setIsRealtimeConnected(false)
    })

    socket.on("reconnect_attempt", () => {
      setMessage("Reconnecting to realtime server...")
    })

    socket.on("lobby_snapshot", (payload: { tables?: Table[] }) => {
      if (Array.isArray(payload.tables)) {
        setTables(payload.tables)
      }
    })

    socket.on("table_snapshot", (payload: Table) => {
      replaceTable(payload)
    })

    socket.on("table_game_state", (payload: TableGameState) => {
      if (!payload.table_id) return
      setTableGameStates((previous) => ({ ...previous, [payload.table_id]: payload }))
    })

    socket.on("table_chat_history", (payload: { table_id?: string; messages?: TableChatMessage[] }) => {
      if (!payload.table_id || !Array.isArray(payload.messages)) return
      setChatByTable((previous) => ({ ...previous, [payload.table_id!]: payload.messages! }))
    })

    socket.on("table_chat_message", (payload: TableChatMessage) => {
      if (!payload.table_id) return
      pushChatMessage(payload)
    })

    socket.on("table_reaction", (payload: TableReaction) => {
      if (!payload.table_id) return
      pushReaction(payload)
    })

    socket.on("spectator_joined", (payload: { table_id?: string; mode?: "player" | "spectator" }) => {
      if (!payload.table_id) return
      setSpectatorTableId(payload.mode === "spectator" ? payload.table_id : null)
      setActiveTableId(payload.table_id)
      setMessage(
        payload.mode === "player"
          ? `Viewing table ${payload.table_id} as player`
          : `Spectating table ${payload.table_id}`,
      )
    })

    socket.on("spectator_left", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      if (payload.table_id === spectatorTableId) {
        setSpectatorTableId(null)
        setActiveTableId(null)
      }
      setMessage(`Stopped spectating ${payload.table_id}`)
    })

    socket.on("table_closed", (payload: { table_id?: string }) => {
      const closedId = payload.table_id
      if (!closedId) return
      setTables((previous) => previous.filter((table) => table.id !== closedId))
      setTableGameStates((previous) => {
        const next = { ...previous }
        delete next[closedId]
        return next
      })
      setChatByTable((previous) => {
        const next = { ...previous }
        delete next[closedId]
        return next
      })
      setReactionsByTable((previous) => {
        const next = { ...previous }
        delete next[closedId]
        return next
      })
      if (activeTableId === closedId) {
        setActiveTableId(null)
        setSpectatorTableId(null)
      }
    })

    socketRef.current = socket
  }

  async function onRefreshTables() {
    if (!token) return
    setMessage(null)
    try {
      const data = await listTables(token)
      setTables(data)
      setMessage("Table list refreshed.")
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Unable to refresh tables"
      setMessage(text)
    }
  }

  async function onStartSpectating(tableId: string) {
    setMessage(null)
    try {
      const response = await emitRealtime("spectate_table", { table_id: tableId })
      if (response.table_id) {
        setActiveTableId(response.table_id)
        if (response.mode === "spectator") {
          setSpectatorTableId(response.table_id)
        } else {
          setSpectatorTableId(null)
        }
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to spectate"
      setMessage(text)
    }
  }

  async function onStopSpectating() {
    if (!spectatorTableId) return
    setMessage(null)
    try {
      await emitRealtime("stop_spectating", { table_id: spectatorTableId })
      setSpectatorTableId(null)
      setActiveTableId(null)
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to stop spectating"
      setMessage(text)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-200">Loading spectator view...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-5xl text-cyan-300">Spectator View</h1>
            <p className="text-sm text-slate-200">
              Read-only live table monitoring with realtime turns, chat stream, and reactions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-lg border px-3 py-2 text-xs ${
                isRealtimeConnected
                  ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                  : "border-amber-300/40 bg-amber-400/10 text-amber-200"
              }`}
            >
              {isRealtimeConnected ? "Realtime Connected" : "Realtime Offline"}
            </span>
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              onClick={() => {
                onRefreshTables().catch(() => setMessage("Refresh failed"))
              }}
              type="button"
            >
              Refresh
            </button>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/lobby"
            >
              Lobby
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/profile"
            >
              Profile
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/leaderboard"
            >
              Leaderboard
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/wallet"
            >
              Wallet
            </Link>
            {canUseAdminTools ? (
              <Link
                className="rounded-lg border border-orange-300/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200"
                href="/admin"
              >
                Admin
              </Link>
            ) : null}
          </div>
        </header>

        {message ? <p className="text-sm text-amber-200">{message}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <section className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Available Tables</h2>
            <div className="mt-3 space-y-2">
              {tables.length ? (
                tables.map((table) => {
                  const isCurrent = activeTableId === table.id
                  const isSpectating = spectatorTableId === table.id
                  return (
                    <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={table.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-white">
                          {table.name} <span className="text-slate-400">({shortId(table.id)})</span>
                        </p>
                        <p className="text-xs text-slate-300">
                          Players {table.players.length}/{table.max_players}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        Mode: {table.is_private ? "Private" : "Public"} | Spectators: {table.spectator_count ?? 0}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="rounded-md bg-cyan-300 px-3 py-1 text-xs font-semibold text-slate-900"
                          onClick={() => {
                            onStartSpectating(table.id).catch(() => setMessage("Spectate failed"))
                          }}
                          type="button"
                        >
                          {isCurrent ? "Viewing" : "Spectate"}
                        </button>
                        {isSpectating ? (
                          <button
                            className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-xs text-white"
                            onClick={() => {
                              onStopSpectating().catch(() => setMessage("Stop failed"))
                            }}
                            type="button"
                          >
                            Stop
                          </button>
                        ) : null}
                      </div>
                    </article>
                  )
                })
              ) : (
                <p className="text-sm text-slate-300">No visible tables available.</p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="glass-card rounded-2xl p-5">
              <h2 className="font-title text-3xl text-white">Live Table State</h2>
              {activeTable ? (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-slate-200">
                    Table: <span className="text-cyan-300">{activeTable.name}</span>
                  </p>
                  <p className="text-sm text-slate-200">
                    Owner: <span className="text-cyan-300">{shortId(activeTable.owner_id)}</span>
                  </p>
                  <p className="text-sm text-slate-200">
                    View mode:{" "}
                    <span className="text-amber-300">{spectatorTableId === activeTable.id ? "Spectator" : "Viewer"}</span>
                  </p>

                  {activeGameState && activeGameState.status === "active" ? (
                    <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
                      <p className="text-sm text-emerald-200">
                        Current turn: {shortId(activeGameState.current_turn_user_id)}
                      </p>
                      <p className="text-sm text-emerald-200">Time left: {activeTurnRemaining}s</p>
                      <p className="text-sm text-emerald-200">
                        Last action: {activeGameState.last_action?.action ?? "none"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300">No active hand right now.</p>
                  )}

                  <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                    <p className="text-xs text-slate-300">Participants</p>
                    <p className="mt-1 text-sm text-slate-100">
                      {activeTable.players.map((playerId) => shortId(playerId)).join(" | ") || "None"}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-300">Select a table to start spectating.</p>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="glass-card rounded-2xl p-5">
                <h2 className="font-title text-3xl text-white">Live Chat</h2>
                {activeTableId ? (
                  <div
                    className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/15 bg-black/20 p-3"
                    ref={chatScrollRef}
                  >
                    {activeChatMessages.length ? (
                      activeChatMessages.map((entry) => (
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2" key={entry.id}>
                          <p className="text-xs text-cyan-200">
                            {entry.username} • {new Date(entry.created_at).toLocaleTimeString()}
                          </p>
                          <p className="text-sm text-slate-100">{entry.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">No chat messages yet.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">Select a table to see chat.</p>
                )}
                <p className="mt-2 text-xs text-amber-200">Spectators are read-only.</p>
              </div>

              <div className="glass-card rounded-2xl p-5">
                <h2 className="font-title text-3xl text-white">Reactions</h2>
                {activeTableId ? (
                  <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-white/15 bg-black/20 p-3">
                    {activeReactions.length ? (
                      activeReactions
                        .slice()
                        .reverse()
                        .map((reaction) => (
                          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2" key={reaction.id}>
                            <p className="text-sm text-slate-100">
                              {reaction.emoji} {reaction.username}
                            </p>
                            <p className="text-xs text-slate-400">{new Date(reaction.created_at).toLocaleTimeString()}</p>
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-slate-300">No reactions yet.</p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">Select a table to see reactions.</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
