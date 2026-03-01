"use client"

import gsap from "gsap"
import { useEffect, useMemo, useRef } from "react"

import { useMotionProfile } from "@/hooks/use-motion-profile"

const SHUFFLE_CARDS = [
  { value: "A", suit: "\u2660", isRed: false },
  { value: "10", suit: "\u2665", isRed: true },
  { value: "K", suit: "\u2663", isRed: false },
  { value: "Q", suit: "\u2666", isRed: true },
  { value: "7", suit: "\u2660", isRed: false },
  { value: "J", suit: "\u2665", isRed: true },
]

const CHIP_VALUES = ["$25", "$50", "$100", "$25", "$500", "$10"]

export default function AmbientCasino() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const shuffleRefs = useRef<Array<HTMLDivElement | null>>([])
  const chipRefs = useRef<Array<HTMLDivElement | null>>([])
  const diceRefs = useRef<Array<HTMLDivElement | null>>([])
  const { profile } = useMotionProfile()
  const landingProfile = profile.landing

  const visibleCards = useMemo(
    () => SHUFFLE_CARDS.slice(0, landingProfile.cards),
    [landingProfile.cards],
  )
  const visibleChips = useMemo(
    () => CHIP_VALUES.slice(0, landingProfile.chips),
    [landingProfile.chips],
  )

  useEffect(() => {
    if (!landingProfile.enabled) return

    const ctx = gsap.context(() => {
      gsap.ticker.lagSmoothing(700, 33)

      const cards = shuffleRefs.current.filter(
        (item): item is HTMLDivElement => Boolean(item),
      )
      const chips = chipRefs.current.filter(
        (item): item is HTMLDivElement => Boolean(item),
      )
      const dice = diceRefs.current.filter(
        (item): item is HTMLDivElement => Boolean(item),
      )
      const lights = gsap.utils.toArray<HTMLElement>(".ambient-light")
      const animations: gsap.core.Animation[] = []

      ;[...cards, ...chips, ...dice, ...lights].forEach((element) => {
        element.style.willChange = "transform, opacity"
        element.style.backfaceVisibility = "hidden"
      })

      cards.forEach((card, index) => {
        const baseRotation = (index - cards.length / 2) * 2.8
        const random = gsap.utils.random

        gsap.set(card, {
          x: 0,
          y: 0,
          rotation: baseRotation,
          rotateY: 0,
          transformPerspective: 900,
          transformOrigin: "50% 50%",
        })

        const timeline = gsap.timeline({
          repeat: -1,
          repeatDelay: landingProfile.lite ? 0.12 : 0.05,
          delay: index * 0.16,
        })

        timeline
          .to(card, {
            x: landingProfile.lite ? 68 - index * 10 : 110 - index * 14,
            y: landingProfile.lite ? -18 + index * 3 : -26 + index * 5,
            rotation:
              baseRotation +
              random(landingProfile.lite ? -11 : -17, landingProfile.lite ? 11 : 17),
            duration:
              (landingProfile.lite ? 0.7 : 0.52) * landingProfile.speedScale,
            ease: "power2.inOut",
          })
          .to(card, {
            x: landingProfile.lite ? -78 + index * 12 : -126 + index * 16,
            y: landingProfile.lite ? 12 - index * 3 : 18 - index * 4,
            rotation:
              baseRotation +
              random(landingProfile.lite ? -13 : -20, landingProfile.lite ? 13 : 20),
            duration:
              (landingProfile.lite ? 0.82 : 0.65) * landingProfile.speedScale,
            ease: "power2.inOut",
          })
          .to(card, {
            x: 0,
            y: 0,
            rotation: baseRotation,
            duration:
              (landingProfile.lite ? 0.7 : 0.54) * landingProfile.speedScale,
            ease: "power2.out",
          })

        if (!landingProfile.lite && landingProfile.cardFlip) {
          animations.push(
            gsap.to(card, {
              rotateY: 180,
              duration: 1.45 * landingProfile.speedScale,
              repeat: -1,
              yoyo: true,
              delay: index * 0.19,
              ease: "sine.inOut",
            }),
          )
        }
        animations.push(timeline)
      })

      chips.forEach((chip, index) => {
        animations.push(gsap.to(chip, {
          x: gsap.utils.random(landingProfile.lite ? -42 : -72, landingProfile.lite ? 42 : 72),
          y: gsap.utils.random(landingProfile.lite ? -28 : -48, landingProfile.lite ? 26 : 42),
          rotate: gsap.utils.random(landingProfile.lite ? -24 : -55, landingProfile.lite ? 24 : 55),
          duration:
            gsap.utils.random(landingProfile.lite ? 3.2 : 2.7, landingProfile.lite ? 5 : 4.4) *
            landingProfile.speedScale,
          repeat: -1,
          yoyo: true,
          delay: index * 0.16,
          ease: "sine.inOut",
        }))
      })

      dice.forEach((die, index) => {
        animations.push(gsap.to(die, {
          rotateX: 360,
          rotateY: landingProfile.lite ? 220 : index % 2 === 0 ? 360 : -360,
          duration:
            (landingProfile.lite ? 8.2 : 5 + index * 1.2) * landingProfile.speedScale,
          repeat: -1,
          ease: "none",
        }))
        animations.push(gsap.to(die, {
          y: index % 2 === 0 ? -16 : 14,
          duration:
            (landingProfile.lite ? 3.2 : 2.4 + index * 0.35) * landingProfile.speedScale,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        }))
      })

      animations.push(gsap.to(lights, {
        opacity: 0.95,
        duration:
          (landingProfile.lite ? 3.8 : 2.6) * landingProfile.speedScale,
        repeat: -1,
        yoyo: true,
        stagger: 0.35,
        ease: "sine.inOut",
      }))

      let inView = true
      const setRunning = (run: boolean) => {
        animations.forEach((animation) => {
          if (run) animation.play()
          else animation.pause()
        })
      }

      const observer = new IntersectionObserver(
        (entries) => {
          inView = Boolean(entries[0]?.isIntersecting)
          setRunning(inView && !document.hidden)
        },
        { threshold: 0.08 },
      )

      if (rootRef.current) observer.observe(rootRef.current)

      const onVisibilityChange = (): void => {
        setRunning(inView && !document.hidden)
      }
      document.addEventListener("visibilitychange", onVisibilityChange)

      return () => {
        observer.disconnect()
        document.removeEventListener("visibilitychange", onVisibilityChange)
        ;[...cards, ...chips, ...dice, ...lights].forEach((element) => {
          element.style.willChange = ""
          element.style.backfaceVisibility = ""
        })
      }
    }, rootRef)

    return () => ctx.revert()
  }, [landingProfile])

  return (
    <div aria-hidden className="casino-ambient" ref={rootRef}>
      <div className="ambient-vignette" />
      <div className="ambient-light ambient-light-a" />
      <div className="ambient-light ambient-light-b" />
      <div className="ambient-light ambient-light-c" />

      <div className="ambient-shuffle-zone">
        {visibleCards.map((card, index) => (
          <div
            className={`ambient-shuffle-card ${card.isRed ? "is-red" : ""}`}
            key={`${card.value}-${card.suit}-${index}`}
            ref={(element) => {
              shuffleRefs.current[index] = element
            }}
          >
            <span className="ambient-corner tl">
              {card.value}
              {card.suit}
            </span>
            <span className="ambient-suit">{card.suit}</span>
            <span className="ambient-corner br">
              {card.value}
              {card.suit}
            </span>
          </div>
        ))}
      </div>

      <div className="ambient-chip-zone">
        {visibleChips.map((value, index) => (
          <div
            className={`ambient-chip ambient-chip-${index + 1}`}
            key={`${value}-${index}`}
            ref={(element) => {
              chipRefs.current[index] = element
            }}
          >
            <span>{value}</span>
          </div>
        ))}
      </div>

      <div className="ambient-dice-zone">
        {landingProfile.dice >= 1 ? (
          <div
            className="ambient-die ambient-die-a"
            ref={(element) => {
              diceRefs.current[0] = element
            }}
          />
        ) : null}
        {landingProfile.dice >= 2 ? (
          <div
            className="ambient-die ambient-die-b"
            ref={(element) => {
              diceRefs.current[1] = element
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
