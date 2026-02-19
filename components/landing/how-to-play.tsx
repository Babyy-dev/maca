"use client"

import { motion } from "framer-motion"

export default function HowToPlay() {
  return (
    <section className="section-anchor py-16 md:py-20" id="flows">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-amber-300 md:text-2xl">
            Product Flows
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Core Journey From Signup To Cashout
          </h2>
        </motion.div>

        <ol className="grid gap-4 md:grid-cols-3">
          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-5xl text-orange-300">1</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Lobby To Match
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              User connects -&gt; Lobby -&gt; Create/Join Table -&gt; Ready -&gt; Game
              starts. Every action is synced over WebSockets with server checks.
            </p>
          </motion.li>

          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-5xl text-cyan-300">2</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Referral Growth Loop
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              User A shares referral code -&gt; User B signs up -&gt; both receive
              bonus rewards. Referral stats feed profile and leaderboard data.
            </p>
          </motion.li>

          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-5xl text-pink-300">3</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Crypto To Gameplay
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Deposit crypto -&gt; convert to tokens (1 token = 1 USD) -&gt; play
              multiplayer blackjack -&gt; withdraw tokens back to crypto.
            </p>
          </motion.li>
        </ol>
      </div>
    </section>
  )
}
