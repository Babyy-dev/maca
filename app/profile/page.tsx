"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import {
  ApiError,
  AuthUser,
  getMyStats,
  getMe,
  getStoredToken,
  UserStats,
  updateProfile,
} from "@/lib/maca-api"

export default function ProfilePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<AuthUser | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState("")
  const [bio, setBio] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const stored = getStoredToken()
    if (!stored) {
      router.replace("/auth/login")
      return
    }
    setToken(stored)
    const authToken = stored

    async function loadProfile() {
      try {
        const [me, myStats] = await Promise.all([getMe(authToken), getMyStats(authToken)])
        setProfile(me)
        setStats(myStats)
        setDisplayName(me.display_name ?? "")
        setAvatarUrl(me.avatar_url ?? "")
        setBio(me.bio ?? "")
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Unable to load profile"
        setMessage(text)
      }
    }

    loadProfile()
  }, [router])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setIsSubmitting(true)
    setMessage(null)

    try {
      const updated = await updateProfile(token, {
        display_name: displayName || undefined,
        avatar_url: avatarUrl || undefined,
        bio: bio || undefined,
      })
      setProfile(updated)
      setMessage("Profile updated.")
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Unable to update profile"
      setMessage(text)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-emerald-300 sm:text-5xl">Profile</h1>
            <p className="text-sm text-slate-200">
              Milestone 1 profile foundation with persistent editable fields.
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
            {profile && (profile.role === "mod" || profile.role === "admin" || profile.role === "super") ? (
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

        <section className="glass-card rounded-2xl p-6">
          <p className="text-sm text-slate-300">
            Account: <span className="text-cyan-300">{profile?.email ?? "..."}</span>
          </p>
          <p className="text-sm text-slate-300">
            Username: <span className="text-cyan-300">{profile?.username ?? "..."}</span>
          </p>
          <p className="text-sm text-slate-300">
            Balance:{" "}
            <span className="text-emerald-300">${profile ? profile.balance.toFixed(2) : "..."}</span>
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {[
              { label: "All-Time", data: stats?.all_time },
              { label: "Weekly", data: stats?.weekly },
              { label: "Monthly", data: stats?.monthly },
            ].map((card) => (
              <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={card.label}>
                <p className="text-sm text-cyan-300">{card.label}</p>
                <p className="text-xs text-slate-200">Games: {card.data?.total_games ?? 0}</p>
                <p className="text-xs text-emerald-300">Wins: {card.data?.wins ?? 0}</p>
                <p className="text-xs text-rose-300">Losses: {card.data?.losses ?? 0}</p>
                <p className="text-xs text-amber-300">Blackjacks: {card.data?.blackjacks ?? 0}</p>
                <p className="text-xs text-slate-200">Win Rate: {(card.data?.win_rate ?? 0).toFixed(2)}%</p>
              </article>
            ))}
          </div>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm text-slate-100">
              Display name
              <input
                className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>

            <label className="block text-sm text-slate-100">
              Avatar URL
              <input
                className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                onChange={(event) => setAvatarUrl(event.target.value)}
                value={avatarUrl}
              />
            </label>

            <label className="block text-sm text-slate-100">
              Bio
              <textarea
                className="mt-1 min-h-28 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                onChange={(event) => setBio(event.target.value)}
                value={bio}
              />
            </label>

            <button
              className="rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Saving..." : "Save changes"}
            </button>
          </form>

          {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}
        </section>
      </div>
    </main>
  )
}
