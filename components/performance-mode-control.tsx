"use client"

import { MotionMode, MOTION_MODE_OPTIONS } from "@/lib/motion-mode"

type PerformanceModeControlProps = {
  mode: MotionMode
  onChange: (mode: MotionMode) => void
  className?: string
  selectClassName?: string
  compact?: boolean
}

export default function PerformanceModeControl({
  mode,
  onChange,
  className,
  selectClassName,
  compact = false,
}: PerformanceModeControlProps) {
  return (
    <label
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-2 py-1 text-xs text-slate-100"
      }
    >
      <span className="whitespace-nowrap font-semibold uppercase tracking-wide text-slate-300">
        {compact ? "FX" : "Motion"}
      </span>
      <select
        aria-label="Animation quality mode"
        className={
          selectClassName ??
          "rounded-md border border-white/15 bg-slate-900/80 px-2 py-1 text-xs text-slate-100 outline-none"
        }
        onChange={(event) => onChange(event.target.value as MotionMode)}
        value={mode}
      >
        {MOTION_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
