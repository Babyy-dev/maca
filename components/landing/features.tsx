"use client"

import { motion } from "framer-motion"

export default function Features() {
  return (
    <section className="section-anchor py-16 md:py-20" id="features">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-cyan-300 md:text-2xl">
            Core Capabilities
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Multiplayer, Social, Secure, Crypto Enabled
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-orange-300">01</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Realtime Multiplayer
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              2-8 players per table with public/private rooms, invite codes,
              synchronized turns, and spectator-ready table state updates.
            </p>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-cyan-300">02</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Server Authority
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Secure RNG, validated actions, anti-cheat checks, betting limits,
              and full round logs protect fairness in every game.
            </p>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-pink-300">03</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Social Layer
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Table chat, emoji reactions, friends, invitations, and referral
              rewards make each table session collaborative and competitive.
            </p>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-emerald-300">04</p>
            <h3 className="mt-3 text-xl font-semibold text-white">Admin Control</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Moderator and admin commands for kick/mute/ban, table controls,
              balance adjustments, audit logs, and live spectating.
            </p>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.3 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-violet-300">05</p>
            <h3 className="mt-3 text-xl font-semibold text-white">Leaderboard Mode</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Win/loss ratios, blackjack counts, weekly/monthly/all-time ranking,
              and friends leaderboards drive long-term engagement.
            </p>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 transition hover:-translate-y-1.5"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.36 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-amber-300">06</p>
            <h3 className="mt-3 text-xl font-semibold text-white">Crypto Gateway</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Deposit BTC/ETH/SOL, convert with a 1 token = 1 USD model, play
              multiplayer rounds, then request withdrawal with verification.
            </p>
          </motion.article>
        </div>
      </div>
    </section>
  )
}
