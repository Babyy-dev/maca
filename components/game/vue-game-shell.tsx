"use client"

import { useMemo } from "react"

type VueGameMode = "single-player" | "multiplayer"

type VueGameShellProps = {
  mode: VueGameMode
}

export default function VueGameShell({ mode }: VueGameShellProps) {
  const src = useMemo(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? ""
    const query = apiBase ? `?apiBase=${encodeURIComponent(apiBase)}` : ""
    return `/vue-game/index.html${query}#/game/${mode}`
  }, [mode])

  return (
    <main className="min-h-[calc(100vh-64px)] px-2 pb-2 pt-2 sm:px-3">
      <div className="rounded-xl border border-white/15 bg-slate-950/60 p-2">
        <iframe
          className="h-[calc(100vh-92px)] w-full rounded-lg border-0"
          src={src}
          title={`Vue ${mode} game`}
        />
      </div>
    </main>
  )
}
