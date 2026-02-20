"use client"

import { motion } from "framer-motion"

const ARENA_BLOCKS = [
  {
    title: "Live Dealer Feeling",
    tone: "text-cyan-300",
    points: [
      "Real-time action timer for every hand.",
      "Dealer reveal flow with suspense.",
      "Split, double, insurance, and surrender support.",
    ],
  },
  {
    title: "Table Atmosphere",
    tone: "text-amber-300",
    points: [
      "Floating chips, cards, and ambient casino lights.",
      "Spectator rail with live hand updates.",
      "Fast seat-to-seat transitions for multiplayer rounds.",
    ],
  },
  {
    title: "Competitive Session",
    tone: "text-emerald-300",
    points: [
      "Private/public table join flow.",
      "Ready-up with bet selection before round start.",
      "Chat, reactions, and ranked-style momentum.",
    ],
  },
]

export default function CommandCenter() {
  return (
    <section className="section-anchor py-16 md:py-20" id="arena">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-fuchsia-300 md:text-2xl">
            Playing Environment
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Designed Like A Premium MACA Casino Floor
          </h2>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ARENA_BLOCKS.map((block, index) => (
            <motion.article
              className="glass-card rounded-2xl p-6"
              initial={{ opacity: 0, y: 30 }}
              key={block.title}
              transition={{ duration: 0.55, delay: 0.08 * index }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <h3 className={`font-title text-3xl ${block.tone}`}>{block.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-slate-100 md:text-base">
                {block.points.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </motion.article>
          ))}
          <motion.article
            className="glass-card rounded-2xl border border-fuchsia-300/30 bg-fuchsia-500/10 p-6 md:col-span-2 lg:col-span-3"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.25 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <p className="font-title text-3xl text-fuchsia-200">MACA Signature Flow</p>
            <ul className="mt-4 grid gap-2 text-sm text-slate-100 md:grid-cols-2 lg:grid-cols-4 md:text-base">
              {["Join Lobby", "Pick Table", "Set Bet + Ready", "Play Live Hand"].map((item) => (
                <li className="rounded-xl border border-white/15 bg-black/20 px-3 py-2" key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </motion.article>
        </div>
      </div>
    </section>
  )
}
