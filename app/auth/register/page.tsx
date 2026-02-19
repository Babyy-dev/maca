"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useState } from "react"

import { ApiError, login, register, setStoredToken } from "@/lib/maca-api"

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [referralCode, setReferralCode] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const code = params.get("ref") || params.get("code") || ""
    if (code) {
      setReferralCode(code.toUpperCase())
    }
  }, [])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await register({
        email,
        username,
        password,
        referral_code: referralCode.trim() ? referralCode.trim().toUpperCase() : undefined,
      })
      const auth = await login({ email, password })
      setStoredToken(auth.access_token)
      router.push("/lobby")
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Registration failed"
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-slate-900/55 p-6 backdrop-blur">
        <h1 className="font-title text-5xl text-cyan-300">Create Account</h1>
        <p className="mt-2 text-sm text-slate-200">
          Milestone 1 foundation: register and initialize secure session.
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-100">
            Email
            <input
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="block text-sm text-slate-100">
            Username
            <input
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
              onChange={(event) => setUsername(event.target.value)}
              required
              type="text"
              value={username}
            />
          </label>

          <label className="block text-sm text-slate-100">
            Password
            <input
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <label className="block text-sm text-slate-100">
            Referral Code (optional)
            <input
              className="mt-1 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
              onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
              placeholder="Enter referral code"
              type="text"
              value={referralCode}
            />
          </label>

          {error ? <p className="text-sm text-rose-300">{error}</p> : null}

          <button
            className="w-full rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Creating..." : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-300">
          Already have an account?{" "}
          <Link className="text-cyan-300 hover:underline" href="/auth/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  )
}
