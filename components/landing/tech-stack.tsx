"use client"

import { motion } from "framer-motion"

const FRONTEND_STACK = [
  "Realtime lobby + table UI",
  "Game board + spectator views",
  "Chat + emoji reactions",
  "Profile + referral surfaces",
  "Leaderboard + stats dashboards",
  "Wallet and crypto flow screens",
]

const BACKEND_STACK = [
  { layer: "Language", tech: "Python 3.11+" },
  { layer: "Cache", tech: "Redis" },
  { layer: "API", tech: "FastAPI" },
  { layer: "Realtime", tech: "Python-SocketIO" },
  { layer: "Engine", tech: "Server-authoritative Blackjack logic" },
  { layer: "Security", tech: "JWT auth + anti-cheat validation" },
  { layer: "Economy", tech: "1 token = 1 USD crypto gateway model" },
]

export default function TechStack() {
  return (
    <section className="section-anchor py-16 md:py-20" id="stack">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-emerald-300 md:text-2xl">
            Architecture Stack
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Production Tech Foundation
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-200 md:text-base">
            Synced to project docs: Python-first backend, Redis-powered realtime
            orchestration, and server-authoritative multiplayer gameplay.
          </p>
        </motion.div>

        <div className="grid gap-4 lg:grid-cols-2">
          <motion.article
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <h3 className="font-title text-3xl text-cyan-300">Frontend</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-100 md:text-base">
              {FRONTEND_STACK.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="font-title text-3xl text-amber-300">Backend</h3>
              <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-amber-100">
                Python + Redis
              </span>
            </div>
            <div className="space-y-2 text-sm text-slate-100 md:text-base">
              {BACKEND_STACK.map((item) => (
                <p key={item.layer}>
                  {item.layer}: {item.tech}
                </p>
              ))}
            </div>
          </motion.article>
        </div>
      </div>
    </section>
  )
}
