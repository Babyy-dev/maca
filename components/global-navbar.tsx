"use client"

import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/lobby", label: "Lobby" },
  { href: "/game/single-player", label: "Single" },
  { href: "/game/multiplayer", label: "Multi" },
]

export default function GlobalNavbar() {
  const pathname = usePathname()
  const router = useRouter()

  const onBack = (): void => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push("/")
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/15 bg-slate-950/70 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <button
          aria-label="Go back"
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-2.5 text-xs font-semibold text-white transition hover:bg-white/10 sm:text-sm"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <Link
          className="font-title text-xl tracking-wide text-amber-300 sm:text-2xl"
          href="/"
        >
          MACA
        </Link>

        <nav className="hidden items-center gap-2 sm:flex">
          {LINKS.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname?.startsWith(link.href))
            return (
              <Link
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-cyan-400/20 text-cyan-200"
                    : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                }`}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            )
          })}
          <Link
            className="rounded-lg bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:brightness-105"
            href="/auth/register"
          >
            Start Now
          </Link>
        </nav>

        <Link
          className="inline-flex min-h-10 items-center rounded-lg bg-gradient-to-r from-orange-400 to-pink-500 px-3 text-xs font-semibold text-slate-950 sm:hidden"
          href="/auth/register"
        >
          Start
        </Link>
      </div>
    </header>
  )
}
