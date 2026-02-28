"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

import AuthActionButtons from "@/components/auth-action-buttons"
import {
  AdminAuditLog,
  ApiError,
  AuthUser,
  FriendRequest,
  NotificationItem,
  SocialOverview,
  Table,
  TableInvite,
  TableGameState,
  createTable,
  getSocialOverview,
  getMe,
  getStoredToken,
  joinTable,
  joinTableByCode,
  listAdminAudits,
  listNotifications,
  listTables,
  removeFriend,
  respondFriendRequest,
  respondTableInvite,
  sendFriendRequest,
  sendTableInvite,
} from "@/lib/maca-api"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"
const ACTIVE_TABLE_STORAGE_KEY = "maca_active_table_id"
const SPECTATOR_TABLE_STORAGE_KEY = "maca_spectator_table_id"

type RealtimeAck = {
  ok?: boolean
  error?: string
  table?: Table
  state?: TableGameState
  duplicate?: boolean
  table_id?: string | null
  spectator_table_id?: string | null
  mode?: "player" | "spectator"
  message?: TableChatMessage | string
  reaction?: TableReaction
  moderation?: TableModerationNotice
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

type TableModerationState = {
  table_id: string
  muted_users: Record<string, number>
  banned_users: string[]
}

type TableModerationNotice = {
  table_id: string
  action: "mute" | "unmute" | "ban" | "unban"
  target_user_id: string
  actor_user_id: string
  at: string
  details?: Record<string, unknown>
}

function createActionId(
  action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance",
): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${action}-${cryptoApi.randomUUID()}`
  }
  return `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function shortUser(userId: string | null | undefined): string {
  if (!userId) return "N/A"
  return userId.slice(0, 8)
}

function cardListText(cards: string[] | undefined): string {
  if (!cards || cards.length === 0) return "No cards"
  return cards.join(" ")
}

function remainingFromDeadline(deadline: string | null): number {
  if (!deadline) return 0
  const ms = new Date(deadline).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 1000))
}

export default function LobbyPage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tables, setTables] = useState<Table[]>([])
  const [tableGameStates, setTableGameStates] = useState<Record<string, TableGameState>>({})
  const [name, setName] = useState("Public Table")
  const [maxPlayers, setMaxPlayers] = useState(8)
  const [isPrivate, setIsPrivate] = useState(false)
  const [inviteCode, setInviteCode] = useState("")
  const [readyBet, setReadyBet] = useState("10")
  const [activeTableId, setActiveTableId] = useState<string | null>(null)
  const [spectatorTableId, setSpectatorTableId] = useState<string | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const [chatInput, setChatInput] = useState("")
  const [chatByTable, setChatByTable] = useState<Record<string, TableChatMessage[]>>({})
  const [reactionsByTable, setReactionsByTable] = useState<Record<string, TableReaction[]>>({})
  const [moderationByTable, setModerationByTable] = useState<Record<string, TableModerationState>>({})
  const [friendUsername, setFriendUsername] = useState("")
  const [inviteUsername, setInviteUsername] = useState("")
  const [socialOverview, setSocialOverview] = useState<SocialOverview | null>(null)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [adminCommand, setAdminCommand] = useState("")
  const [adminCommandResult, setAdminCommandResult] = useState<string | null>(null)
  const [adminAudits, setAdminAudits] = useState<AdminAuditLog[]>([])

  const activeTable = useMemo(
    () => tables.find((table) => table.id === activeTableId) ?? null,
    [tables, activeTableId],
  )

  const activeGameState = useMemo(
    () => (activeTableId ? tableGameStates[activeTableId] ?? null : null),
    [activeTableId, tableGameStates],
  )

  const myParticipantTableId = useMemo(() => {
    if (!user) return null
    return tables.find((table) => table.players.includes(user.id))?.id ?? null
  }, [tables, user])

  const isCurrentUserParticipant = useMemo(() => {
    if (!activeTable || !user) return false
    return activeTable.players.includes(user.id)
  }, [activeTable, user])

  const isViewingAsSpectator = useMemo(() => {
    if (!activeTableId || !spectatorTableId) return false
    return activeTableId === spectatorTableId
  }, [activeTableId, spectatorTableId])

  const isCurrentUserReady = useMemo(() => {
    if (!activeTable || !user) return false
    return Boolean(activeTable.ready_players?.includes(user.id))
  }, [activeTable, user])

  const isMyTurn = useMemo(() => {
    if (!activeGameState || !user) return false
    return (
      activeGameState.status === "active" &&
      activeGameState.current_turn_user_id === user.id
    )
  }, [activeGameState, user])

  const myAvailableActions = useMemo(() => {
    if (!isMyTurn || !activeGameState) return []
    return activeGameState.available_actions ?? []
  }, [isMyTurn, activeGameState])

  const activeTurnRemaining = useMemo(() => {
    void clockTick
    return remainingFromDeadline(activeGameState?.turn_deadline ?? null)
  }, [activeGameState, clockTick])

  const activeChatMessages = useMemo(
    () => (activeTableId ? chatByTable[activeTableId] ?? [] : []),
    [activeTableId, chatByTable],
  )

  const activeReactions = useMemo(
    () => (activeTableId ? reactionsByTable[activeTableId] ?? [] : []),
    [activeTableId, reactionsByTable],
  )

  const activeModeration = useMemo(
    () => (activeTableId ? moderationByTable[activeTableId] ?? null : null),
    [activeTableId, moderationByTable],
  )

  const isActiveTableOwner = useMemo(() => {
    if (!activeTable || !user) return false
    return activeTable.owner_id === user.id
  }, [activeTable, user])

  const canUseAdminTools = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  useEffect(() => {
    if (!chatScrollRef.current) return
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
  }, [activeTableId, activeChatMessages.length])

  useEffect(() => {
    const timer = setInterval(() => setClockTick((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!token) return
    const timer = setInterval(() => {
      refreshSocialData(token).catch(() => undefined)
      if (canUseAdminTools) {
        refreshAdminData(token).catch(() => undefined)
      }
    }, 20000)
    return () => clearInterval(timer)
  }, [token, canUseAdminTools])

  function getStoredActiveTableId(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem(ACTIVE_TABLE_STORAGE_KEY)
  }

  function getStoredSpectatorTableId(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem(SPECTATOR_TABLE_STORAGE_KEY)
  }

  function setStoredActiveTableId(tableId: string | null) {
    if (typeof window === "undefined") return
    if (tableId) {
      localStorage.setItem(ACTIVE_TABLE_STORAGE_KEY, tableId)
      return
    }
    localStorage.removeItem(ACTIVE_TABLE_STORAGE_KEY)
  }

  function setStoredSpectatorTableId(tableId: string | null) {
    if (typeof window === "undefined") return
    if (tableId) {
      localStorage.setItem(SPECTATOR_TABLE_STORAGE_KEY, tableId)
      return
    }
    localStorage.removeItem(SPECTATOR_TABLE_STORAGE_KEY)
  }

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
        const storedTableId = getStoredActiveTableId()
        const storedSpectatorTableId = getStoredSpectatorTableId()
        if (storedTableId) {
          setActiveTableId(storedTableId)
        }
        if (storedSpectatorTableId) {
          setSpectatorTableId(storedSpectatorTableId)
        }
        const [me, existingTables] = await Promise.all([
          getMe(authToken),
          listTables(authToken),
        ])
        setUser(me)
        setTables(existingTables)
        await refreshSocialData(authToken)
        if (me.role !== "player") {
          await refreshAdminData(authToken)
        }
        setupSocket(authToken)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Failed to load lobby"
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
      const existingIndex = previous.findIndex((table) => table.id === updated.id)
      if (existingIndex === -1) {
        return [updated, ...previous]
      }
      const next = [...previous]
      next[existingIndex] = updated
      return next
    })
  }

  function removeTable(tableId: string) {
    setTables((previous) => previous.filter((table) => table.id !== tableId))
  }

  function replaceGameState(state: TableGameState) {
    setTableGameStates((previous) => ({ ...previous, [state.table_id]: state }))
  }

  function removeGameState(tableId: string) {
    setTableGameStates((previous) => {
      const next = { ...previous }
      delete next[tableId]
      return next
    })
  }

  function replaceChatHistory(tableId: string, messages: TableChatMessage[]) {
    setChatByTable((previous) => ({ ...previous, [tableId]: messages }))
  }

  function pushChatMessage(messageItem: TableChatMessage) {
    setChatByTable((previous) => {
      const existing = previous[messageItem.table_id] ?? []
      const next = [...existing, messageItem].slice(-120)
      return { ...previous, [messageItem.table_id]: next }
    })
  }

  function pushReaction(reaction: TableReaction) {
    setReactionsByTable((previous) => {
      const existing = previous[reaction.table_id] ?? []
      const next = [...existing, reaction].slice(-24)
      return { ...previous, [reaction.table_id]: next }
    })
  }

  function replaceModeration(tableId: string, payload: TableModerationState) {
    setModerationByTable((previous) => ({ ...previous, [tableId]: payload }))
  }

  async function refreshSocialData(authToken: string) {
    const [overview, notificationItems] = await Promise.all([
      getSocialOverview(authToken),
      listNotifications(authToken),
    ])
    setSocialOverview(overview)
    setNotifications(notificationItems)
  }

  async function refreshAdminData(authToken: string) {
    const audits = await listAdminAudits(authToken, 60)
    setAdminAudits(audits)
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
      refreshSocialData(authToken).catch(() => undefined)
      refreshAdminData(authToken).catch(() => undefined)
      socket.emit(
        "sync_state",
        {
          preferred_table_id: activeTableId ?? getStoredActiveTableId(),
          preferred_mode: getStoredSpectatorTableId() ? "spectator" : "auto",
        },
        (response: { ok?: boolean; table_id?: string | null; spectator_table_id?: string | null }) => {
          const syncedTableId = response?.table_id ?? null
          const syncedSpectatorTableId = response?.spectator_table_id ?? null
          if (syncedTableId) {
            setActiveTableId(syncedTableId)
            setStoredActiveTableId(syncedTableId)
          }
          if (syncedSpectatorTableId) {
            setSpectatorTableId(syncedSpectatorTableId)
            setStoredSpectatorTableId(syncedSpectatorTableId)
            if (!syncedTableId) {
              setActiveTableId(syncedSpectatorTableId)
              setStoredActiveTableId(syncedSpectatorTableId)
            }
          } else {
            setSpectatorTableId(null)
            setStoredSpectatorTableId(null)
          }
        },
      )
    })

    socket.on("reconnect_attempt", () => {
      setMessage("Reconnecting to realtime server...")
    })

    socket.on("disconnect", () => {
      setIsRealtimeConnected(false)
    })

    socket.on(
      "session_restored",
      (payload: { table_id?: string | null; spectator_table_id?: string | null; recovered?: boolean }) => {
        const restoredTableId = payload.table_id ?? null
        const restoredSpectatorTableId = payload.spectator_table_id ?? null
        if (restoredTableId) {
          setActiveTableId(restoredTableId)
          setStoredActiveTableId(restoredTableId)
          if (payload.recovered) {
            setMessage(`Session restored on table ${restoredTableId}.`)
          }
        }
        if (restoredSpectatorTableId) {
          setSpectatorTableId(restoredSpectatorTableId)
          setStoredSpectatorTableId(restoredSpectatorTableId)
          if (!restoredTableId) {
            setActiveTableId(restoredSpectatorTableId)
            setStoredActiveTableId(restoredSpectatorTableId)
          }
        }
      },
    )

    socket.on("role_updated", (payload: { user_id?: string; role?: AuthUser["role"] }) => {
      if (!payload.user_id || !payload.role) return
      const nextRole = payload.role
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, role: nextRole }
      })
      if (token && (nextRole === "mod" || nextRole === "admin" || nextRole === "super")) {
        refreshAdminData(token).catch(() => undefined)
      }
      setMessage(`Role updated to ${nextRole}.`)
    })

    socket.on("balance_updated", (payload: { user_id?: string; balance?: number }) => {
      if (!payload.user_id || typeof payload.balance !== "number") return
      const nextBalance = payload.balance
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, balance: nextBalance }
      })
    })

    socket.on("admin_command_result", (payload: { ok?: boolean; message?: string }) => {
      const text = payload.message ?? "Admin command finished."
      setAdminCommandResult(payload.ok ? `Success: ${text}` : `Error: ${text}`)
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
      replaceGameState(payload)
    })

    socket.on("table_game_started", (payload: TableGameState) => {
      replaceGameState(payload)
      setMessage(`Blackjack round started for table ${payload.table_id}.`)
    })

    socket.on("table_game_ended", (payload: { table_id?: string; reason?: string }) => {
      if (!payload.table_id) return
      removeGameState(payload.table_id)
      setMessage(`Table game ended: ${payload.reason ?? "unknown reason"}`)
    })

    socket.on("table_round_resolved", (payload: TableGameState) => {
      replaceGameState(payload)
      setMessage(`Round settled on table ${payload.table_id}.`)
    })

    socket.on("table_chat_history", (payload: { table_id?: string; messages?: TableChatMessage[] }) => {
      if (!payload.table_id || !Array.isArray(payload.messages)) return
      replaceChatHistory(payload.table_id, payload.messages)
    })

    socket.on("table_chat_message", (payload: TableChatMessage) => {
      if (!payload.table_id) return
      pushChatMessage(payload)
    })

    socket.on("table_reaction", (payload: TableReaction) => {
      if (!payload.table_id) return
      pushReaction(payload)
    })

    socket.on("table_moderation_updated", (payload: TableModerationState) => {
      if (!payload.table_id) return
      replaceModeration(payload.table_id, payload)
    })

    socket.on("table_moderation_notice", (payload: TableModerationNotice) => {
      if (!payload.table_id) return
      const actionLabel = payload.action.toUpperCase()
      setMessage(
        `Moderation ${actionLabel} on ${payload.table_id} for ${shortUser(payload.target_user_id)}.`,
      )
    })

    socket.on("spectator_joined", (payload: { table_id?: string; mode?: "player" | "spectator" }) => {
      if (!payload.table_id) return
      if (payload.mode === "spectator") {
        setSpectatorTableId(payload.table_id)
        setStoredSpectatorTableId(payload.table_id)
      }
      setActiveTableId(payload.table_id)
      setStoredActiveTableId(payload.table_id)
      setMessage(
        payload.mode === "player"
          ? `Viewing table ${payload.table_id} as player.`
          : `Now spectating table ${payload.table_id}.`,
      )
    })

    socket.on("spectator_left", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      setSpectatorTableId((previous) => {
        if (previous !== payload.table_id) return previous
        setStoredSpectatorTableId(null)
        return null
      })
      setMessage(`Stopped spectating table ${payload.table_id}.`)
    })

    socket.on("player_auto_removed", (payload: { table_id?: string; user_id?: string }) => {
      if (!payload.table_id || !payload.user_id || !user) return
      if (payload.user_id === user.id) {
        setMessage("Disconnected too long. You were removed from the table.")
      }
    })

    socket.on("turn_timeout", (payload: { table_id?: string; user_id?: string }) => {
      if (!payload.table_id) return
      setMessage(
        `Turn timeout on table ${payload.table_id} (user ${shortUser(payload.user_id)} auto-stood).`,
      )
    })

    socket.on(
      "turn_action_applied",
      (payload: { table_id?: string; user_id?: string; action?: string }) => {
        if (!payload.table_id || !payload.action) return
        setMessage(
          `Action ${payload.action.toUpperCase()} applied on ${payload.table_id} by ${shortUser(
            payload.user_id,
          )}.`,
        )
      },
    )

    socket.on("table_closed", (payload: { table_id?: string }) => {
      const tableId = payload.table_id ?? ""
      if (!tableId) return
      removeTable(tableId)
      removeGameState(tableId)
      setChatByTable((previous) => {
        const next = { ...previous }
        delete next[tableId]
        return next
      })
      setReactionsByTable((previous) => {
        const next = { ...previous }
        delete next[tableId]
        return next
      })
      setModerationByTable((previous) => {
        const next = { ...previous }
        delete next[tableId]
        return next
      })
      setSpectatorTableId((previous) => {
        const next = previous === tableId ? null : previous
        if (next !== previous) {
          setStoredSpectatorTableId(next)
        }
        return next
      })
      setActiveTableId((previous) => {
        const next = previous === tableId ? null : previous
        if (next !== previous) {
          setStoredActiveTableId(next)
        }
        return next
      })
    })

    socket.on("table_joined", (payload: { table_id?: string }) => {
      if (payload.table_id) {
        setActiveTableId(payload.table_id)
        setStoredActiveTableId(payload.table_id)
        setSpectatorTableId(null)
        setStoredSpectatorTableId(null)
      }
    })

    socket.on("table_left", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      setActiveTableId((previous) => {
        const next =
          previous === payload.table_id ? getStoredSpectatorTableId() ?? null : previous
        if (next !== previous) {
          setStoredActiveTableId(next)
        }
        return next
      })
    })

    socket.on("table_ready_to_start", (payload: { table_id?: string }) => {
      if (!payload.table_id) return
      setMessage(`Table ${payload.table_id} is ready. Starting turn cycle.`)
    })

    socketRef.current = socket
  }

  async function emitRealtime(eventName: string, payload: object): Promise<RealtimeAck> {
    const socket = socketRef.current
    if (!socket || !socket.connected) {
      throw new Error("Realtime connection unavailable")
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Realtime request timed out"))
      }, 7000)

      socket.emit(eventName, payload, (response: RealtimeAck) => {
        clearTimeout(timer)
        if (response?.ok === false) {
          const fallback =
            typeof response.message === "string" ? response.message : "Realtime request failed"
          reject(new Error(response.error ?? fallback))
          return
        }
        resolve(response)
      })
    })
  }

  async function refreshTables() {
    if (!token) return
    const data = await listTables(token)
    setTables(data)
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    setMessage(null)
    try {
      if (isRealtimeConnected) {
        const response = await emitRealtime("create_table", {
          name,
          max_players: maxPlayers,
          is_private: isPrivate,
        })
        if (response.table) {
          replaceTable(response.table)
          setActiveTableId(response.table.id)
          setStoredActiveTableId(response.table.id)
          setSpectatorTableId(null)
          setStoredSpectatorTableId(null)
        }
      } else {
        const table = await createTable(token, {
          name,
          max_players: maxPlayers,
          is_private: isPrivate,
        })
        replaceTable(table)
        setActiveTableId(table.id)
        setStoredActiveTableId(table.id)
        setSpectatorTableId(null)
        setStoredSpectatorTableId(null)
      }
      setMessage("Table created.")
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to create table"
      setMessage(text)
    }
  }

  async function onJoin(tableId: string) {
    if (!token) return

    setMessage(null)
    try {
      if (isRealtimeConnected) {
        const response = await emitRealtime("join_table", { table_id: tableId })
        if (response.table) {
          replaceTable(response.table)
          setActiveTableId(response.table.id)
          setStoredActiveTableId(response.table.id)
          setSpectatorTableId(null)
          setStoredSpectatorTableId(null)
        } else {
          setActiveTableId(tableId)
          setStoredActiveTableId(tableId)
          setSpectatorTableId(null)
          setStoredSpectatorTableId(null)
        }
      } else {
        const table = await joinTable(token, tableId)
        replaceTable(table)
        setActiveTableId(table.id)
        setStoredActiveTableId(table.id)
        setSpectatorTableId(null)
        setStoredSpectatorTableId(null)
      }
      setMessage(`Joined table ${tableId}.`)
      await refreshSocialData(token)
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to join table"
      setMessage(text)
    }
  }

  async function onJoinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !inviteCode.trim()) return
    setMessage(null)

    try {
      if (isRealtimeConnected) {
        const response = await emitRealtime("join_table", { invite_code: inviteCode.trim() })
        if (response.table) {
          replaceTable(response.table)
          setActiveTableId(response.table.id)
          setStoredActiveTableId(response.table.id)
          setSpectatorTableId(null)
          setStoredSpectatorTableId(null)
          setMessage(`Joined table ${response.table.id} by code.`)
        }
      } else {
        const table = await joinTableByCode(token, inviteCode.trim())
        replaceTable(table)
        setActiveTableId(table.id)
        setStoredActiveTableId(table.id)
        setSpectatorTableId(null)
        setStoredSpectatorTableId(null)
        setMessage(`Joined table ${table.id} by code.`)
      }
      setInviteCode("")
      await refreshSocialData(token)
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Invite code join failed"
      setMessage(text)
    }
  }

  async function onLeaveTable() {
    if (!isRealtimeConnected || !activeTableId) return
    setMessage(null)
    try {
      await emitRealtime("leave_table", { table_id: activeTableId })
      const nextTableId = spectatorTableId ?? null
      setActiveTableId(nextTableId)
      setStoredActiveTableId(nextTableId)
      setMessage("Left table.")
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to leave table"
      setMessage(text)
    }
  }

  async function onSpectateTable(tableId: string) {
    if (!isRealtimeConnected) return
    setMessage(null)
    try {
      const response = await emitRealtime("spectate_table", { table_id: tableId })
      if (response.table_id) {
        setActiveTableId(response.table_id)
        setStoredActiveTableId(response.table_id)
        if (response.mode === "spectator") {
          setSpectatorTableId(response.table_id)
          setStoredSpectatorTableId(response.table_id)
        } else {
          setSpectatorTableId(null)
          setStoredSpectatorTableId(null)
        }
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to spectate table"
      setMessage(text)
    }
  }

  async function onStopSpectating() {
    if (!isRealtimeConnected || !spectatorTableId) return
    setMessage(null)
    try {
      await emitRealtime("stop_spectating", { table_id: spectatorTableId })
      setSpectatorTableId(null)
      setStoredSpectatorTableId(null)
      const nextTableId = myParticipantTableId ?? null
      setActiveTableId(nextTableId)
      setStoredActiveTableId(nextTableId)
      setMessage("Stopped spectating.")
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to stop spectating"
      setMessage(text)
    }
  }

  async function onSetReady(nextReady: boolean) {
    if (!isRealtimeConnected || !isCurrentUserParticipant) return
    setMessage(null)
    try {
      const parsedBet = Number.parseFloat(readyBet)
      const bet = Number.isFinite(parsedBet) ? parsedBet : 10
      await emitRealtime("set_ready", nextReady ? { ready: true, bet } : { ready: false })
      setMessage(nextReady ? `You are ready with ${bet.toFixed(2)} chips.` : "You are marked not ready.")
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to change ready state"
      setMessage(text)
    }
  }

  async function onTurnAction(
    action: "hit" | "stand" | "double_down" | "split" | "surrender" | "insurance",
  ) {
    if (!isRealtimeConnected) return
    setMessage(null)
    try {
      const response = await emitRealtime("take_turn_action", {
        action,
        action_id: createActionId(action),
      })
      if (response.state) {
        replaceGameState(response.state)
      }
      setMessage(`Submitted ${action.replace("_", " ").toUpperCase()} action.`)
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to submit turn action"
      setMessage(text)
    }
  }

  async function onSendChat() {
    if (
      !isRealtimeConnected ||
      !activeTableId ||
      !chatInput.trim() ||
      isViewingAsSpectator ||
      !isCurrentUserParticipant
    ) {
      return
    }
    setMessage(null)
    try {
      await emitRealtime("send_table_chat", {
        table_id: activeTableId,
        message: chatInput,
      })
      setChatInput("")
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to send chat"
      setMessage(text)
    }
  }

  async function onSendReaction(emoji: string) {
    if (
      !isRealtimeConnected ||
      !activeTableId ||
      isViewingAsSpectator ||
      !isCurrentUserParticipant
    ) {
      return
    }
    setMessage(null)
    try {
      await emitRealtime("send_table_reaction", { table_id: activeTableId, emoji })
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Unable to send reaction"
      setMessage(text)
    }
  }

  async function onModerateUser(
    targetUserId: string,
    action: "mute" | "unmute" | "ban" | "unban",
    durationSeconds?: number,
  ) {
    if (!isRealtimeConnected || !activeTableId) return
    setMessage(null)
    try {
      await emitRealtime("moderate_table_chat", {
        table_id: activeTableId,
        target_user_id: targetUserId,
        action,
        duration_seconds: durationSeconds,
      })
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Moderation action failed"
      setMessage(text)
    }
  }

  async function onSendFriendRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !friendUsername.trim()) return
    setMessage(null)
    try {
      await sendFriendRequest(token, { username: friendUsername.trim() })
      setFriendUsername("")
      await refreshSocialData(token)
      setMessage("Friend request sent.")
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to send friend request"
      setMessage(text)
    }
  }

  async function onRespondFriend(request: FriendRequest, accept: boolean) {
    if (!token) return
    setMessage(null)
    try {
      await respondFriendRequest(token, request.id, accept)
      await refreshSocialData(token)
      setMessage(accept ? "Friend request accepted." : "Friend request declined.")
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to update friend request"
      setMessage(text)
    }
  }

  async function onRemoveFriend(friendId: string) {
    if (!token) return
    setMessage(null)
    try {
      await removeFriend(token, friendId)
      await refreshSocialData(token)
      setMessage("Friend removed.")
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to remove friend"
      setMessage(text)
    }
  }

  async function onSendTableInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !activeTableId || !inviteUsername.trim() || !isCurrentUserParticipant) return
    setMessage(null)
    try {
      await sendTableInvite(token, {
        recipient_username: inviteUsername.trim(),
        table_id: activeTableId,
      })
      setInviteUsername("")
      await refreshSocialData(token)
      setMessage("Table invite sent.")
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to send table invite"
      setMessage(text)
    }
  }

  async function onRespondInvite(invite: TableInvite, accept: boolean) {
    if (!token) return
    setMessage(null)
    try {
      const response = await respondTableInvite(token, invite.id, accept)
      await refreshSocialData(token)
      if (accept) {
        setMessage(`Invite accepted for table ${response.table_id}.`)
      } else {
        setMessage("Table invite declined.")
      }
    } catch (caught) {
      const text =
        caught instanceof ApiError || caught instanceof Error
          ? caught.message
          : "Unable to update invite"
      setMessage(text)
    }
  }

  async function onRunAdminCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isRealtimeConnected || !canUseAdminTools || !adminCommand.trim()) return
    setAdminCommandResult(null)
    try {
      const result = await emitRealtime("admin_command", { command: adminCommand.trim() })
      const text = typeof result.message === "string" ? result.message : "Admin command executed."
      setAdminCommandResult(`Success: ${text}`)
      setAdminCommand("")
      if (token) {
        await refreshAdminData(token)
      }
      await refreshTables()
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Admin command failed"
      setAdminCommandResult(`Error: ${text}`)
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-cyan-300 sm:text-5xl">Lobby</h1>
            <p className="text-sm text-slate-200">
              Milestone 5 flow: role-based admin commands, audits, moderation, and economy controls.
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
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/game/single-player"
            >
              Single Player
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/game/multiplayer"
            >
              Multiplayer
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
              href="/referrals"
            >
              Referrals
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/wallet"
            >
              Wallet
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/spectator"
            >
              Spectator
            </Link>
            {canUseAdminTools ? (
              <Link
                className="rounded-lg border border-orange-300/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200"
                href="/admin"
              >
                Admin
              </Link>
            ) : null}
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/"
            >
              Landing
            </Link>
            <AuthActionButtons
              loginClassName="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200"
              logoutClassName="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
            />
          </div>
        </header>

        {isLoading ? (
          <p className="text-sm text-slate-200">Loading lobby...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <section className="glass-card rounded-2xl p-5">
              <p className="text-sm text-slate-300">
                Signed in as <span className="text-cyan-300">{user?.username}</span>
              </p>
              <p className="text-sm text-slate-300">
                Role: <span className="text-orange-300">{user?.role ?? "player"}</span>
              </p>
              <p className="text-sm text-slate-300">
                Balance:{" "}
                <span className="text-emerald-300">${user?.balance?.toFixed(2) ?? "0.00"}</span>
              </p>
              <h2 className="mt-3 font-title text-3xl text-white">Create Table</h2>

              <form className="mt-4 space-y-3" onSubmit={onCreate}>
                <label className="block text-sm text-slate-100">
                  Name
                  <input
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </label>

                <label className="block text-sm text-slate-100">
                  Max players
                  <input
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                    max={8}
                    min={2}
                    onChange={(event) => setMaxPlayers(Number(event.target.value))}
                    type="number"
                    value={maxPlayers}
                  />
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-100">
                  <input
                    checked={isPrivate}
                    onChange={(event) => setIsPrivate(event.target.checked)}
                    type="checkbox"
                  />
                  Private table
                </label>

                <button
                  className="w-full rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900"
                  type="submit"
                >
                  Create
                </button>
              </form>

              <h3 className="mt-6 text-lg font-semibold text-white">Join By Invite Code</h3>
              <form className="mt-2 space-y-2" onSubmit={onJoinByCode}>
                <input
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  onChange={(event) => setInviteCode(event.target.value)}
                  placeholder="Enter code"
                  value={inviteCode}
                />
                <button
                  className="w-full rounded-lg bg-gradient-to-r from-orange-300 to-rose-500 px-4 py-2 font-semibold text-slate-900"
                  type="submit"
                >
                  Join Code
                </button>
              </form>

              <div className="mt-6 space-y-4 rounded-xl border border-white/15 bg-white/5 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">Friends</h3>
                  <button
                    className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs text-white"
                    onClick={() => {
                      if (!token) return
                      refreshSocialData(token).catch(() => setMessage("Social refresh failed"))
                    }}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>
                <form className="space-y-2" onSubmit={onSendFriendRequest}>
                  <input
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                    onChange={(event) => setFriendUsername(event.target.value)}
                    placeholder="Username to add"
                    value={friendUsername}
                  />
                  <button
                    className="w-full rounded-lg bg-gradient-to-r from-emerald-300 to-teal-500 px-4 py-2 text-sm font-semibold text-slate-900"
                    type="submit"
                  >
                    Send Friend Request
                  </button>
                </form>
                <div className="space-y-2">
                  {socialOverview?.friends.length ? (
                    socialOverview.friends.map((friend) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2"
                        key={friend.id}
                      >
                        <span className="text-xs text-slate-100">{friend.username}</span>
                        <button
                          className="rounded-md border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                          onClick={() => {
                            onRemoveFriend(friend.id).catch(() => setMessage("Remove failed"))
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-300">No friends yet.</p>
                  )}
                </div>
              </div>

              <div className="mt-4 space-y-2 rounded-xl border border-white/15 bg-white/5 p-3">
                <h3 className="text-lg font-semibold text-white">Notifications</h3>
                {notifications.length ? (
                  notifications.slice(0, 6).map((item) => (
                    <p className="text-xs text-slate-200" key={item.id}>
                      {item.message}
                    </p>
                  ))
                ) : (
                  <p className="text-xs text-slate-300">No pending notifications.</p>
                )}
              </div>

              {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
            </section>

            <section className="space-y-4">
              <div className="glass-card rounded-2xl p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-title text-3xl text-white">Open Tables</h2>
                  <button
                    className="rounded-lg border border-white/20 bg-white/5 px-3 py-1 text-sm text-white"
                    onClick={() => {
                      refreshTables().catch(() => setMessage("Refresh failed"))
                    }}
                    type="button"
                  >
                    Refresh
                  </button>
                </div>

                <div className="space-y-3">
                  {tables.length === 0 ? (
                    <p className="text-sm text-slate-300">No visible tables yet.</p>
                  ) : (
                    tables.map((table) => (
                      <article
                        className="rounded-xl border border-white/15 bg-white/5 p-4"
                        key={table.id}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-base font-semibold text-white">{table.name}</p>
                            <p className="text-xs text-slate-300">
                              {table.players.length}/{table.max_players} players
                              {table.online_players
                                ? ` | ${table.online_players.length} online`
                                : ""}
                              {table.ready_players
                                ? ` | ${table.ready_players.length} ready`
                                : ""}
                              {typeof table.spectator_count === "number"
                                ? ` | ${table.spectator_count} watching`
                                : ""}
                            </p>
                            {table.has_active_turn ? (
                              <p className="text-xs text-emerald-300">
                                Turn active | {table.turn_remaining_seconds ?? 0}s left
                              </p>
                            ) : null}
                            {table.is_locked ? (
                              <p className="text-xs text-rose-300">Locked by admin</p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              className="rounded-md bg-gradient-to-r from-orange-300 to-rose-500 px-3 py-1 text-sm font-semibold text-slate-900"
                              onClick={() => {
                                onJoin(table.id).catch(() => setMessage("Join failed"))
                              }}
                              type="button"
                            >
                              Join
                            </button>
                            <button
                              className="rounded-md border border-white/20 bg-white/5 px-3 py-1 text-sm font-semibold text-white"
                              onClick={() => {
                                onSpectateTable(table.id).catch(() => setMessage("Spectate failed"))
                              }}
                              type="button"
                            >
                              Spectate
                            </button>
                          </div>
                        </div>
                        {table.invite_code ? (
                          <p className="mt-2 text-xs text-cyan-200">
                            Invite Code: {table.invite_code}
                          </p>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </div>

              <div className="glass-card rounded-2xl p-5">
                <h2 className="font-title text-3xl text-white">Table Room</h2>
                {activeTable ? (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-slate-200">
                      Active table: <span className="text-cyan-300">{activeTable.name}</span>
                    </p>
                    <p className="text-sm text-slate-300">
                      Players: {activeTable.players.length}/{activeTable.max_players}
                    </p>
                    <p className="text-sm text-slate-300">
                      Watching: {activeTable.spectator_count ?? 0}
                    </p>
                    <p className="text-sm text-slate-300">
                      Ready: {activeTable.ready_players?.length ?? 0}
                    </p>
                    <p className="text-sm text-slate-300">
                      Mode:{" "}
                      <span className="text-cyan-300">
                        {isViewingAsSpectator
                          ? "Spectator (read-only)"
                          : isCurrentUserParticipant
                            ? "Player"
                            : "Viewer"}
                      </span>
                    </p>
                    <p className="text-sm text-slate-300">
                      Start state:{" "}
                      <span className="text-emerald-300">
                        {activeTable.is_ready_to_start ? "Ready to start" : "Waiting players"}
                      </span>
                    </p>

                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <p className="text-sm font-semibold text-white">Players</p>
                      <div className="mt-2 space-y-2">
                        {activeTable.players.map((playerId) => {
                          const isMuted = Boolean(activeModeration?.muted_users?.[playerId])
                          const mutedFor = activeModeration?.muted_users?.[playerId] ?? 0
                          const isBanned = Boolean(activeModeration?.banned_users?.includes(playerId))
                          return (
                            <div
                              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                              key={playerId}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-slate-100">
                                  {shortUser(playerId)}
                                  {playerId === activeTable.owner_id ? " (owner)" : ""}
                                  {playerId === user?.id ? " (you)" : ""}
                                </p>
                                <p className="text-xs text-slate-300">
                                  {isBanned
                                    ? "Banned"
                                    : isMuted
                                      ? `Muted ${mutedFor}s`
                                      : "Chat active"}
                                </p>
                              </div>
                              {(isActiveTableOwner || canUseAdminTools) && playerId !== user?.id ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button
                                    className="rounded-md border border-amber-300/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200"
                                    onClick={() => {
                                      onModerateUser(playerId, isMuted ? "unmute" : "mute", 300).catch(
                                        () => setMessage("Moderation failed"),
                                      )
                                    }}
                                    type="button"
                                  >
                                    {isMuted ? "Unmute" : "Mute 5m"}
                                  </button>
                                  <button
                                    className="rounded-md border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                                    onClick={() => {
                                      onModerateUser(playerId, isBanned ? "unban" : "ban").catch(() =>
                                        setMessage("Moderation failed"),
                                      )
                                    }}
                                    type="button"
                                  >
                                    {isBanned ? "Unban" : "Ban"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {activeGameState ? (
                      <div className="space-y-3 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
                        <p className="text-sm text-emerald-200">
                          Round status: {activeGameState.status} | Phase: {activeGameState.phase ?? "unknown"}
                        </p>
                        <p className="text-sm text-emerald-200">
                          Current turn: {shortUser(activeGameState.current_turn_user_id)}
                        </p>
                        {activeGameState.status === "active" ? (
                          <p className="text-sm text-emerald-200">Time left: {activeTurnRemaining}s</p>
                        ) : null}
                        <p className="break-words text-sm text-emerald-200">
                          Dealer: {cardListText(activeGameState.dealer_cards)} | Score:{" "}
                          {activeGameState.dealer_score ?? "?"}
                        </p>
                        <p className="break-words text-sm text-emerald-200">
                          Last action: {activeGameState.last_action?.action ?? "none"}
                        </p>
                        {activeGameState.recommended_action ? (
                          <p className="text-sm text-cyan-200">
                            Strategy hint: {activeGameState.recommended_action.replace("_", " ").toUpperCase()}
                          </p>
                        ) : null}

                        <div className="grid gap-2 md:grid-cols-2">
                          {activeTable.players.map((playerId) => {
                            const playerState = activeGameState.player_states?.[playerId]
                            if (!playerState) {
                              return (
                                <div
                                  className="rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-xs text-slate-300"
                                  key={playerId}
                                >
                                  {shortUser(playerId)}: waiting
                                </div>
                              )
                            }
                            return (
                              <div
                                className="rounded-lg border border-white/15 bg-black/20 px-3 py-2"
                                key={playerId}
                              >
                                <p className="text-xs text-slate-100">
                                  {shortUser(playerId)}
                                  {playerId === user?.id ? " (you)" : ""}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  Insurance: {playerState.insurance_bet} | Insurance payout:{" "}
                                  {playerState.insurance_payout}
                                </p>
                                <div className="mt-1 space-y-1">
                                  {playerState.hands.map((hand, index) => (
                                    <p className="break-words text-xs text-slate-300" key={hand.hand_id}>
                                      H{index + 1}: {cardListText(hand.cards)} | {hand.score} | Bet {hand.bet} |{" "}
                                      {hand.result ?? hand.status}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-300">
                        No active round yet. Mark all players ready to start.
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <input
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white sm:w-32"
                        disabled={Boolean(activeGameState && activeGameState.status === "active")}
                        inputMode="decimal"
                        min="1"
                        onChange={(event) => setReadyBet(event.target.value)}
                        placeholder="Bet"
                        step="0.5"
                        type="number"
                        value={readyBet}
                      />
                      <button
                        className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900"
                        disabled={
                          Boolean(activeGameState && activeGameState.status === "active") ||
                          !isCurrentUserParticipant ||
                          isViewingAsSpectator
                        }
                        onClick={() => {
                          onSetReady(!isCurrentUserReady).catch(() => setMessage("Ready failed"))
                        }}
                        type="button"
                      >
                        {isCurrentUserReady ? "Set Not Ready" : "Set Ready"}
                      </button>
                      <button
                        className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                        onClick={() => {
                          onLeaveTable().catch(() => setMessage("Leave failed"))
                        }}
                        type="button"
                      >
                        Leave Table
                      </button>
                      <button
                        className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("hit")}
                        onClick={() => {
                          onTurnAction("hit").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Hit
                      </button>
                      <button
                        className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("stand")}
                        onClick={() => {
                          onTurnAction("stand").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Stand
                      </button>
                      <button
                        className="rounded-lg bg-fuchsia-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={
                          !isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("double_down")
                        }
                        onClick={() => {
                          onTurnAction("double_down").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Double
                      </button>
                      <button
                        className="rounded-lg bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("split")}
                        onClick={() => {
                          onTurnAction("split").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Split
                      </button>
                      <button
                        className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("insurance")}
                        onClick={() => {
                          onTurnAction("insurance").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Insurance
                      </button>
                      <button
                        className="rounded-lg bg-rose-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                        disabled={!isMyTurn || isViewingAsSpectator || !myAvailableActions.includes("surrender")}
                        onClick={() => {
                          onTurnAction("surrender").catch(() => setMessage("Turn action failed"))
                        }}
                        type="button"
                      >
                        Surrender
                      </button>
                      {isViewingAsSpectator ? (
                        <button
                          className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white"
                          onClick={() => {
                            onStopSpectating().catch(() => setMessage("Stop spectating failed"))
                          }}
                          type="button"
                        >
                          Stop Spectating
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">
                    Join or create a table to see room state and ready controls.
                  </p>
                )}
              </div>

              <div className="glass-card rounded-2xl p-5">
                <h2 className="font-title text-3xl text-white">Table Chat</h2>
                {activeTableId ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-xl border border-white/15 bg-black/20 p-3">
                      <div className="mb-2 flex flex-wrap gap-2">
                        {["\u{1F0A1}", "\u{1F3B2}", "\u{1F525}", "\u{1F44F}", "\u{1F4B0}", "\u{1F60E}"].map((emoji) => (
                          <button
                            className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-lg disabled:opacity-40"
                            disabled={isViewingAsSpectator || !isCurrentUserParticipant}
                            key={emoji}
                            onClick={() => {
                              onSendReaction(emoji).catch(() => setMessage("Reaction failed"))
                            }}
                            type="button"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                      {activeReactions.length ? (
                        <p className="text-xs text-slate-300">
                          Recent reactions:{" "}
                          {activeReactions
                            .slice(-6)
                            .map((reaction) => `${reaction.emoji} ${shortUser(reaction.user_id)}`)
                            .join(" | ")}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400">No reactions yet.</p>
                      )}
                    </div>
                    <div
                      className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/15 bg-black/20 p-3"
                      ref={chatScrollRef}
                    >
                      {activeChatMessages.length ? (
                        activeChatMessages.map((chatMessage) => (
                          <div
                            className={`rounded-lg border px-3 py-2 ${
                              chatMessage.user_id === user?.id
                                ? "border-cyan-300/35 bg-cyan-500/10"
                                : "border-white/10 bg-white/5"
                            }`}
                            key={chatMessage.id}
                          >
                            <p className="text-xs text-cyan-200">
                              {chatMessage.username} • {new Date(chatMessage.created_at).toLocaleTimeString()}
                              {chatMessage.filtered ? (
                                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                                  filtered
                                </span>
                              ) : null}
                            </p>
                            <p className="text-sm text-slate-100">{chatMessage.message}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-300">No table chat yet.</p>
                      )}
                    </div>
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(event) => {
                        event.preventDefault()
                        onSendChat().catch(() => setMessage("Chat failed"))
                      }}
                    >
                      <input
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                        disabled={isViewingAsSpectator || !isCurrentUserParticipant}
                        maxLength={240}
                        onChange={(event) => setChatInput(event.target.value)}
                        placeholder="Send message to table..."
                        value={chatInput}
                      />
                      <button
                        className="rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-40"
                        disabled={isViewingAsSpectator || !isCurrentUserParticipant}
                        type="submit"
                      >
                        Send
                      </button>
                    </form>
                    {isViewingAsSpectator || !isCurrentUserParticipant ? (
                      <p className="text-xs text-amber-200">
                        Chat is disabled while spectating or viewing.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-300">
                    Join or spectate a table to unlock chat and emoji reactions.
                  </p>
                )}
              </div>

              <div className="glass-card rounded-2xl p-5">
                <h2 className="font-title text-3xl text-white">Invites</h2>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-3">
                    <p className="text-sm font-semibold text-white">Incoming Friend Requests</p>
                    {socialOverview?.incoming_friend_requests.length ? (
                      socialOverview.incoming_friend_requests.map((request) => (
                        <div
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                          key={request.id}
                        >
                          <p className="text-xs text-slate-200">{request.sender_username}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="rounded-md bg-emerald-400 px-2 py-1 text-xs font-semibold text-slate-900"
                              onClick={() => {
                                onRespondFriend(request, true).catch(() =>
                                  setMessage("Friend response failed"),
                                )
                              }}
                              type="button"
                            >
                              Accept
                            </button>
                            <button
                              className="rounded-md border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                              onClick={() => {
                                onRespondFriend(request, false).catch(() =>
                                  setMessage("Friend response failed"),
                                )
                              }}
                              type="button"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-300">No incoming requests.</p>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/15 bg-black/20 p-3">
                    <p className="text-sm font-semibold text-white">Send Table Invite</p>
                    <form className="space-y-2" onSubmit={onSendTableInvite}>
                      <input
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                        onChange={(event) => setInviteUsername(event.target.value)}
                        placeholder="Friend username"
                        value={inviteUsername}
                      />
                      <button
                        className="w-full rounded-lg bg-gradient-to-r from-orange-300 to-rose-500 px-4 py-2 font-semibold text-slate-900"
                        disabled={!activeTableId || !isCurrentUserParticipant}
                        type="submit"
                      >
                        Invite To Active Table
                      </button>
                    </form>
                    <p className="text-xs text-slate-300">
                      Active table required to send invites.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-3">
                  <p className="text-sm font-semibold text-white">Incoming Table Invites</p>
                  <div className="mt-2 space-y-2">
                    {socialOverview?.incoming_table_invites.length ? (
                      socialOverview.incoming_table_invites.map((invite) => (
                        <div
                          className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                          key={invite.id}
                        >
                          <p className="text-xs text-slate-200">
                            {invite.sender_username} invited you to {invite.table_id}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="rounded-md bg-emerald-400 px-2 py-1 text-xs font-semibold text-slate-900"
                              onClick={() => {
                                onRespondInvite(invite, true).catch(() => setMessage("Invite failed"))
                              }}
                              type="button"
                            >
                              Accept
                            </button>
                            <button
                              className="rounded-md border border-rose-300/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200"
                              onClick={() => {
                                onRespondInvite(invite, false).catch(() => setMessage("Invite failed"))
                              }}
                              type="button"
                            >
                              Decline
                            </button>
                            <button
                              className="rounded-md border border-cyan-300/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-200"
                              onClick={() => {
                                onJoin(invite.table_id).catch(() => setMessage("Join failed"))
                              }}
                              type="button"
                            >
                              Join Table
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-300">No incoming table invites.</p>
                    )}
                  </div>
                </div>
              </div>

              {canUseAdminTools ? (
                <div className="glass-card rounded-2xl p-5">
                  <h2 className="font-title text-3xl text-white">Admin Console</h2>
                  <p className="mt-2 text-sm text-slate-300">
                    Commands: /kick /mute /unmute /ban /unban /spectate /lock_table /unlock_table
                    /end_round /close_table /add_balance /remove_balance /set_balance /set_role
                  </p>
                  <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={onRunAdminCommand}>
                    <input
                      className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                      onChange={(event) => setAdminCommand(event.target.value)}
                      placeholder="/kick user_id table_id"
                      value={adminCommand}
                    />
                    <button
                      className="rounded-lg bg-gradient-to-r from-fuchsia-300 to-orange-400 px-4 py-2 font-semibold text-slate-900"
                      type="submit"
                    >
                      Run
                    </button>
                  </form>
                  {adminCommandResult ? (
                    <p className="mt-2 text-sm text-amber-200">{adminCommandResult}</p>
                  ) : null}

                  <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">Recent Audits</p>
                      <button
                        className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs text-white"
                        onClick={() => {
                          if (!token) return
                          refreshAdminData(token).catch(() => setMessage("Admin refresh failed"))
                        }}
                        type="button"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {adminAudits.length ? (
                        adminAudits.map((audit) => (
                          <div
                            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2"
                            key={audit.id}
                          >
                            <p className="text-xs text-cyan-200">
                              {audit.actor_role.toUpperCase()} • {audit.command_text}
                            </p>
                            <p className="text-xs text-slate-200">
                              {audit.status.toUpperCase()} • {audit.message}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {new Date(audit.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-300">No audit entries yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
