export type MotionMode = "auto" | "smooth" | "balanced" | "cinematic"
export type ResolvedMotionMode = Exclude<MotionMode, "auto">

export type MotionSignals = {
  prefersReduced: boolean
  smallViewport: boolean
  mediumViewport: boolean
  lowCpu: boolean
  lowMemory: boolean
  saveData: boolean
}

export type MotionProfile = {
  disabled: boolean
  selectedMode: MotionMode
  resolvedMode: ResolvedMotionMode
  landing: {
    enabled: boolean
    lite: boolean
    cards: number
    chips: number
    dice: number
    cardFlip: boolean
    speedScale: number
  }
  header: {
    enabled: boolean
    lite: boolean
    speedScale: number
  }
  game: {
    enabled: boolean
    cards: number
    chips: number
    dice: number
    speedScale: number
  }
}

export const MOTION_MODE_STORAGE_KEY = "maca_motion_mode"
export const MOTION_MODE_EVENT = "maca:motion-mode-change"

export const MOTION_MODE_OPTIONS: ReadonlyArray<{
  value: MotionMode
  label: string
}> = [
  { value: "auto", label: "Auto" },
  { value: "smooth", label: "Smooth" },
  { value: "balanced", label: "Balanced" },
  { value: "cinematic", label: "Cinematic" },
]

export function isMotionMode(value: unknown): value is MotionMode {
  return (
    value === "auto" ||
    value === "smooth" ||
    value === "balanced" ||
    value === "cinematic"
  )
}

export function parseMotionMode(value: unknown): MotionMode {
  if (isMotionMode(value)) return value
  return "auto"
}

export function readStoredMotionMode(): MotionMode {
  if (typeof window === "undefined") return "auto"
  return parseMotionMode(window.localStorage.getItem(MOTION_MODE_STORAGE_KEY))
}

export function persistMotionMode(mode: MotionMode): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(MOTION_MODE_STORAGE_KEY, mode)
  window.dispatchEvent(
    new CustomEvent<MotionMode>(MOTION_MODE_EVENT, {
      detail: mode,
    }),
  )
}

function resolveMode(mode: MotionMode, signals: MotionSignals): ResolvedMotionMode {
  if (mode !== "auto") return mode
  if (signals.lowCpu || signals.lowMemory || signals.saveData) {
    return "smooth"
  }
  if (signals.mediumViewport) {
    return "balanced"
  }
  return "cinematic"
}

export function resolveMotionProfile(
  selectedMode: MotionMode,
  signals: MotionSignals,
): MotionProfile {
  if (signals.prefersReduced || signals.smallViewport) {
    return {
      disabled: true,
      selectedMode,
      resolvedMode: "smooth",
      landing: {
        enabled: false,
        lite: true,
        cards: 0,
        chips: 0,
        dice: 0,
        cardFlip: false,
        speedScale: 1.4,
      },
      header: {
        enabled: false,
        lite: true,
        speedScale: 1.4,
      },
      game: {
        enabled: false,
        cards: 0,
        chips: 0,
        dice: 0,
        speedScale: 1.4,
      },
    }
  }

  const resolvedMode = resolveMode(selectedMode, signals)

  if (resolvedMode === "smooth") {
    return {
      disabled: false,
      selectedMode,
      resolvedMode,
      landing: {
        enabled: true,
        lite: true,
        cards: 3,
        chips: 2,
        dice: 1,
        cardFlip: false,
        speedScale: 1.35,
      },
      header: {
        enabled: true,
        lite: true,
        speedScale: 1.3,
      },
      game: {
        enabled: true,
        cards: 2,
        chips: 3,
        dice: 1,
        speedScale: 1.35,
      },
    }
  }

  if (resolvedMode === "balanced") {
    return {
      disabled: false,
      selectedMode,
      resolvedMode,
      landing: {
        enabled: true,
        lite: true,
        cards: 4,
        chips: 3,
        dice: 1,
        cardFlip: false,
        speedScale: 1.15,
      },
      header: {
        enabled: true,
        lite: true,
        speedScale: 1.15,
      },
      game: {
        enabled: true,
        cards: 3,
        chips: 4,
        dice: 1,
        speedScale: 1.15,
      },
    }
  }

  return {
    disabled: false,
    selectedMode,
    resolvedMode,
    landing: {
      enabled: true,
      lite: false,
      cards: 6,
      chips: 6,
      dice: 2,
      cardFlip: true,
      speedScale: 1,
    },
    header: {
      enabled: true,
      lite: false,
      speedScale: 1,
    },
    game: {
      enabled: true,
      cards: 3,
      chips: 6,
      dice: 2,
      speedScale: 1,
    },
  }
}
