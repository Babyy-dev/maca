"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"

const POSTERS = [
  {
    title: "Neon High Roller",
    subtitle: "Late-night table with fast rounds and bright edge lighting.",
    badge: "VIP Table",
    chips: "$50K Pot",
    style:
      "from-cyan-500/70 via-emerald-500/45 to-slate-900 border-cyan-300/40",
  },
  {
    title: "Crimson Ace Room",
    subtitle: "Classic red-felt feel with premium chips and tight action.",
    badge: "Classic",
    chips: "$10K Pot",
    style:
      "from-rose-500/65 via-orange-500/40 to-slate-900 border-rose-300/40",
  },
  {
    title: "Midnight Blackjack",
    subtitle: "Shadow table for tournament-style sessions and ranked climbs.",
    badge: "Ranked",
    chips: "$25K Pot",
    style:
      "from-indigo-500/70 via-violet-500/45 to-slate-900 border-indigo-300/40",
  },
  {
    title: "Emerald Pit",
    subtitle: "Green-room casino atmosphere with social chat and spectator rail.",
    badge: "Social",
    chips: "$5K Pot",
    style:
      "from-emerald-500/70 via-teal-500/45 to-slate-900 border-emerald-300/40",
  },
]

export default function GamePosters() {
  const [api, setApi] = useState<CarouselApi>()

  useEffect(() => {
    if (!api) return
    const timer = setInterval(() => api.scrollNext(), 3600)
    return () => clearInterval(timer)
  }, [api])

  return (
    <section className="section-anchor py-16 md:py-20" id="posters">
      <div className="casino-container">
        <motion.div
          className="mb-10 text-center"
          initial={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.6 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <p className="font-title text-xl text-amber-300 md:text-2xl">
            Table Posters
          </p>
          <h2 className="mt-2 text-3xl font-bold text-white md:text-5xl">
            Choose Your MACA Blackjack Vibe
          </h2>
        </motion.div>

        <Carousel
          className="mx-auto w-full max-w-5xl"
          opts={{ align: "start", loop: true }}
          setApi={setApi}
        >
          <CarouselContent>
            {POSTERS.map((poster) => (
              <CarouselItem className="md:basis-1/2 lg:basis-1/2" key={poster.title}>
                <article
                  className={`relative overflow-hidden rounded-3xl border bg-gradient-to-br p-5 sm:p-6 ${poster.style}`}
                >
                  <div className="pointer-events-none absolute -right-6 top-3 text-6xl opacity-20 sm:-right-8 sm:top-4 sm:text-7xl">
                    ♠
                  </div>
                  <div className="pointer-events-none absolute -left-3 bottom-2 text-5xl opacity-20 sm:-left-5 sm:text-6xl">
                    ♥
                  </div>
                  <p className="inline-flex rounded-full border border-white/30 bg-black/30 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
                    {poster.badge}
                  </p>
                  <h3 className="mt-4 font-title text-3xl text-white sm:text-4xl">{poster.title}</h3>
                  <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-100">
                    {poster.subtitle}
                  </p>
                  <div className="mt-5 flex items-center justify-between">
                    <span className="rounded-xl bg-black/35 px-3 py-1 text-sm font-semibold text-amber-200">
                      {poster.chips}
                    </span>
                    <span className="text-sm uppercase tracking-[0.14em] text-slate-200">
                      MACA
                    </span>
                  </div>
                </article>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="-left-3 hidden border-white/30 bg-black/45 text-white sm:flex" />
          <CarouselNext className="-right-3 hidden border-white/30 bg-black/45 text-white sm:flex" />
        </Carousel>
      </div>
    </section>
  )
}
