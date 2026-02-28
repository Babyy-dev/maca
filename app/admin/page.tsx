"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

import AuthActionButtons from "@/components/auth-action-buttons"
import {
  adjustAdminUserBalance,
  AdminAuditLog,
  AdminBalanceMode,
  AdminUser,
  ApiError,
  AuthUser,
  getMe,
  getStoredToken,
  listAdminAudits,
  listAdminUsers,
  updateAdminUserRole,
} from "@/lib/maca-api"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"

type AdminCommandAck = {
  ok?: boolean
  error?: string
  message?: string
  data?: Record<string, unknown> | null
}

function shortId(value: string): string {
  if (!value) return "n/a"
  return value.slice(0, 8)
}

export default function AdminPage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [audits, setAudits] = useState<AdminAuditLog[]>([])
  const [search, setSearch] = useState("")
  const [commandText, setCommandText] = useState("")
  const [commandResult, setCommandResult] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [roleDraftByUser, setRoleDraftByUser] = useState<Record<string, AuthUser["role"]>>({})
  const [balanceDraftByUser, setBalanceDraftByUser] = useState<Record<string, string>>({})
  const [balanceModeByUser, setBalanceModeByUser] = useState<Record<string, AdminBalanceMode>>({})

  const canAccess = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  const canAdjustBalances = useMemo(() => user?.role === "admin" || user?.role === "super", [user])
  const canSetRole = useMemo(() => user?.role === "super", [user])

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
        const me = await getMe(authToken)
        setUser(me)
        if (me.role === "player") {
          setIsLoading(false)
          return
        }

        await Promise.all([refreshUsers(authToken, ""), refreshAudits(authToken)])
        setupSocket(authToken)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Failed to load admin page"
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
    })

    socket.on("disconnect", () => {
      setIsRealtimeConnected(false)
    })

    socket.on("admin_command_result", (payload: { ok?: boolean; message?: string }) => {
      const text = payload.message ?? "Command completed."
      setCommandResult(payload.ok ? `Success: ${text}` : `Error: ${text}`)
      if (token) {
        refreshAudits(token).catch(() => undefined)
        refreshUsers(token, search).catch(() => undefined)
      }
    })

    socket.on("role_updated", (payload: { user_id?: string; role?: AuthUser["role"] }) => {
      if (!payload.user_id || !payload.role) return
      const nextRole = payload.role
      setUsers((previous) =>
        previous.map((entry) =>
          entry.id === payload.user_id ? { ...entry, role: nextRole } : entry,
        ),
      )
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, role: nextRole }
      })
    })

    socket.on("balance_updated", (payload: { user_id?: string; balance?: number }) => {
      if (!payload.user_id || typeof payload.balance !== "number") return
      const nextBalance = payload.balance
      setUsers((previous) =>
        previous.map((entry) =>
          entry.id === payload.user_id ? { ...entry, balance: nextBalance } : entry,
        ),
      )
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, balance: nextBalance }
      })
    })

    socketRef.current = socket
  }

  async function emitAdminCommand(command: string): Promise<AdminCommandAck> {
    const socket = socketRef.current
    if (!socket || !socket.connected) {
      throw new Error("Realtime admin connection unavailable")
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Admin command timed out")), 7000)
      socket.emit("admin_command", { command }, (response: AdminCommandAck) => {
        clearTimeout(timer)
        if (response?.ok === false) {
          reject(new Error(response.message ?? response.error ?? "Admin command failed"))
          return
        }
        resolve(response)
      })
    })
  }

  async function refreshUsers(authToken: string, searchValue: string) {
    const response = await listAdminUsers(authToken, { search: searchValue, limit: 120 })
    setUsers(response)
  }

  async function refreshAudits(authToken: string) {
    const response = await listAdminAudits(authToken, 120)
    setAudits(response)
  }

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setMessage(null)
    try {
      await refreshUsers(token, search.trim())
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "User search failed"
      setMessage(text)
    }
  }

  async function onApplyRole(target: AdminUser) {
    if (!token || !canSetRole) return
    const nextRole = roleDraftByUser[target.id] ?? (target.role as AuthUser["role"])
    setMessage(null)
    try {
      const updated = await updateAdminUserRole(token, target.id, nextRole)
      setUsers((previous) =>
        previous.map((entry) => (entry.id === updated.id ? { ...entry, role: updated.role } : entry)),
      )
      await refreshAudits(token)
      setMessage(`Role updated for ${target.username}.`)
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Role update failed"
      setMessage(text)
    }
  }

  async function onApplyBalance(target: AdminUser) {
    if (!token || !canAdjustBalances) return
    const rawAmount = balanceDraftByUser[target.id] ?? ""
    const mode = balanceModeByUser[target.id] ?? "add"
    const amount = Number(rawAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage("Enter a valid amount.")
      return
    }
    if (mode === "set" && !canSetRole) {
      setMessage("Only super role can set balance directly.")
      return
    }

    setMessage(null)
    try {
      const updated = await adjustAdminUserBalance(token, target.id, { amount, mode })
      setUsers((previous) =>
        previous.map((entry) => (entry.id === updated.id ? { ...entry, balance: updated.balance } : entry)),
      )
      setBalanceDraftByUser((previous) => ({ ...previous, [target.id]: "" }))
      await refreshAudits(token)
      setMessage(`Balance updated for ${target.username}.`)
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Balance update failed"
      setMessage(text)
    }
  }

  async function onRunCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!commandText.trim()) return
    setCommandResult(null)
    try {
      const result = await emitAdminCommand(commandText.trim())
      const text = result.message ?? "Admin command executed."
      setCommandResult(`Success: ${text}`)
      setCommandText("")
      if (token) {
        await Promise.all([refreshAudits(token), refreshUsers(token, search.trim())])
      }
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : "Admin command failed"
      setCommandResult(`Error: ${text}`)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-200">Loading admin panel...</p>
        </div>
      </main>
    )
  }

  if (!canAccess) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-white/15 bg-slate-900/55 p-6 backdrop-blur">
          <h1 className="font-title text-3xl text-rose-300 sm:text-5xl">Admin Access Required</h1>
          <p className="mt-2 text-sm text-slate-200">
            Current role is <span className="text-orange-300">{user?.role ?? "player"}</span>. This page
            requires at least `mod` role.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/lobby"
            >
              Back To Lobby
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/"
            >
              Landing
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-orange-300 sm:text-5xl">Admin Control</h1>
            <p className="text-sm text-slate-200">Milestone 5 dashboard: commands, audits, and role controls.</p>
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
            <span className="rounded-lg border border-orange-300/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
              Role: {user?.role}
            </span>
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

        {message ? <p className="text-sm text-amber-200">{message}</p> : null}

        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="glass-card rounded-2xl p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-title text-3xl text-white">Users</h2>
              <form className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" onSubmit={onSearch}>
                <input
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search username"
                  value={search}
                />
                <button
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  type="submit"
                >
                  Search
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {users.length === 0 ? (
                <p className="text-sm text-slate-300">No users found.</p>
              ) : (
                users.map((entry) => {
                  const roleDraft = roleDraftByUser[entry.id] ?? (entry.role as AuthUser["role"])
                  const balanceMode = balanceModeByUser[entry.id] ?? "add"
                  const canSetMode = balanceMode !== "set" || canSetRole
                  return (
                    <article className="rounded-xl border border-white/15 bg-white/5 p-4" key={entry.id}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-white">
                          {entry.username} <span className="text-slate-400">({shortId(entry.id)})</span>
                        </p>
                        <p className="text-xs text-slate-300">Balance: ${entry.balance.toFixed(2)}</p>
                      </div>

                      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto]">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                            disabled={!canSetRole}
                            onChange={(event) =>
                              setRoleDraftByUser((previous) => ({
                                ...previous,
                                [entry.id]: event.target.value as AuthUser["role"],
                              }))
                            }
                            value={roleDraft}
                          >
                            <option value="player">player</option>
                            <option value="mod">mod</option>
                            <option value="admin">admin</option>
                            <option value="super">super</option>
                          </select>
                          <button
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                            disabled={!canSetRole}
                            onClick={() => {
                              onApplyRole(entry).catch(() => setMessage("Role update failed"))
                            }}
                            type="button"
                          >
                            Set Role
                          </button>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white sm:w-28"
                            onChange={(event) =>
                              setBalanceDraftByUser((previous) => ({
                                ...previous,
                                [entry.id]: event.target.value,
                              }))
                            }
                            placeholder="Amount"
                            type="number"
                            value={balanceDraftByUser[entry.id] ?? ""}
                          />
                          <select
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                            disabled={!canAdjustBalances}
                            onChange={(event) =>
                              setBalanceModeByUser((previous) => ({
                                ...previous,
                                [entry.id]: event.target.value as AdminBalanceMode,
                              }))
                            }
                            value={balanceMode}
                          >
                            <option value="add">add</option>
                            <option value="remove">remove</option>
                            <option value="set">set</option>
                          </select>
                          <button
                            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-50"
                            disabled={!canAdjustBalances || !canSetMode}
                            onClick={() => {
                              onApplyBalance(entry).catch(() => setMessage("Balance update failed"))
                            }}
                            type="button"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="glass-card rounded-2xl p-5">
              <h2 className="font-title text-3xl text-white">Command Console</h2>
              <p className="mt-2 text-sm text-slate-300">
                Realtime commands: /kick /mute /ban /spectate /lock_table /unlock_table /end_round /close_table
                /add_balance /remove_balance /set_balance /set_role
              </p>
              <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={onRunCommand}>
                <input
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                  onChange={(event) => setCommandText(event.target.value)}
                  placeholder="/kick username table_id"
                  value={commandText}
                />
                <button
                  className="rounded-lg bg-gradient-to-r from-orange-300 to-rose-500 px-4 py-2 font-semibold text-slate-900"
                  type="submit"
                >
                  Run
                </button>
              </form>
              {commandResult ? <p className="mt-2 text-sm text-amber-200">{commandResult}</p> : null}
            </div>

            <div className="glass-card rounded-2xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-title text-3xl text-white">Audit Logs</h2>
                <button
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                  onClick={() => {
                    if (!token) return
                    refreshAudits(token).catch(() => setMessage("Audit refresh failed"))
                  }}
                  type="button"
                >
                  Refresh
                </button>
              </div>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto">
                {audits.length === 0 ? (
                  <p className="text-sm text-slate-300">No audit entries yet.</p>
                ) : (
                  audits.map((audit) => (
                    <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={audit.id}>
                      <p className="text-xs text-cyan-200">
                        {audit.actor_role.toUpperCase()} {shortId(audit.actor_user_id)}
                      </p>
                      <p className="text-sm text-white">{audit.command_text}</p>
                      <p className="text-xs text-slate-200">
                        {audit.status.toUpperCase()} | {audit.message}
                      </p>
                      <p className="text-[11px] text-slate-400">{new Date(audit.created_at).toLocaleString()}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
