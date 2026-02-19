"use client"

import { motion } from "framer-motion"

const MODERATOR_COMMANDS = [
  "/kick <user>",
  "/mute <user> <time>",
  "/unmute <user>",
  "/warn <user> <reason>",
  "/view_profile <user>",
]

const ADMIN_COMMANDS = [
  "/ban <user>",
  "/tempban <user> <time>",
  "/lock_account <user>",
  "/unlock_account <user>",
  "/reset_session <user>",
]

const TABLE_CONTROLS = [
  "/spectate <tableId>",
  "/pause_table <tableId>",
  "/resume_table <tableId>",
  "/end_round <tableId>",
  "/restart_table <tableId>",
]

export default function CommandCenter() {
  return (
    <section className="section-anchor py-16 md:py-20" id="commands">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-fuchsia-300 md:text-2xl">
            Admin Surface
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Moderation And Command Control
          </h2>
          <p className="mx-auto mt-3 max-w-3xl text-sm text-slate-200 md:text-base">
            Directly aligned to Project MACA command specs in `projectinfo.md`.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <motion.article
            className="glass-card rounded-2xl p-6"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <h3 className="font-title text-3xl text-cyan-300">Moderator</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-100 md:text-base">
              {MODERATOR_COMMANDS.map((item) => (
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
            <h3 className="font-title text-3xl text-amber-300">Admin</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-100 md:text-base">
              {ADMIN_COMMANDS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </motion.article>

          <motion.article
            className="glass-card rounded-2xl p-6 md:col-span-2 lg:col-span-1"
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.55, delay: 0.2 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <h3 className="font-title text-3xl text-emerald-300">Table Control</h3>
            <ul className="mt-4 space-y-2 text-sm text-slate-100 md:text-base">
              {TABLE_CONTROLS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </motion.article>
        </div>
      </div>
    </section>
  )
}
