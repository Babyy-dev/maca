"use client"

import { motion } from "framer-motion"

const MILESTONES = [
  {
    name: "Milestone 1 - Foundation",
    window: "Week 1-2",
    status: "Done",
    summary: "Auth, profile system, JWT sessions, secure API base.",
  },
  {
    name: "Milestone 2 - Blackjack Engine",
    window: "Week 3",
    status: "In Progress",
    summary: "Deck/RNG, dealer logic, betting rules, win/loss enforcement.",
  },
  {
    name: "Milestone 3 - Multiplayer System",
    window: "Week 4-5",
    status: "In Progress",
    summary: "Socket rooms, lobby/tables, turn timers, reconnect sync.",
  },
  {
    name: "Milestone 4 - Chat & Social",
    window: "Week 6",
    status: "Planned",
    summary: "Chat channels, emoji reactions, friends, invites, moderation.",
  },
  {
    name: "Milestone 5 - Admin Tools",
    window: "Week 7",
    status: "In Progress",
    summary: "Role system, command infrastructure, audits, economy controls.",
  },
  {
    name: "Milestone 6 - Leaderboards",
    window: "Week 8",
    status: "Planned",
    summary: "Wins/losses tracking, rankings, friend leaderboards.",
  },
  {
    name: "Milestone 7 - Referral System",
    window: "Week 9",
    status: "Planned",
    summary: "Referral codes, bonus tracking, referral dashboard.",
  },
  {
    name: "Milestone 8 - Crypto Gateway",
    window: "Week 10-11",
    status: "In Progress",
    summary: "Wallet linking, token conversion, deposit/withdraw verification.",
  },
  {
    name: "Milestone 9 - Frontend UI",
    window: "Week 12-13",
    status: "In Progress",
    summary: "Lobby/game/table UI, wallet UI, responsive realtime updates.",
  },
  {
    name: "Milestone 10 - Security Hardening",
    window: "Week 14",
    status: "Planned",
    summary: "Rate limits, anti-cheat upgrades, WebSocket auth hardening.",
  },
  {
    name: "Milestone 11 - Launch",
    window: "Week 15",
    status: "Planned",
    summary: "Final QA, monitoring, backup systems, public release.",
  },
]

function statusClass(status: string) {
  if (status === "Done") return "text-emerald-300 bg-emerald-400/20"
  if (status === "In Progress") return "text-amber-200 bg-amber-400/20"
  return "text-cyan-200 bg-cyan-400/20"
}

export default function Roadmap() {
  return (
    <section className="section-anchor py-16 md:py-20" id="roadmap">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-pink-300 md:text-2xl">
            Development Plan
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Milestones Aligned To Project MACA
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {MILESTONES.map((item, index) => (
            <motion.article
              className="glass-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 30 }}
              key={item.name}
              transition={{ duration: 0.55, delay: 0.05 * index }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-title text-3xl text-white">{item.name}</p>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusClass(item.status)}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-300">
                {item.window}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                {item.summary}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  )
}
