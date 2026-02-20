"use client"

import { motion } from "framer-motion"
import gsap from "gsap"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#arena", label: "Arena" },
  { href: "#posters", label: "Posters" },
  { href: "#flows", label: "Play Guide" },
]

const STATS = [
  { value: "2-8", label: "Players / Table" },
  { value: "3:2", label: "Blackjack Payout" },
  { value: "Live", label: "Realtime Rounds" },
]

function DiceFace({
  faceClassName,
  pips,
}: {
  faceClassName: string
  pips: number[]
}) {
  return (
    <div className={`dice-face ${faceClassName}`}>
      <div className="dice-grid">
        {Array.from({ length: 9 }, (_, index) => index + 1).map((dot) => (
          <span
            className={`dice-dot ${pips.includes(dot) ? "is-visible" : ""}`}
            key={`${faceClassName}-${dot}`}
          />
        ))}
      </div>
    </div>
  )
}

function PlayingCard({
  cardClassName,
  suit,
  value,
  isRed = false,
}: {
  cardClassName: string
  suit: "spade" | "heart" | "club" | "diamond"
  value: string
  isRed?: boolean
}) {
  const suitSymbol =
    suit === "spade"
      ? "\u2660"
      : suit === "heart"
        ? "\u2665"
        : suit === "club"
          ? "\u2663"
          : "\u2666"
  const shouldBeRed = isRed || suit === "heart" || suit === "diamond"

  return (
    <div className={`playing-card ${cardClassName}`}>
      <div className="card-face card-front">
        <div
          className={`card-corner top ${shouldBeRed ? "text-rose-600" : "text-slate-900"}`}
        >
          <span>{value}</span>
          <span>{suitSymbol}</span>
        </div>
        <div
          className={`card-suit-main ${shouldBeRed ? "text-rose-600" : "text-slate-900"}`}
        >
          {suitSymbol}
        </div>
        <div
          className={`card-corner bottom ${shouldBeRed ? "text-rose-600" : "text-slate-900"}`}
        >
          <span>{value}</span>
          <span>{suitSymbol}</span>
        </div>
      </div>
      <div className="card-face card-back">
        <div className="card-back-inner">
          <span>BLITZ</span>
        </div>
      </div>
    </div>
  )
}

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const cardARef = useRef<HTMLDivElement | null>(null)
  const cardBRef = useRef<HTMLDivElement | null>(null)
  const diceRef = useRef<HTMLDivElement | null>(null)
  const chipARef = useRef<HTMLDivElement | null>(null)
  const chipBRef = useRef<HTMLDivElement | null>(null)
  const chipCRef = useRef<HTMLDivElement | null>(null)
  const tableGlowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const cards = [cardARef.current, cardBRef.current]

      gsap.set(cards, { transformStyle: "preserve-3d" })
      gsap.to(diceRef.current, {
        rotateX: 360,
        rotateY: 420,
        duration: 5.5,
        repeat: -1,
        ease: "none",
      })
      gsap.to(diceRef.current, {
        y: -14,
        duration: 1.7,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })

      gsap.to(chipARef.current, {
        y: -10,
        duration: 1.35,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })
      gsap.to(chipBRef.current, {
        y: -14,
        duration: 1.65,
        delay: 0.22,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })
      gsap.to(chipCRef.current, {
        y: -9,
        duration: 1.2,
        delay: 0.48,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })

      gsap.to(tableGlowRef.current, {
        opacity: 0.9,
        duration: 2.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })

      const cardTimeline = gsap.timeline({ repeat: -1, repeatDelay: 0.55 })

      cardTimeline
        .to(
          cardARef.current,
          {
            rotateY: 180,
            rotateZ: -4,
            y: -10,
            x: 14,
            duration: 1.05,
            ease: "power2.inOut",
          },
          0,
        )
        .to(
          cardBRef.current,
          {
            rotateY: -180,
            rotateZ: 3,
            y: -6,
            x: -12,
            duration: 1.05,
            ease: "power2.inOut",
          },
          0.08,
        )
        .to(
          cards,
          {
            rotateY: 360,
            rotateZ: 0,
            y: 0,
            x: 0,
            duration: 1.15,
            ease: "power3.inOut",
          },
          1.16,
        )
        .set(cards, { rotateY: 0 }, 2.32)
    }, sceneRef)

    return () => ctx.revert()
  }, [])

  return (
    <header className="relative overflow-hidden pb-20 pt-8 md:pb-24 md:pt-10">
      <div className="casino-container">
        <motion.nav
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-12 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/15 bg-slate-900/45 px-4 py-2 backdrop-blur md:rounded-full md:px-5"
          initial={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.65 }}
        >
          <a className="font-title text-2xl text-amber-300 md:text-3xl" href="#top">
            MACA Blackjack
          </a>
          <div className="hidden w-full flex-wrap items-center gap-2 text-sm sm:flex sm:w-auto sm:justify-end">
            {NAV_LINKS.map((item) => (
              <a
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-slate-100 transition hover:-translate-y-0.5 hover:bg-white/12"
                href={item.href}
                key={item.href}
              >
                {item.label}
              </a>
            ))}
            <Link
              className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-1 font-semibold text-slate-950 transition hover:-translate-y-0.5"
              href="/auth/register"
            >
              Start Now
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <Link
              className="rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-3 py-1 text-sm font-semibold text-slate-950"
              href="/auth/register"
            >
              Start Now
            </Link>
            <button
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
              className="rounded-full border border-white/20 bg-white/10 p-2 text-white"
              onClick={() => setMobileMenuOpen((value) => !value)}
              type="button"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
          {mobileMenuOpen ? (
            <div className="w-full rounded-2xl border border-white/15 bg-slate-950/85 p-2 sm:hidden">
              <div className="flex flex-col gap-2 text-sm">
                {NAV_LINKS.map((item) => (
                  <a
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100"
                    href={item.href}
                    key={`mobile-${item.href}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </motion.nav>

        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
          <div className="space-y-7">
            <motion.p
              className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200"
              initial={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              Premium Casino Environment
            </motion.p>

            <motion.h1
              className="font-title text-4xl leading-[0.9] text-white sm:text-6xl lg:text-8xl"
              initial={{ opacity: 0, y: 26 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <span className="hero-gradient-text">Multiplayer Blackjack.</span>
              <br />
              <span className="text-white">Crypto Ready Platform.</span>
            </motion.h1>

            <motion.p
              className="max-w-xl text-base leading-relaxed text-slate-200 md:text-lg"
              initial={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.7, delay: 0.32 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              Step into MACA: immersive blackjack tables, animated casino
              atmosphere, live turns, social chat, and competitive table play.
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 14 }}
              transition={{ duration: 0.55, delay: 0.45 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <Link
                className="rounded-xl bg-gradient-to-r from-orange-400 to-rose-500 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-slate-950 transition hover:-translate-y-1 hover:shadow-[0_12px_30px_rgba(251,146,60,0.4)]"
                href="/lobby"
              >
                Enter The Table
              </Link>
              <a
                className="rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold uppercase tracking-[0.14em] text-white transition hover:-translate-y-1 hover:bg-white/10"
                href="#posters"
              >
                View Posters
              </a>
            </motion.div>

            <motion.div
              className="grid max-w-lg grid-cols-1 gap-3 text-center text-slate-100 sm:grid-cols-3"
              initial={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.65, delay: 0.5 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              {STATS.map((item) => (
                <div className="glass-card rounded-xl p-3" key={item.label}>
                  <p className="font-title text-3xl text-amber-300">{item.value}</p>
                  <p className="text-xs uppercase tracking-wider text-slate-300">
                    {item.label}
                  </p>
                </div>
              ))}
            </motion.div>
          </div>

          <motion.div
            className="table-scene relative mx-auto w-full max-w-[560px]"
            initial={{ opacity: 0, scale: 0.96, y: 24 }}
            ref={sceneRef}
            transition={{ duration: 0.8, delay: 0.22 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
          >
            <div className="premium-table">
              <div className="dealer-arc" />
              <div className="table-text">BLACKJACK PAYS 3 TO 2</div>
              <div className="table-glow" ref={tableGlowRef} />

              <div className="chip-stack chip-a" ref={chipARef}>
                <span>$100</span>
              </div>
              <div className="chip-stack chip-b" ref={chipBRef}>
                <span>$50</span>
              </div>
              <div className="chip-stack chip-c" ref={chipCRef}>
                <span>$25</span>
              </div>

              <div className="cards-row">
                <div ref={cardARef}>
                  <PlayingCard cardClassName="card-left" suit="spade" value="A" />
                </div>
                <div ref={cardBRef}>
                  <PlayingCard cardClassName="card-right" suit="heart" value="K" />
                </div>
                <PlayingCard cardClassName="card-dealer" suit="club" value="9" />
              </div>

              <div className="dice-cube" ref={diceRef}>
                <DiceFace faceClassName="front" pips={[5]} />
                <DiceFace faceClassName="back" pips={[1, 3, 7, 9]} />
                <DiceFace faceClassName="left" pips={[1, 5, 9]} />
                <DiceFace faceClassName="right" pips={[1, 3, 7, 9, 5]} />
                <DiceFace faceClassName="top" pips={[1, 3]} />
                <DiceFace faceClassName="bottom" pips={[1, 3, 5, 7, 9, 2]} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </header>
  )
}
