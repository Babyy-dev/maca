import AmbientCasino from "../components/landing/ambient-casino"
import CommandCenter from "../components/landing/command-center"
import Cta from "../components/landing/cta"
import Features from "../components/landing/features"
import Footer from "../components/landing/footer"
import GamePosters from "../components/landing/game-posters"
import Header from "../components/landing/header"
import HowToPlay from "../components/landing/how-to-play"

export default function HomePage() {
  return (
    <main className="relative isolate overflow-x-clip pb-10" id="top">
      <AmbientCasino />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 top-20 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-[32rem] h-64 w-64 rounded-full bg-orange-400/20 blur-3xl"
      />
      <Header />
      <Features />
      <CommandCenter />
      <GamePosters />
      <HowToPlay />
      <Cta />
      <Footer />
    </main>
  )
}
