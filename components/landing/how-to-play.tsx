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
            How To Play
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            MACA Blackjack Table Guide
          </h2>
        </motion.div>

        <ol className="grid gap-4 md:grid-cols-3">
          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-orange-300 sm:text-5xl">1</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Enter Your Table
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Open lobby, join a public room or private code table, set your
              bet, and lock in ready before the dealer starts the hand.
            </p>
          </motion.li>

          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-cyan-300 sm:text-5xl">2</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Play The Hand
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Choose your move: hit, stand, split, double, insurance, or
              surrender. Every decision is server-validated in realtime.
            </p>
          </motion.li>

          <motion.li
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.18 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-4xl text-pink-300 sm:text-5xl">3</p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              Win And Climb
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">
              Beat dealer totals, collect payouts, and keep your momentum with
              streaks, social table energy, and competitive sessions.
            </p>
          </motion.li>
        </ol>
      </div>
    </section>
  )
}
