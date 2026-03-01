"use client"

import gsap from "gsap"
import { useEffect, useRef } from "react"

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

  useEffect(() => {
    const shouldReduceMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(max-width: 900px)").matches
    if (shouldReduceMotion) return

    const ctx = gsap.context(() => {
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
          repeatDelay: 0.05,
          delay: index * 0.16,
        })

        timeline
          .to(card, {
            x: 110 - index * 14,
            y: -26 + index * 5,
            rotation: baseRotation + random(-17, 17),
            duration: 0.52,
            ease: "power2.inOut",
          })
          .to(card, {
            x: -126 + index * 16,
            y: 18 - index * 4,
            rotation: baseRotation + random(-20, 20),
            duration: 0.65,
            ease: "power2.inOut",
          })
          .to(card, {
            x: 0,
            y: 0,
            rotation: baseRotation,
            duration: 0.54,
            ease: "power2.out",
          })

        gsap.to(card, {
          rotateY: 180,
          duration: 1.45,
          repeat: -1,
          yoyo: true,
          delay: index * 0.19,
          ease: "sine.inOut",
        })
      })

      chips.forEach((chip, index) => {
        gsap.to(chip, {
          x: gsap.utils.random(-72, 72),
          y: gsap.utils.random(-48, 42),
          rotate: gsap.utils.random(-55, 55),
          duration: gsap.utils.random(2.7, 4.4),
          repeat: -1,
          yoyo: true,
          delay: index * 0.16,
          ease: "sine.inOut",
        })
      })

      dice.forEach((die, index) => {
        gsap.to(die, {
          rotateX: 360,
          rotateY: index % 2 === 0 ? 360 : -360,
          duration: 5 + index * 1.2,
          repeat: -1,
          ease: "none",
        })
        gsap.to(die, {
          y: index % 2 === 0 ? -16 : 14,
          duration: 2.4 + index * 0.35,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        })
      })

      gsap.to(lights, {
        opacity: 0.95,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        stagger: 0.35,
        ease: "sine.inOut",
      })
    }, rootRef)

    return () => ctx.revert()
  }, [])

  return (
    <div aria-hidden className="casino-ambient" ref={rootRef}>
      <div className="ambient-vignette" />
      <div className="ambient-light ambient-light-a" />
      <div className="ambient-light ambient-light-b" />
      <div className="ambient-light ambient-light-c" />

      <div className="ambient-shuffle-zone">
        {SHUFFLE_CARDS.map((card, index) => (
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
        {CHIP_VALUES.map((value, index) => (
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
        <div
          className="ambient-die ambient-die-a"
          ref={(element) => {
            diceRefs.current[0] = element
          }}
        />
        <div
          className="ambient-die ambient-die-b"
          ref={(element) => {
            diceRefs.current[1] = element
          }}
        />
      </div>
    </div>
  )
}
