export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-8">
      <div className="casino-container flex flex-wrap items-center justify-between gap-3 text-sm text-slate-300">
        <p>Project MACA</p>
        <div className="flex items-center gap-4">
          <a className="transition hover:text-cyan-300" href="#top">
            Top
          </a>
          <a className="transition hover:text-cyan-300" href="#features">
            Features
          </a>
          <a className="transition hover:text-cyan-300" href="#flows">
            Flows
          </a>
          <a className="transition hover:text-cyan-300" href="#commands">
            Commands
          </a>
          <a className="transition hover:text-cyan-300" href="#stack">
            Stack
          </a>
          <a className="transition hover:text-cyan-300" href="#roadmap">
            Roadmap
          </a>
          <a className="transition hover:text-cyan-300" href="#start">
            Start
          </a>
        </div>
      </div>
    </footer>
  )
}
