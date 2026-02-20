"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useState } from "react"

import {
  ApiError,
  AuthUser,
  RoundLog,
  SinglePlayerRound,
  getMe,
  getStoredToken,
  hitSinglePlayerRound,
  listSinglePlayerHistory,
  startSinglePlayerRound,
  standSinglePlayerRound,
} from "@/lib/maca-api"

const SUIT_MAP: Record<string, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
}

function cardToView(card: string): { rank: string; suit: string; isRed: boolean } {
  if (card === "??") {
    return { rank: "?", suit: "?", isRed: false }
  }
  const suit = card.slice(-1)
  const rank = card.slice(0, -1)
  return {
    rank,
    suit: SUIT_MAP[suit] ?? suit,
    isRed: suit === "H" || suit === "D",
  }
}

function formatMoney(value: number): string {
  return Number(value).toFixed(2)
}

function createActionId(action: "hit" | "stand"): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${action}-${cryptoApi.randomUUID()}`
  }
  return `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function PlayingCard({ card }: { card: string }) {
  const parsed = cardToView(card)
  return (
    <div
      className={`w-16 rounded-lg border px-2 py-2 shadow sm:w-20 ${
        card === "??"
          ? "border-white/30 bg-slate-800/80 text-slate-200"
          : "border-slate-300 bg-white"
      }`}
    >
      <p className={`text-sm font-semibold ${parsed.isRed ? "text-rose-600" : "text-slate-900"}`}>
        {parsed.rank}
      </p>
      <p className={`text-center text-2xl ${parsed.isRed ? "text-rose-600" : "text-slate-900"}`}>
        {parsed.suit}
      </p>
    </div>
  )
}

export default function SinglePlayerGamePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [round, setRound] = useState<SinglePlayerRound | null>(null)
  const [history, setHistory] = useState<RoundLog[]>([])
  const [bet, setBet] = useState("25")
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const [me, recentHistory] = await Promise.all([
          getMe(authToken),
          listSinglePlayerHistory(authToken, 10),
        ])
        setUser(me)
        setHistory(recentHistory)
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : "Failed to load game"
        setError(message)
      } finally {
        setIsBootstrapping(false)
      }
    }

    bootstrap()
  }, [router])

  const isRoundActive = useMemo(() => round?.status === "player_turn", [round])

  async function refreshUser(authToken: string) {
    const me = await getMe(authToken)
    setUser(me)
  }

  async function refreshHistory(authToken: string) {
    const recentHistory = await listSinglePlayerHistory(authToken, 10)
    setHistory(recentHistory)
  }

  async function onStartRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    const parsedBet = Number(bet)
    if (!Number.isFinite(parsedBet) || parsedBet <= 0) {
      setError("Bet must be a positive number.")
      return
    }

    setIsWorking(true)
    setError(null)
    try {
      const started = await startSinglePlayerRound(token, { bet: parsedBet })
      setRound(started)
      if (started.status === "completed") {
        await Promise.all([refreshHistory(token), refreshUser(token)])
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Could not start round"
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  async function onHit() {
    if (!token || !round) return
    setIsWorking(true)
    setError(null)

    try {
      const next = await hitSinglePlayerRound(token, round.round_id, createActionId("hit"))
      setRound(next)
      if (next.status === "completed") {
        await Promise.all([refreshHistory(token), refreshUser(token)])
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Hit failed"
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  async function onStand() {
    if (!token || !round) return
    setIsWorking(true)
    setError(null)

    try {
      const next = await standSinglePlayerRound(
        token,
        round.round_id,
        createActionId("stand"),
      )
      setRound(next)
      if (next.status === "completed") {
        await Promise.all([refreshHistory(token), refreshUser(token)])
      }
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Stand failed"
      setError(message)
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-emerald-300 sm:text-5xl">Single-Player Blackjack</h1>
            <p className="text-sm text-slate-200">
              Milestone 2: secure round engine, dealer logic, result settlement, and logging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
          </div>
        </header>

        {isBootstrapping ? (
          <p className="text-sm text-slate-200">Loading game...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="glass-card rounded-2xl p-5">
              <p className="text-sm text-slate-300">
                Player: <span className="text-cyan-300">{user?.username ?? "Unknown"}</span>
              </p>
              <p className="text-sm text-slate-300">
                Balance:{" "}
                <span className="text-emerald-300">${formatMoney(user?.balance ?? 0)}</span>
              </p>

              <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={onStartRound}>
                <label className="w-full max-w-[220px] text-sm text-slate-100">
                  Bet
                  <input
                    className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                    disabled={isWorking || isRoundActive}
                    min={1}
                    onChange={(event) => setBet(event.target.value)}
                    step="0.01"
                    type="number"
                    value={bet}
                  />
                </label>
                <button
                  className="rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
                  disabled={isWorking || isRoundActive}
                  type="submit"
                >
                  {isWorking ? "Working..." : "Deal New Round"}
                </button>
              </form>

              {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

              <div className="mt-6 space-y-5">
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">Dealer</h2>
                    <p className="text-sm text-slate-300">
                      Score: {round?.dealer_score ?? "Hidden"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {round?.dealer_cards?.length ? (
                      round.dealer_cards.map((card, index) => (
                        <PlayingCard card={card} key={`dealer-${card}-${index}`} />
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">No cards yet.</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">Player</h2>
                    <p className="text-sm text-slate-300">Score: {round?.player_score ?? "-"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {round?.player_cards?.length ? (
                      round.player_cards.map((card, index) => (
                        <PlayingCard card={card} key={`player-${card}-${index}`} />
                      ))
                    ) : (
                      <p className="text-sm text-slate-300">No cards yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                  disabled={!round?.can_hit || isWorking}
                  onClick={() => {
                    onHit().catch(() => setError("Hit failed"))
                  }}
                  type="button"
                >
                  Hit
                </button>
                <button
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                  disabled={!round?.can_stand || isWorking}
                  onClick={() => {
                    onStand().catch(() => setError("Stand failed"))
                  }}
                  type="button"
                >
                  Stand
                </button>
              </div>

              {round ? (
                <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
                  <p className="text-sm text-slate-200">Status: {round.status}</p>
                  <p className="text-sm text-slate-200">Bet: ${formatMoney(round.bet)}</p>
                  <p className="text-sm text-slate-200">
                    Result: {round.result ?? "-"} {round.payout !== null ? `(${formatMoney(round.payout)})` : ""}
                  </p>
                  <p className="text-sm text-cyan-200">{round.message ?? ""}</p>
                </div>
              ) : null}
            </section>

            <section className="glass-card rounded-2xl p-5">
              <h2 className="font-title text-3xl text-white">Round History</h2>
              <p className="mt-1 text-sm text-slate-300">Last 10 completed rounds.</p>

              <div className="mt-4 space-y-2">
                {history.length === 0 ? (
                  <p className="text-sm text-slate-300">No rounds logged yet.</p>
                ) : (
                  history.map((item) => (
                    <article className="rounded-lg border border-white/15 bg-white/5 p-3" key={item.id}>
                      <p className="text-sm text-white">
                        {item.result.toUpperCase()} | Bet ${formatMoney(item.bet)} | Payout{" "}
                        {item.payout >= 0 ? "+" : ""}
                        {formatMoney(item.payout)}
                      </p>
                      <p className="text-xs text-slate-300">
                        Player {item.player_score} vs Dealer {item.dealer_score}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
