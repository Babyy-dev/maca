"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

import AuthActionButtons from "@/components/auth-action-buttons"
import {
  ApiError,
  AuthUser,
  getFriendsLeaderboard,
  getGlobalLeaderboard,
  getMe,
  getMyStats,
  getStoredToken,
  LeaderboardResponse,
  LeaderboardSort,
  StatsPeriod,
  UserStats,
} from "@/lib/maca-api"

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"

function shortId(value: string): string {
  if (!value) return "n/a"
  return value.slice(0, 8)
}

export default function LeaderboardPage() {
  const router = useRouter()
  const socketRef = useRef<Socket | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null)
  const [period, setPeriod] = useState<StatsPeriod>("all")
  const [sortBy, setSortBy] = useState<LeaderboardSort>("win_rate")
  const [scope, setScope] = useState<"global" | "friends">("global")
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const canUseAdminTools = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  async function loadBoard(authToken: string): Promise<LeaderboardResponse> {
    if (scope === "global") {
      return getGlobalLeaderboard(authToken, { period, sort_by: sortBy, limit: 50 })
    }
    return getFriendsLeaderboard(authToken, { period, sort_by: sortBy, limit: 50 })
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
        const [me, myStats] = await Promise.all([getMe(authToken), getMyStats(authToken)])
        setUser(me)
        setStats(myStats)
        const board = await getGlobalLeaderboard(authToken, {
          period: "all",
          sort_by: "win_rate",
          limit: 50,
        })
        setLeaderboard(board)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Unable to load leaderboard"
        setMessage(text)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap()
  }, [router])

  useEffect(() => {
    if (!token || isLoading) return
    setIsRefreshing(true)
    loadBoard(token)
      .then((board) => {
        setLeaderboard(board)
      })
      .catch((caught) => {
        const text = caught instanceof ApiError ? caught.message : "Unable to refresh leaderboard"
        setMessage(text)
      })
      .finally(() => {
        setIsRefreshing(false)
      })
  }, [token, period, sortBy, scope, isLoading])

  useEffect(() => {
    if (!token || isLoading) return
    const authToken = token
    const timer = setInterval(() => {
      loadBoard(authToken)
        .then((board) => {
          setLeaderboard(board)
        })
        .catch(() => undefined)
    }, 20000)
    return () => clearInterval(timer)
  }, [token, isLoading, period, sortBy, scope])

  useEffect(() => {
    if (!token) return
    const authToken = token
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

    socket.on("role_updated", (payload: { user_id?: string; role?: AuthUser["role"] }) => {
      if (!payload.user_id || !payload.role) return
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, role: payload.role! }
      })
    })

    socket.on("balance_updated", (payload: { user_id?: string; balance?: number }) => {
      if (!payload.user_id || typeof payload.balance !== "number") return
      const nextBalance = payload.balance
      setUser((previous) => {
        if (!previous || previous.id !== payload.user_id) return previous
        return { ...previous, balance: nextBalance }
      })
      setStats((previous) => {
        if (!previous || previous.user_id !== payload.user_id) return previous
        return {
          ...previous,
          all_time: { ...previous.all_time, balance: nextBalance },
          weekly: { ...previous.weekly, balance: nextBalance },
          monthly: { ...previous.monthly, balance: nextBalance },
        }
      })
      setLeaderboard((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          entries: previous.entries.map((entry) =>
            entry.user_id === payload.user_id ? { ...entry, balance: nextBalance } : entry,
          ),
        }
      })
    })

    socketRef.current = socket
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [token])

  async function refreshAll() {
    if (!token) return
    setMessage(null)
    setIsRefreshing(true)
    try {
      const [myStats, board] = await Promise.all([getMyStats(token), loadBoard(token)])
      setStats(myStats)
      setLeaderboard(board)
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Refresh failed"
      setMessage(text)
    } finally {
      setIsRefreshing(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-200">Loading leaderboard...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-amber-300 sm:text-5xl">Leaderboards</h1>
            <p className="text-sm text-slate-200">
              Realtime leaderboard view with global/friends scope and automatic refresh.
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
            <span className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
              Auto-refresh 20s
            </span>
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={isRefreshing}
              onClick={() => {
                refreshAll().catch(() => setMessage("Refresh failed"))
              }}
              type="button"
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
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

        {message ? <p className="text-sm text-amber-200">{message}</p> : null}

        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-title text-3xl text-white">Your Stat Cards</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {[
              { label: "All-Time", data: stats?.all_time },
              { label: "Weekly", data: stats?.weekly },
              { label: "Monthly", data: stats?.monthly },
            ].map((card) => (
              <article className="rounded-xl border border-white/15 bg-white/5 p-4" key={card.label}>
                <p className="text-sm text-cyan-300">{card.label}</p>
                <p className="mt-1 text-sm text-slate-200">Games: {card.data?.total_games ?? 0}</p>
                <p className="text-sm text-emerald-300">Wins: {card.data?.wins ?? 0}</p>
                <p className="text-sm text-rose-300">Losses: {card.data?.losses ?? 0}</p>
                <p className="text-sm text-amber-300">Blackjacks: {card.data?.blackjacks ?? 0}</p>
                <p className="text-sm text-slate-200">Win Rate: {(card.data?.win_rate ?? 0).toFixed(2)}%</p>
              </article>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-title text-3xl text-white">Ranking Board</h2>
            <div className="flex flex-wrap gap-2">
              <select
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setScope(event.target.value as "global" | "friends")}
                value={scope}
              >
                <option value="global">Global</option>
                <option value="friends">Friends</option>
              </select>
              <select
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setPeriod(event.target.value as StatsPeriod)}
                value={period}
              >
                <option value="all">All-Time</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <select
                className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setSortBy(event.target.value as LeaderboardSort)}
                value={sortBy}
              >
                <option value="win_rate">Sort: Win Rate</option>
                <option value="balance">Sort: Balance</option>
                <option value="games">Sort: Games</option>
                <option value="blackjacks">Sort: Blackjacks</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {leaderboard?.entries.length ? (
              leaderboard.entries.map((entry) => (
                <article className="rounded-xl border border-white/15 bg-white/5 p-4" key={entry.user_id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">
                      #{entry.rank} {entry.display_name || entry.username}{" "}
                      <span className="text-slate-400">({shortId(entry.user_id)})</span>
                    </p>
                    <p className="text-sm text-emerald-300">${entry.balance.toFixed(2)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-200">
                    Games: {entry.total_games} | Wins: {entry.wins} | Losses: {entry.losses} | Pushes:{" "}
                    {entry.pushes} | Blackjacks: {entry.blackjacks} | Win Rate: {entry.win_rate.toFixed(2)}%
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">No leaderboard entries available yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
