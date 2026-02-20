export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="casino-container flex flex-wrap items-center justify-center gap-3 text-sm text-slate-300 md:justify-between">
        <p className="w-full text-center md:w-auto md:text-left">MACA Blackjack</p>
        <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
          <a className="transition hover:text-cyan-300" href="#top">
            Top
          </a>
          <a className="transition hover:text-cyan-300" href="#features">
            Features
          </a>
          <a className="transition hover:text-cyan-300" href="#arena">
            Arena
          </a>
          <a className="transition hover:text-cyan-300" href="#posters">
            Posters
          </a>
          <a className="transition hover:text-cyan-300" href="#flows">
            Play Guide
          </a>
          <a className="transition hover:text-cyan-300" href="#start">
            Start
          </a>
        </div>
      </div>
    </footer>
  )
}
