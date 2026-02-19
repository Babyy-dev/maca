"use client"

import { motion } from "framer-motion"
import Link from "next/link"

export default function Cta() {
  return (
    <section className="section-anchor py-14 md:py-20" id="start">
      <div className="casino-container">
        <motion.div
          className="glass-card glow-ring relative overflow-hidden rounded-3xl p-8 text-center md:p-12"
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          transition={{ duration: 0.7 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
        >
          <div className="absolute -left-12 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-cyan-400/30 blur-2xl" />
          <div className="absolute -right-10 top-5 h-24 w-24 rounded-full bg-orange-400/35 blur-2xl" />

          <p className="font-title text-xl text-cyan-300 md:text-2xl">
            Ready To Build Project MACA?
          </p>
          <h2 className="mt-3 text-3xl font-bold text-white md:text-5xl">
            Realtime Multiplayer With Python + Redis
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 md:text-base">
            Frontend experience is ready for your full backend plan: FastAPI
            APIs, Redis-powered sessions/matchmaking, authoritative game logic,
            and crypto gateway orchestration.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              className="rounded-xl bg-gradient-to-r from-cyan-300 to-sky-500 px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-slate-950 transition hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(34,211,238,0.4)]"
              href="/auth/register"
            >
              Open Platform
            </Link>
            <Link
              className="rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:-translate-y-1 hover:bg-white/16"
              href="/lobby"
            >
              Open Lobby
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
