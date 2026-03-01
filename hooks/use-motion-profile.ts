"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  MOTION_MODE_EVENT,
  MOTION_MODE_STORAGE_KEY,
  MotionMode,
  MotionSignals,
  persistMotionMode,
  readStoredMotionMode,
  resolveMotionProfile,
} from "@/lib/motion-mode"

function collectSignals(): MotionSignals {
  if (typeof window === "undefined") {
    return {
      prefersReduced: true,
      smallViewport: true,
      mediumViewport: true,
      lowCpu: true,
      lowMemory: true,
      saveData: true,
    }
  }

  const navWithPerf = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean }
  }

  return {
    prefersReduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    smallViewport: window.matchMedia("(max-width: 900px)").matches,
    mediumViewport: window.matchMedia("(max-width: 1280px)").matches,
    lowCpu:
      typeof navigator.hardwareConcurrency === "number" &&
      navigator.hardwareConcurrency <= 6,
    lowMemory:
      typeof navWithPerf.deviceMemory === "number" && navWithPerf.deviceMemory <= 8,
    saveData: Boolean(navWithPerf.connection?.saveData),
  }
}

export function useMotionProfile() {
  const [mode, setModeState] = useState<MotionMode>("auto")
  const [signals, setSignals] = useState<MotionSignals>(collectSignals)

  useEffect(() => {
    setModeState(readStoredMotionMode())
  }, [])

  useEffect(() => {
    const onResize = (): void => {
      setSignals(collectSignals())
    }

    const onStorage = (event: StorageEvent): void => {
      if (event.key !== MOTION_MODE_STORAGE_KEY) return
      setModeState(readStoredMotionMode())
    }

    const onModeChange = (event: Event): void => {
      const customEvent = event as CustomEvent<MotionMode>
      if (customEvent.detail) {
        setModeState(customEvent.detail)
      } else {
        setModeState(readStoredMotionMode())
      }
    }

    window.addEventListener("resize", onResize)
    window.addEventListener("storage", onStorage)
    window.addEventListener(MOTION_MODE_EVENT, onModeChange)

    const mediaQueries = [
      window.matchMedia("(prefers-reduced-motion: reduce)"),
      window.matchMedia("(max-width: 900px)"),
      window.matchMedia("(max-width: 1280px)"),
    ]
    mediaQueries.forEach((mql) => mql.addEventListener("change", onResize))

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(MOTION_MODE_EVENT, onModeChange)
      mediaQueries.forEach((mql) => mql.removeEventListener("change", onResize))
    }
  }, [])

  const setMode = useCallback((nextMode: MotionMode) => {
    setModeState(nextMode)
    persistMotionMode(nextMode)
  }, [])

  const profile = useMemo(
    () => resolveMotionProfile(mode, signals),
    [mode, signals],
  )

  return { mode, setMode, profile }
}
