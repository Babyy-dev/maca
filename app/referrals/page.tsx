"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { ApiError, AuthUser, getMe, getReferralDashboard, getStoredToken, ReferralDashboard } from "@/lib/maca-api"

export default function ReferralsPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")

  const referralLink = useMemo(() => {
    if (!dashboard?.referral_code) return ""
    const base = origin || "http://localhost:3000"
    return `${base.replace(/\/+$/, "")}/auth/register?ref=${dashboard.referral_code}`
  }, [dashboard, origin])

  const canUseAdminTools = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])

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
        const [me, data] = await Promise.all([getMe(authToken), getReferralDashboard(authToken)])
        setUser(me)
        setDashboard(data)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Unable to load referral dashboard"
        setMessage(text)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap()
  }, [router])

  async function refreshDashboard() {
    if (!token) return
    setMessage(null)
    try {
      const data = await getReferralDashboard(token)
      setDashboard(data)
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Refresh failed"
      setMessage(text)
    }
  }

  async function copyCodeOrLink(value: string, label: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setMessage(`${label} copied.`)
    } catch {
      setMessage(`Unable to copy ${label.toLowerCase()}.`)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-200">Loading referral dashboard...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-5xl text-cyan-300">Referral Dashboard</h1>
            <p className="text-sm text-slate-200">
              Milestone 7: share referral code, track rewards, and monitor invited users.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              onClick={() => {
                refreshDashboard().catch(() => setMessage("Refresh failed"))
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
          </div>
        </header>

        {message ? <p className="text-sm text-amber-200">{message}</p> : null}

        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-title text-3xl text-white">Your Referral Code</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Code</p>
              <p className="font-mono text-2xl text-emerald-300">{dashboard?.referral_code ?? "N/A"}</p>
            </div>
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-white"
              onClick={() => {
                copyCodeOrLink(dashboard?.referral_code ?? "", "Referral code").catch(() =>
                  setMessage("Copy failed"),
                )
              }}
              type="button"
            >
              Copy Code
            </button>
            <button
              className="rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200"
              onClick={() => {
                copyCodeOrLink(referralLink, "Referral link").catch(() => setMessage("Copy failed"))
              }}
              type="button"
            >
              Copy Link
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-300 break-all">{referralLink}</p>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-title text-3xl text-white">Bonus Summary</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <article className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Total Referrals</p>
              <p className="text-2xl text-cyan-300">{dashboard?.total_referrals ?? 0}</p>
            </article>
            <article className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Your Earned Bonus</p>
              <p className="text-2xl text-emerald-300">${(dashboard?.total_bonus_earned ?? 0).toFixed(2)}</p>
            </article>
            <article className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Bonus Given To Invites</p>
              <p className="text-2xl text-amber-300">
                ${(dashboard?.total_bonus_given_to_friends ?? 0).toFixed(2)}
              </p>
            </article>
            <article className="rounded-xl border border-white/15 bg-white/5 p-4">
              <p className="text-xs text-slate-300">Your Signup Referral Bonus</p>
              <p className="text-2xl text-fuchsia-300">
                ${(dashboard?.total_new_user_bonus_received ?? 0).toFixed(2)}
              </p>
            </article>
          </div>
          <p className="mt-3 text-sm text-slate-300">
            Current reward config: you earn ${(dashboard?.referrer_bonus_amount ?? 0).toFixed(2)} per referral,
            new user gets ${(dashboard?.new_user_bonus_amount ?? 0).toFixed(2)}.
          </p>
          {dashboard?.referred_by_username ? (
            <p className="mt-1 text-sm text-slate-300">
              You were referred by <span className="text-cyan-300">{dashboard.referred_by_username}</span>.
            </p>
          ) : null}
        </section>

        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-title text-3xl text-white">Referred Users</h2>
          <div className="mt-3 space-y-2">
            {dashboard?.referrals.length ? (
              dashboard.referrals.map((entry) => (
                <article className="rounded-xl border border-white/15 bg-white/5 p-4" key={entry.referral_id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">
                      {entry.referred_display_name || entry.referred_username}{" "}
                      <span className="text-slate-400">({entry.referred_username})</span>
                    </p>
                    <p className="text-xs text-slate-300">{new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-200">
                    Referrer bonus: ${entry.referrer_bonus.toFixed(2)} | New user bonus: $
                    {entry.new_user_bonus.toFixed(2)} | User ID: {entry.referred_user_id}
                  </p>
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">
                No completed referrals yet. Share your code to start earning bonuses.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
