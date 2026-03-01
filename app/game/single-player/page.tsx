
"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import gsap from "gsap"
import { memo, useEffect, useMemo, useRef, useState } from "react"

import AuthActionButtons from "@/components/auth-action-buttons"
import { useMotionProfile } from "@/hooks/use-motion-profile"
import { AuthUser, getMe, getStoredToken } from "@/lib/maca-api"

type Suit = "S" | "H" | "D" | "C"
type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"
type RoundResult = "BUST" | "WIN" | "LOSE" | "PUSH" | "BLACKJACK"
type RoundPhase = "idle" | "dealing" | "player_turn" | "dealer_turn" | "settled" | "game_over"
type RecommendedAction = "hit" | "stand" | "doubleDown" | "split"

type PlayingCard = {
  id: string
  value: Rank
  suit: Suit
  isFaceDown: boolean
}

type PlayerHand = {
  id: string
  cards: PlayingCard[]
  bet: number
  result: RoundResult | null
  isSplitHand: boolean
}

type RoundHistoryItem = {
  id: string
  roundNumber: number
  outcome: string
  net: number
  dealerScore: number
  playerScores: string
  at: string
}

type RoundOverlay = {
  id: string
  label: "WIN" | "LOSE" | "PUSH" | "BLACKJACK"
  net: number
}

type GameState = {
  phase: RoundPhase
  bank: number
  shoe: PlayingCard[]
  dealerCards: PlayingCard[]
  playerHands: PlayerHand[]
  activeHandIndex: number | null
  isBusy: boolean
  message: string
  roundNumber: number
  history: RoundHistoryItem[]
}

const SUITS: Suit[] = ["S", "H", "D", "C"]
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
const SUIT_SYMBOL: Record<Suit, string> = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663",
}
const DEAL_DELAY_MS = 260
const SHUFFLE_AFTER_PERCENT = 0.75
const DECK_COUNT = 6
const INITIAL_BANK = 250
const MIN_BET = 1

const FACE_VALUES: Record<string, number> = {
  a: 1,
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
}

function uid(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createDeck(): PlayingCard[] {
  const cards: PlayingCard[] = []
  for (const value of RANKS) {
    for (const suit of SUITS) {
      cards.push({ id: uid(), value, suit, isFaceDown: false })
    }
  }
  return cards
}

function shuffleCards(cardsToShuffle: PlayingCard[]): PlayingCard[] {
  const cards = cardsToShuffle.slice()
  for (let i = cards.length - 1; i >= 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1))
    const randomCard = cards[randomIndex]
    cards[randomIndex] = cards[i]
    cards[i] = randomCard
  }
  return cards
}

function createShoe(deckCount = DECK_COUNT): PlayingCard[] {
  const shoe: PlayingCard[] = []
  for (let i = 0; i < deckCount; i += 1) {
    shoe.push(...shuffleCards(createDeck()))
  }
  return shuffleCards(shoe)
}

function cardValue(card: PlayingCard): number {
  if (FACE_VALUES[card.value] !== undefined) {
    return FACE_VALUES[card.value]
  }
  return Number(card.value)
}

function score(cardsToTotal: PlayingCard[], getHighTotal = false): number {
  const lowValueCards = cardsToTotal.map((card) => ({
    ...card,
    value: card.value === "A" ? ("a" as Rank | "a") : card.value,
  }))
  const lowTotal = lowValueCards.reduce((sum, card) => sum + cardValue(card as PlayingCard), 0)

  const highCards = lowValueCards.map((card) => ({ ...card }))
  const aceIndex = highCards.findIndex((card) => card.value === "a")
  if (aceIndex >= 0) {
    highCards[aceIndex].value = "A"
  }
  const highTotal = highCards.reduce((sum, card) => sum + cardValue(card as PlayingCard), 0)

  if (highTotal <= 21 || getHighTotal) {
    return highTotal
  }
  return lowTotal
}

function canSplit(cards: PlayingCard[]): boolean {
  if (cards.length !== 2) return false
  const normalizeForSplit = (card: PlayingCard): number => {
    if (card.value === "A") return 11
    if (card.value === "10" || card.value === "J" || card.value === "Q" || card.value === "K") {
      return 10
    }
    return Number(card.value)
  }
  return normalizeForSplit(cards[0]) === normalizeForSplit(cards[1])
}

function isSoftHand(cards: PlayingCard[]): boolean {
  if (!cards.some((card) => card.value === "A")) {
    return false
  }
  return score(cards, false) === score(cards, true)
}

function getSoftMove(playerCards: PlayingCard[], dealerCards: PlayingCard[]): RecommendedAction {
  const moveTable: Record<number, string> = {
    13: "  hhhddhhhhh",
    14: "  hhhddhhhhh",
    15: "  hhdddhhhhh",
    16: "  hhdddhhhhh",
    17: "  hddddhhhhh",
    18: "  sddddsshhh",
  }

  const moveMap: Record<string, RecommendedAction> = { h: "hit", s: "stand", d: "doubleDown" }

  const playerScore = score(playerCards)
  const dealerUpCard = dealerCards.find((card) => !card.isFaceDown)
  if (!dealerUpCard || !moveTable[playerScore]) {
    return "hit"
  }

  const dealerUpValue = score([dealerUpCard])
  const key = moveTable[playerScore].charAt(dealerUpValue)
  const move = moveMap[key] ?? "hit"
  if (move === "doubleDown" && playerCards.length > 2) {
    return "hit"
  }

  return move
}

function getHardMove(playerCards: PlayingCard[], dealerCards: PlayingCard[]): RecommendedAction {
  const moveTable: Record<number, string> = {
    9: "  hdddhhhhhh",
    10: "  ddddddddhh",
    11: "  dddddddddh",
    12: "  hhssshhhhh",
    13: "  ssssshhhhh",
    14: "  ssssshhhhh",
    15: "  ssssshhhhh",
    16: "  ssssshhhhh",
  }

  const moveMap: Record<string, RecommendedAction> = { h: "hit", s: "stand", d: "doubleDown" }

  const playerScore = score(playerCards)
  if (playerScore <= 8) return "hit"
  if (playerScore >= 17) return "stand"

  const dealerUpCard = dealerCards.find((card) => !card.isFaceDown)
  if (!dealerUpCard || !moveTable[playerScore]) {
    return "hit"
  }

  const dealerUpValue = score([dealerUpCard])
  const key = moveTable[playerScore].charAt(dealerUpValue)
  const move = moveMap[key] ?? "hit"
  if (move === "doubleDown" && playerCards.length > 2) {
    return "hit"
  }

  return move
}
function getBasicStrategyMove(playerCards: PlayingCard[], dealerCards: PlayingCard[]): RecommendedAction {
  if (score(playerCards) >= 19) return "stand"

  if (canSplit(playerCards)) {
    const splitTable: Partial<Record<Rank, Rank[]>> = {
      "2": ["2", "3", "4", "5", "6", "7"],
      "3": ["2", "3", "4", "5", "6", "7"],
      "4": ["5", "6"],
      "6": ["2", "3", "4", "5", "6"],
      "7": ["2", "3", "4", "5", "6", "7"],
      "9": ["2", "3", "4", "5", "6", "8", "9"],
    }

    const handValue = playerCards[0].value
    const dealerUpCard = dealerCards.find((card) => !card.isFaceDown)
    if (dealerUpCard) {
      if (handValue === "A" || handValue === "8") return "split"
      if (handValue !== "5") {
        const target = splitTable[handValue]
        if (target && target.includes(dealerUpCard.value)) {
          return "split"
        }
      }
    }
  }

  if (isSoftHand(playerCards)) {
    return getSoftMove(playerCards, dealerCards)
  }

  return getHardMove(playerCards, dealerCards)
}

function isRedSuit(suit: Suit): boolean {
  return suit === "H" || suit === "D"
}

function isBlackjack(cards: PlayingCard[]): boolean {
  return cards.length === 2 && score(cards) === 21
}

function toResultTone(result: RoundResult | null): string {
  if (!result) return "text-slate-100"
  if (result === "WIN" || result === "BLACKJACK") return "text-emerald-300"
  if (result === "PUSH") return "text-amber-300"
  return "text-rose-300"
}

function buildInitialState(startingBank: number): GameState {
  return {
    phase: "idle",
    bank: startingBank,
    shoe: createShoe(DECK_COUNT),
    dealerCards: [],
    playerHands: [],
    activeHandIndex: null,
    isBusy: false,
    message: "Choose your bet and deal a new round.",
    roundNumber: 0,
    history: [],
  }
}

const TableCard = memo(function TableCard({
  card,
  index,
  liteMotion,
}: {
  card: PlayingCard
  index: number
  liteMotion: boolean
}) {
  const red = isRedSuit(card.suit)

  return (
    <motion.div
      className="playing-card"
      initial={liteMotion ? false : { opacity: 0, y: -180, rotate: -8 }}
      animate={{ opacity: 1, y: 0, rotate: index % 2 === 0 ? -2 : 3 }}
      transition={
        liteMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 220, damping: 22, delay: index * 0.04 }
      }
    >
      <div
        className="card-face card-front"
        style={{
          transform: card.isFaceDown ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 0.45s ease",
        }}
      >
        <div className="card-corner top" style={{ color: red ? "#be123c" : "#0f172a" }}>
          <span>{card.value}</span>
          <span>{SUIT_SYMBOL[card.suit]}</span>
        </div>
        <div className="card-suit-main" style={{ color: red ? "#be123c" : "#0f172a" }}>{SUIT_SYMBOL[card.suit]}</div>
        <div className="card-corner bottom" style={{ color: red ? "#be123c" : "#0f172a" }}>
          <span>{card.value}</span>
          <span>{SUIT_SYMBOL[card.suit]}</span>
        </div>
      </div>
      <div
        className="card-face card-back"
        style={{
          transform: card.isFaceDown ? "rotateY(0deg)" : "rotateY(180deg)",
          transition: "transform 0.45s ease",
        }}
      >
        <div className="card-back-inner">MACA</div>
      </div>
    </motion.div>
  )
})

export default function SinglePlayerGamePage() {
  const router = useRouter()
  const ambientRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<GameState>(buildInitialState(INITIAL_BANK))
  const userBankInitializedRef = useRef(false)
  const actionLockRef = useRef(false)
  const reducedMotion = useReducedMotion()
  const { profile } = useMotionProfile()
  const gameMotionProfile = profile.game

  const [user, setUser] = useState<AuthUser | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [roundOverlay, setRoundOverlay] = useState<RoundOverlay | null>(null)
  const [showBasicStrategy, setShowBasicStrategy] = useState(true)
  const [betInput, setBetInput] = useState(String(MIN_BET))
  const [game, setGame] = useState<GameState>(() => {
    const initial = buildInitialState(INITIAL_BANK)
    gameRef.current = initial
    return initial
  })

  const patchGame = (updater: (prev: GameState) => GameState): void => {
    setGame((prev) => {
      const next = updater(prev)
      gameRef.current = next
      return next
    })
  }

  function recoverFromRoundError(fallbackMessage: string): void {
    patchGame((prev) => ({
      ...prev,
      isBusy: false,
      phase:
        prev.phase === "dealing" || prev.phase === "dealer_turn" || prev.phase === "player_turn"
          ? "settled"
          : prev.phase,
      activeHandIndex: null,
      message: `${fallbackMessage} You can deal again.`,
    }))
  }

  useEffect(() => {
    const storedToken = getStoredToken()
    if (!storedToken) {
      router.replace("/auth/login")
      return
    }
    const authToken = storedToken

    let isActive = true

    async function bootstrap(): Promise<void> {
      try {
        const me = await getMe(authToken)
        if (!isActive) return
        setUser(me)
      } catch (error) {
        if (!isActive) return
        const message = error instanceof Error ? error.message : "Failed to authenticate"
        setAuthError(message)
      } finally {
        if (isActive) setBootstrapping(false)
      }
    }

    void bootstrap()

    return () => {
      isActive = false
    }
  }, [router])

  useEffect(() => {
    if (!user || userBankInitializedRef.current) return

    const normalizedBalance = Math.max(MIN_BET, roundMoney(user.balance))
    patchGame((prev) => ({
      ...prev,
      bank: normalizedBalance,
      message: "Welcome to the MACA table. Place your bet and play.",
    }))
    userBankInitializedRef.current = true
  }, [user])

  useEffect(() => {
    if (!ambientRef.current) return
    if (!gameMotionProfile.enabled) return

    const context = gsap.context(() => {
      gsap.ticker.lagSmoothing(700, 33)

      const cards = gsap
        .utils
        .toArray<HTMLElement>(".shuffle-card")
        .slice(0, gameMotionProfile.cards)
      const chips = gsap
        .utils
        .toArray<HTMLElement>(".bg-chip")
        .slice(0, gameMotionProfile.chips)
      const dice = gsap
        .utils
        .toArray<HTMLElement>(".bg-dice")
        .slice(0, gameMotionProfile.dice)
      const animations: gsap.core.Animation[] = []
      const smoothMode = gameMotionProfile.cards <= 2

      ;[...cards, ...chips, ...dice].forEach((element) => {
        element.style.willChange = "transform"
        element.style.backfaceVisibility = "hidden"
      })

      cards.forEach((element, index) => {
        gsap.set(element, { rotate: index % 2 === 0 ? -10 : 10, y: index * 8 })
        animations.push(gsap.to(element, {
          x: index % 2 === 0 ? (smoothMode ? 110 : 170) : smoothMode ? -110 : -170,
          rotate: index % 2 === 0 ? 14 : -14,
          y: `+=${smoothMode ? 8 : 16 + index * 2}`,
          duration:
            (smoothMode ? 3.4 + index * 0.35 : 2.8 + index * 0.35) *
            gameMotionProfile.speedScale,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        }))
      })

      animations.push(gsap.to(chips, {
        rotation: 360,
        duration: (smoothMode ? 11 : 8) * gameMotionProfile.speedScale,
        repeat: -1,
        ease: "none",
        stagger: 0.3,
      }))

      animations.push(gsap.to(dice, {
        rotateY: 360,
        rotateX: 360,
        duration: (smoothMode ? 13 : 10) * gameMotionProfile.speedScale,
        repeat: -1,
        ease: "none",
      }))

      let inView = true
      const setRunning = (run: boolean): void => {
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

      if (ambientRef.current) observer.observe(ambientRef.current)

      const onVisibilityChange = (): void => {
        setRunning(inView && !document.hidden)
      }
      document.addEventListener("visibilitychange", onVisibilityChange)

      return () => {
        observer.disconnect()
        document.removeEventListener("visibilitychange", onVisibilityChange)
        ;[...cards, ...chips, ...dice].forEach((element) => {
          element.style.willChange = ""
          element.style.backfaceVisibility = ""
        })
      }
    }, ambientRef)

    return () => context.revert()
  }, [gameMotionProfile])

  useEffect(() => {
    if (!roundOverlay) return
    const timer = setTimeout(() => setRoundOverlay(null), 2100)
    return () => clearTimeout(timer)
  }, [roundOverlay])

  async function dealCard(target: "dealer" | "player", handIndex = 0, isFaceDown = false): Promise<PlayingCard | null> {
    let dealtCard: PlayingCard | null = null

    patchGame((prev) => {
      let nextShoe = prev.shoe
      if (nextShoe.length === 0) nextShoe = createShoe(DECK_COUNT)

      const [drawnCard, ...remaining] = nextShoe
      if (!drawnCard) return prev

      dealtCard = { ...drawnCard, isFaceDown }

      if (target === "dealer") {
        return { ...prev, shoe: remaining, dealerCards: [...prev.dealerCards, dealtCard] }
      }

      const nextHands = prev.playerHands.map((hand, index) => {
        if (index !== handIndex) return hand
        return { ...hand, cards: [...hand.cards, dealtCard as PlayingCard] }
      })

      return { ...prev, shoe: remaining, playerHands: nextHands }
    })

    if (dealtCard) await wait(DEAL_DELAY_MS)
    return dealtCard
  }
  async function settleRound(): Promise<void> {
    const snapshot = gameRef.current
    let payoutReturn = 0
    let net = 0

    const finalizedHands = snapshot.playerHands.map((hand) => {
      if (hand.result === "BLACKJACK") {
        payoutReturn += hand.bet * 2.5
        net += hand.bet * 1.5
        return hand
      }
      if (hand.result === "WIN") {
        payoutReturn += hand.bet * 2
        net += hand.bet
        return hand
      }
      if (hand.result === "PUSH") {
        payoutReturn += hand.bet
        return hand
      }
      net -= hand.bet
      return hand
    })

    const roundedNet = roundMoney(net)
    const nextBank = roundMoney(snapshot.bank + payoutReturn)
    const dealerScore = score(snapshot.dealerCards)
    const outcomes = finalizedHands.map((hand) => hand.result ?? "-").join("/")
    const playerScores = finalizedHands.map((hand) => String(score(hand.cards))).join("/")

    const nextHistoryEntry: RoundHistoryItem = {
      id: uid(),
      roundNumber: snapshot.roundNumber,
      outcome: outcomes,
      net: roundedNet,
      dealerScore,
      playerScores,
      at: new Date().toLocaleTimeString(),
    }

    const nextPhase: RoundPhase = nextBank < MIN_BET ? "game_over" : "settled"
    const nextMessage =
      nextPhase === "game_over"
        ? "Bankroll below minimum bet. Reset table to continue."
        : roundedNet >= 0
          ? `Round settled: +$${formatMoney(roundedNet)}`
          : `Round settled: -$${formatMoney(Math.abs(roundedNet))}`

    patchGame((prev) => ({
      ...prev,
      bank: nextBank,
      playerHands: finalizedHands,
      phase: nextPhase,
      activeHandIndex: null,
      isBusy: false,
      message: nextMessage,
      history: [nextHistoryEntry, ...prev.history].slice(0, 12),
    }))

    const overlayLabel: RoundOverlay["label"] =
      roundedNet > 0
        ? outcomes.includes("BLACKJACK")
          ? "BLACKJACK"
          : "WIN"
        : roundedNet < 0
          ? "LOSE"
          : "PUSH"
    setRoundOverlay({
      id: uid(),
      label: overlayLabel,
      net: roundedNet,
    })
  }

  async function playDealerTurn(): Promise<void> {
    try {
      patchGame((prev) => ({
        ...prev,
        phase: "dealer_turn",
        activeHandIndex: null,
        isBusy: true,
        message: "Dealer turn in progress.",
        dealerCards: prev.dealerCards.map((card) => ({ ...card, isFaceDown: false })),
      }))

      await wait(DEAL_DELAY_MS)

      while (true) {
        const snapshot = gameRef.current
        const unresolved = snapshot.playerHands.some((hand) => !hand.result)
        if (!unresolved) break
        if (score(snapshot.dealerCards) >= 17) break
        const dealerCard = await dealCard("dealer")
        if (!dealerCard) throw new Error("Dealer could not draw a card")
      }

      patchGame((prev) => {
        const dealerTotal = score(prev.dealerCards)
        const resolvedHands: PlayerHand[] = prev.playerHands.map((hand): PlayerHand => {
          if (hand.result) return hand

          const playerTotal = score(hand.cards)
          if (dealerTotal > 21 || playerTotal > dealerTotal) return { ...hand, result: "WIN" as RoundResult }
          if (playerTotal < dealerTotal) return { ...hand, result: "LOSE" as RoundResult }
          return { ...hand, result: "PUSH" as RoundResult }
        })

        return { ...prev, playerHands: resolvedHands }
      })

      await wait(360)
      await settleRound()
    } catch (error) {
      console.error("Dealer turn error:", error)
      recoverFromRoundError("Round sync issue recovered.")
    }
  }

  async function moveToNextPlayerHand(startIndex: number): Promise<void> {
    const snapshot = gameRef.current

    for (let index = startIndex; index < snapshot.playerHands.length; index += 1) {
      const latest = gameRef.current
      const hand = latest.playerHands[index]
      if (!hand || hand.result) continue

      patchGame((prev) => ({
        ...prev,
        phase: "player_turn",
        activeHandIndex: index,
        isBusy: false,
        message: `Hand ${index + 1}: choose action.`,
      }))

      if (hand.cards.length === 1) {
        const dealtCard = await dealCard("player", index)
        if (!dealtCard) throw new Error("Player hand could not draw a card")
        const updatedHand = gameRef.current.playerHands[index]
        if (!updatedHand) continue

        const handScore = score(updatedHand.cards)
        const mustStand = updatedHand.cards[0]?.value === "A" || handScore >= 21

        if (handScore > 21) {
          patchGame((prev) => {
            const nextHands = prev.playerHands.map((targetHand, handIndex) =>
              handIndex === index ? { ...targetHand, result: "BUST" as RoundResult } : targetHand,
            )
            return { ...prev, playerHands: nextHands, message: `Hand ${index + 1} busts.` }
          })
          continue
        }

        if (mustStand) {
          patchGame((prev) => ({ ...prev, message: `Hand ${index + 1} stands automatically.` }))
          await wait(220)
          continue
        }
      }

      return
    }

    await playDealerTurn()
  }

  async function startRound(): Promise<void> {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const current = gameRef.current
      if (current.isBusy || current.phase === "player_turn" || current.phase === "dealer_turn" || current.phase === "dealing") {
        return
      }

      const betValue = roundMoney(Number.parseFloat(betInput))
      if (!Number.isFinite(betValue) || betValue < MIN_BET) {
        patchGame((prev) => ({ ...prev, message: `Minimum bet is $${MIN_BET}.` }))
        return
      }

      if (current.bank < betValue) {
        patchGame((prev) => ({ ...prev, message: "Insufficient bank for this bet." }))
        return
      }

      const minimumCardsBeforeReshuffle = Math.floor(DECK_COUNT * 52 * (1 - SHUFFLE_AFTER_PERCENT))

      patchGame((prev) => {
        const shouldReshuffle = prev.shoe.length <= minimumCardsBeforeReshuffle
        const nextShoe = shouldReshuffle ? createShoe(DECK_COUNT) : prev.shoe

        return {
          ...prev,
          phase: "dealing",
          roundNumber: prev.roundNumber + 1,
          isBusy: true,
          activeHandIndex: null,
          bank: roundMoney(prev.bank - betValue),
          dealerCards: [],
          playerHands: [{ id: uid(), cards: [], bet: betValue, result: null, isSplitHand: false }],
          shoe: nextShoe,
          message: shouldReshuffle ? "Shuffling shoe and dealing round." : "Dealing round.",
        }
      })

      const cardA = await dealCard("player", 0)
      const cardB = await dealCard("dealer", 0, true)
      const cardC = await dealCard("player", 0)
      const cardD = await dealCard("dealer", 0)
      if (!cardA || !cardB || !cardC || !cardD) {
        throw new Error("Failed to deal initial cards")
      }

      const dealtState = gameRef.current
      const playerHand = dealtState.playerHands[0]
      const playerBlackjack = playerHand ? isBlackjack(playerHand.cards) : false
      const dealerBlackjack = isBlackjack(dealtState.dealerCards)

      if (playerBlackjack || dealerBlackjack) {
        patchGame((prev) => {
          const nextHands = prev.playerHands.map((hand) => {
            if (playerBlackjack && dealerBlackjack) return { ...hand, result: "PUSH" as RoundResult }
            if (playerBlackjack) return { ...hand, result: "BLACKJACK" as RoundResult }
            return { ...hand, result: "LOSE" as RoundResult }
          })

          return {
            ...prev,
            dealerCards: prev.dealerCards.map((card) => ({ ...card, isFaceDown: false })),
            playerHands: nextHands,
            message: playerBlackjack && dealerBlackjack ? "Both have blackjack: push." : playerBlackjack ? "Blackjack paid at 3:2." : "Dealer blackjack.",
          }
        })

        await wait(300)
        await settleRound()
        return
      }

      patchGame((prev) => ({
        ...prev,
        phase: "player_turn",
        activeHandIndex: 0,
        isBusy: false,
        message: "Your turn. Use hit, stand, double, or split.",
      }))
    } catch (error) {
      console.error("Start round error:", error)
      recoverFromRoundError("Round setup issue recovered.")
    } finally {
      actionLockRef.current = false
    }
  }

  async function handleHit(): Promise<void> {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const snapshot = gameRef.current
      if (snapshot.phase !== "player_turn" || snapshot.isBusy || snapshot.activeHandIndex === null) return

      const handIndex = snapshot.activeHandIndex
      patchGame((prev) => ({ ...prev, isBusy: true, message: `Hand ${handIndex + 1} hits.` }))

      const dealtCard = await dealCard("player", handIndex)
      if (!dealtCard) throw new Error("Failed to deal card on hit")

      const updatedHand = gameRef.current.playerHands[handIndex]
      if (!updatedHand) throw new Error("Hand not found after hit")

      const total = score(updatedHand.cards)

      if (total > 21) {
        patchGame((prev) => {
          const nextHands = prev.playerHands.map((hand, index) =>
            index === handIndex ? { ...hand, result: "BUST" as RoundResult } : hand,
          )
          return { ...prev, playerHands: nextHands, message: `Hand ${handIndex + 1} busts.` }
        })
        await moveToNextPlayerHand(handIndex + 1)
        return
      }

      if (total === 21) {
        patchGame((prev) => ({ ...prev, message: `Hand ${handIndex + 1} has 21 and stands.` }))
        await moveToNextPlayerHand(handIndex + 1)
        return
      }

      patchGame((prev) => ({ ...prev, isBusy: false, message: `Hand ${handIndex + 1} total is ${total}.` }))
    } catch (error) {
      console.error("Hit action error:", error)
      recoverFromRoundError("Hit action failed.")
    } finally {
      actionLockRef.current = false
    }
  }

  async function handleStand(): Promise<void> {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const snapshot = gameRef.current
      if (snapshot.phase !== "player_turn" || snapshot.isBusy || snapshot.activeHandIndex === null) return

      const handIndex = snapshot.activeHandIndex
      patchGame((prev) => ({ ...prev, isBusy: true, message: `Hand ${handIndex + 1} stands.` }))

      await moveToNextPlayerHand(handIndex + 1)
    } catch (error) {
      console.error("Stand action error:", error)
      recoverFromRoundError("Stand action failed.")
    } finally {
      actionLockRef.current = false
    }
  }

  async function handleDoubleDown(): Promise<void> {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const snapshot = gameRef.current
      const handIndex = snapshot.activeHandIndex
      if (snapshot.phase !== "player_turn" || snapshot.isBusy || handIndex === null) return

      const hand = snapshot.playerHands[handIndex]
      if (!hand || hand.cards.length !== 2 || snapshot.bank < hand.bet) return

      patchGame((prev) => {
        const nextHands = prev.playerHands.map((targetHand, index) => {
          if (index !== handIndex) return targetHand
          return { ...targetHand, bet: roundMoney(targetHand.bet * 2) }
        })

        return {
          ...prev,
          bank: roundMoney(prev.bank - hand.bet),
          playerHands: nextHands,
          isBusy: true,
          message: `Hand ${handIndex + 1} doubles down.`,
        }
      })

      const dealtCard = await dealCard("player", handIndex)
      if (!dealtCard) throw new Error("Failed to deal card after double down")

      const updatedHand = gameRef.current.playerHands[handIndex]
      if (!updatedHand) throw new Error("Hand not found after double down")

      const total = score(updatedHand.cards)
      if (total > 21) {
        patchGame((prev) => {
          const nextHands = prev.playerHands.map((targetHand, index) =>
            index === handIndex ? { ...targetHand, result: "BUST" as RoundResult } : targetHand,
          )
          return {
            ...prev,
            playerHands: nextHands,
            message: `Hand ${handIndex + 1} busts after double down.`,
          }
        })
      }

      await moveToNextPlayerHand(handIndex + 1)
    } catch (error) {
      console.error("Double down action error:", error)
      recoverFromRoundError("Double down failed.")
    } finally {
      actionLockRef.current = false
    }
  }
  async function handleSplit(): Promise<void> {
    if (actionLockRef.current) return
    actionLockRef.current = true
    try {
      const snapshot = gameRef.current
      const handIndex = snapshot.activeHandIndex
      if (snapshot.phase !== "player_turn" || snapshot.isBusy || handIndex === null) return

      const hand = snapshot.playerHands[handIndex]
      if (!hand || snapshot.playerHands.length > 1 || !canSplit(hand.cards) || snapshot.bank < hand.bet) return

      patchGame((prev) => {
        const targetHand = prev.playerHands[handIndex]
        if (!targetHand || targetHand.cards.length !== 2) return prev

        const firstCard = targetHand.cards[0]
        const secondCard = targetHand.cards[1]
        const splitBet = targetHand.bet

        const firstHand: PlayerHand = {
          ...targetHand,
          cards: [firstCard],
          result: null,
          isSplitHand: true,
        }

        const secondHand: PlayerHand = {
          id: uid(),
          cards: [secondCard],
          bet: splitBet,
          result: null,
          isSplitHand: true,
        }

        return {
          ...prev,
          bank: roundMoney(prev.bank - splitBet),
          playerHands: [firstHand, secondHand],
          activeHandIndex: handIndex,
          isBusy: true,
          message: "Hand split. Dealing split cards.",
        }
      })

      const dealtCard = await dealCard("player", handIndex)
      if (!dealtCard) throw new Error("Failed to deal card after split")

      const updatedHand = gameRef.current.playerHands[handIndex]
      if (!updatedHand) throw new Error("Hand not found after split")

      const total = score(updatedHand.cards)
      const mustStand = updatedHand.cards[0]?.value === "A" || total >= 21

      if (total > 21) {
        patchGame((prev) => {
          const nextHands = prev.playerHands.map((targetHand, index) =>
            index === handIndex ? { ...targetHand, result: "BUST" as RoundResult } : targetHand,
          )
          return { ...prev, playerHands: nextHands }
        })
        await moveToNextPlayerHand(handIndex + 1)
        return
      }

      if (mustStand) {
        await moveToNextPlayerHand(handIndex + 1)
        return
      }

      patchGame((prev) => ({
        ...prev,
        phase: "player_turn",
        activeHandIndex: handIndex,
        isBusy: false,
        message: "Split hand ready. Choose action.",
      }))
    } catch (error) {
      console.error("Split action error:", error)
      recoverFromRoundError("Split action failed.")
    } finally {
      actionLockRef.current = false
    }
  }

  function resetTable(): void {
    patchGame((prev) => {
      const reset = buildInitialState(Math.max(INITIAL_BANK, prev.bank))
      reset.message = "Table reset complete. Place a bet and deal."
      return reset
    })
  }

  const activeHand = useMemo(() => {
    if (game.activeHandIndex === null) return null
    return game.playerHands[game.activeHandIndex] ?? null
  }, [game.activeHandIndex, game.playerHands])

  const canDeal = !["dealing", "player_turn", "dealer_turn"].includes(game.phase)
  const isPlayerTurn = game.phase === "player_turn" && game.activeHandIndex !== null && !game.isBusy
  const dealerVisibleCards = useMemo(
    () => game.dealerCards.filter((card) => !card.isFaceDown),
    [game.dealerCards],
  )
  const dealerDisplayTotal = useMemo(() => {
    if (game.dealerCards.length === 0) return "-"
    if (game.dealerCards.some((card) => card.isFaceDown)) {
      const visible = dealerVisibleCards.length > 0 ? score(dealerVisibleCards) : 0
      return `${visible} + ?`
    }
    return String(score(game.dealerCards))
  }, [dealerVisibleCards, game.dealerCards])

  const canHitAction = isPlayerTurn
  const canStandAction = isPlayerTurn
  const canDoubleAction = Boolean(
    isPlayerTurn && activeHand && activeHand.cards.length === 2 && game.bank >= activeHand.bet,
  )
  const canSplitAction = Boolean(
    isPlayerTurn && activeHand && game.playerHands.length === 1 && canSplit(activeHand.cards) && game.bank >= activeHand.bet,
  )
  const lowPowerMode = !gameMotionProfile.enabled
  const liteMotion =
    lowPowerMode || Boolean(reducedMotion) || gameMotionProfile.speedScale > 1.2

  const recommendedMove = useMemo<RecommendedAction | null>(() => {
    if (!showBasicStrategy || !activeHand || game.phase !== "player_turn") return null
    return getBasicStrategyMove(activeHand.cards, game.dealerCards)
  }, [activeHand, game.dealerCards, game.phase, showBasicStrategy])

  if (bootstrapping) {
    return (
      <main className="min-h-screen px-4 py-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-white/15 bg-slate-900/55 p-6 text-slate-200">
          Loading table...
        </div>
      </main>
    )
  }

  return (
    <main className="safe-bottom-pad relative min-h-screen overflow-hidden px-3 pb-10 pt-4 max-[360px]:px-2 max-[360px]:pt-3 sm:px-5 sm:pt-6">
      {!lowPowerMode ? (
        <div ref={ambientRef} className="casino-ambient" aria-hidden>
          <div className="ambient-vignette" />
          <div className="ambient-light ambient-light-a" />
          <div className="ambient-light ambient-light-b" />
          <div className="ambient-light ambient-light-c" />

          <div className="ambient-shuffle-zone">
            <div className="ambient-shuffle-card shuffle-card is-red">
              <span className="ambient-corner tl">A\u2665</span>
              <span className="ambient-suit">\u2665</span>
              <span className="ambient-corner br">A\u2665</span>
            </div>
            <div className="ambient-shuffle-card shuffle-card" style={{ transform: "translateX(18px)" }}>
              <span className="ambient-corner tl">K\u2660</span>
              <span className="ambient-suit">\u2660</span>
              <span className="ambient-corner br">K\u2660</span>
            </div>
            {gameMotionProfile.cards >= 3 ? (
              <div className="ambient-shuffle-card shuffle-card is-red" style={{ transform: "translateX(-16px)" }}>
                <span className="ambient-corner tl">Q\u2666</span>
                <span className="ambient-suit">\u2666</span>
                <span className="ambient-corner br">Q\u2666</span>
              </div>
            ) : null}
          </div>

          <div className="ambient-chip-zone">
            <div className="ambient-chip ambient-chip-1 bg-chip"><span>100</span></div>
            <div className="ambient-chip ambient-chip-2 bg-chip"><span>50</span></div>
            {gameMotionProfile.chips >= 3 ? <div className="ambient-chip ambient-chip-3 bg-chip"><span>25</span></div> : null}
            {gameMotionProfile.chips >= 4 ? <div className="ambient-chip ambient-chip-4 bg-chip"><span>10</span></div> : null}
            {gameMotionProfile.chips >= 5 ? <div className="ambient-chip ambient-chip-5 bg-chip"><span>5</span></div> : null}
            {gameMotionProfile.chips >= 6 ? <div className="ambient-chip ambient-chip-6 bg-chip"><span>1</span></div> : null}
          </div>

          <div className="ambient-dice-zone">
            <div className="ambient-die ambient-die-a bg-dice" />
            {gameMotionProfile.dice >= 2 ? <div className="ambient-die ambient-die-b bg-dice" /> : null}
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[98vw] flex-col gap-4">
        <header className="glass-card flex flex-wrap items-start justify-between gap-3 rounded-2xl px-3 py-3 max-[360px]:gap-2 max-[360px]:px-2.5 sm:items-center sm:px-4">
          <div>
            <h1 className="font-title text-2xl text-emerald-300 max-[360px]:text-xl sm:text-4xl">MACA Blackjack Table</h1>
            <p className="text-xs text-slate-200 sm:text-sm">Live table flow: deal, hit, stand, double down, split, dealer settle.</p>
            {authError ? <p className="text-xs text-rose-300">{authError}</p> : null}
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 max-[360px]:gap-1.5 sm:w-auto sm:justify-end">
            <Link className="touch-target inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm" href="/lobby">Lobby</Link>
            <Link className="touch-target inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm" href="/game/multiplayer">Multiplayer</Link>
            <Link className="touch-target inline-flex items-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm" href="/profile">Profile</Link>
            <AuthActionButtons
              loginClassName="touch-target inline-flex items-center rounded-lg border border-cyan-300/40 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm"
              logoutClassName="touch-target inline-flex items-center rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 max-[360px]:px-2 max-[360px]:text-[11px] sm:text-sm"
            />
          </div>
        </header>

        <div className="grid gap-4">
          <section className="glass-card glow-ring rounded-3xl p-4 max-[360px]:p-3 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm text-slate-200">Player: <span className="font-semibold text-cyan-300">{user?.username ?? "guest"}</span></p>
                <p className="text-sm text-slate-200">Bank: <span className="font-semibold text-emerald-300">${formatMoney(game.bank)}</span></p>
                <p className="text-xs text-slate-300">Shoe Remaining: {game.shoe.length} cards</p>
              </div>

              <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto sm:justify-end">
                <label className="text-xs text-slate-200 sm:text-sm">
                  Bet ($)
                  <input
                    className="touch-target mt-1 w-24 rounded-lg border border-white/25 bg-white/10 px-2 py-1 text-sm text-white max-[360px]:w-20 max-[360px]:text-xs"
                    disabled={game.phase === "dealing" || game.phase === "player_turn" || game.phase === "dealer_turn"}
                    min={MIN_BET}
                    onChange={(event) => setBetInput(event.target.value)}
                    step="0.5"
                    type="number"
                    value={betInput}
                  />
                </label>

                <button
                  className="touch-target inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60 max-[360px]:px-3 max-[360px]:text-xs"
                  disabled={!canDeal || game.isBusy}
                  onClick={() => {
                    void startRound()
                  }}
                  type="button"
                >
                  Deal Round
                </button>
                <button
                  className="touch-target inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/5 px-3 py-2 text-sm text-white max-[360px]:px-2 max-[360px]:text-xs"
                  onClick={() => setShowBasicStrategy((prev) => !prev)}
                  type="button"
                >
                  Strategy {showBasicStrategy ? "On" : "Off"}
                </button>

                <button
                  className="touch-target inline-flex items-center justify-center rounded-lg border border-amber-300/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100 max-[360px]:px-2 max-[360px]:text-xs"
                  onClick={resetTable}
                  type="button"
                >
                  Reset Table
                </button>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-white/15 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 sm:text-sm">
              {game.message}
            </div>

            <div className="table-scene mt-5">
              <div className="premium-table !min-h-[70vh] sm:!min-h-[74vh]">
                <div className="dealer-arc" />
                <div className="table-text">BLACKJACK PAYS 3 TO 2 | DEALER STANDS ON 17</div>
                <div className="table-glow" />

                <AnimatePresence>
                  {roundOverlay ? (
                    <motion.div
                      className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.08 }}
                      transition={{ duration: 0.45, ease: "easeOut" }}
                    >
                      <div
                        className={`rounded-2xl border px-8 py-5 text-center shadow-2xl backdrop-blur max-[360px]:px-4 max-[360px]:py-3 ${
                          roundOverlay.net > 0
                            ? "border-emerald-200/40 bg-emerald-400/15"
                            : roundOverlay.net < 0
                              ? "border-rose-200/40 bg-rose-400/15"
                              : "border-amber-200/40 bg-amber-400/15"
                        }`}
                      >
                        <p className="font-title text-3xl max-[360px]:text-2xl sm:text-6xl">
                          {roundOverlay.label}
                        </p>
                        <p
                          className={`mt-1 text-lg font-semibold max-[360px]:text-base sm:text-2xl ${
                            roundOverlay.net > 0
                              ? "text-emerald-200"
                              : roundOverlay.net < 0
                                ? "text-rose-200"
                                : "text-amber-100"
                          }`}
                        >
                          {roundOverlay.net >= 0 ? "+" : "-"}$
                          {formatMoney(Math.abs(roundOverlay.net))}
                        </p>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="absolute left-1/2 top-3 max-w-[94%] -translate-x-1/2 rounded-full border border-white/20 bg-black/30 px-4 py-1 text-xs text-slate-100 max-[360px]:px-2.5 max-[360px]:text-[10px] sm:top-4 sm:text-sm">
                  Dealer Total: {dealerDisplayTotal}
                </div>

                <div className="absolute left-1/2 top-14 flex -translate-x-1/2 flex-wrap justify-center gap-2 sm:gap-3">
                  {game.dealerCards.map((card, index) => (
                    <TableCard card={card} index={index} key={card.id} liteMotion={liteMotion} />
                  ))}
                </div>

                <div className="absolute bottom-20 left-1/2 w-[96%] -translate-x-1/2 max-[360px]:bottom-16 max-[360px]:w-[97%] sm:bottom-24">
                  <div className="table-mobile-scroll pr-1 max-[360px]:pr-0">
                    <div className={`grid gap-4 ${game.playerHands.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {game.playerHands.map((hand, handIndex) => {
                        const handTotal = score(hand.cards)
                        const active = game.activeHandIndex === handIndex && game.phase === "player_turn"

                        return (
                          <motion.div
                            animate={{ scale: active ? 1.03 : 1, opacity: active ? 1 : 0.92 }}
                            className="relative rounded-2xl border border-white/20 bg-black/25 p-2 max-[360px]:p-1.5 sm:p-3"
                            key={hand.id}
                            transition={{ type: "spring", stiffness: 220, damping: 20 }}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2 text-xs max-[360px]:text-[11px] sm:text-sm">
                              <span className="text-slate-200">Hand {handIndex + 1} {hand.isSplitHand ? "(Split)" : ""}</span>
                              <span className={toResultTone(hand.result)}>{hand.result ?? "Playing"}</span>
                            </div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="rounded-full border border-cyan-200/35 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-100 max-[360px]:px-2 max-[360px]:text-[10px] sm:text-xs">
                                TOTAL {hand.cards.length ? score(hand.cards) : "-"}
                              </span>
                              <span className="rounded-full border border-white/25 bg-black/20 px-2.5 py-1 text-[11px] text-slate-200 max-[360px]:px-2 max-[360px]:text-[10px] sm:text-xs">
                                BET ${formatMoney(hand.bet)}
                              </span>
                            </div>

                            <div className="flex flex-wrap justify-center gap-1 sm:gap-2">
                              {hand.cards.map((card, cardIndex) => (
                                <TableCard card={card} index={cardIndex} key={card.id} liteMotion={liteMotion} />
                              ))}
                            </div>

                            <div className="mt-2 flex items-center justify-between text-xs text-slate-300 max-[360px]:text-[10px] sm:text-sm">
                              <span>Cards: {hand.cards.length}</span>
                              <span>Live Total: {handTotal}</span>
                            </div>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                <div className="chip-stack chip-a"><span>100</span></div>
                <div className="chip-stack chip-b"><span>25</span></div>
                <div className="chip-stack chip-c"><span>10</span></div>

                <div className="dice-cube bg-dice">
                  <div className="dice-face front">
                    <div className="dice-grid">
                      {[0, 2, 4, 6, 8].map((dot) => (
                        <span className="dice-dot is-visible" key={`front-${dot}`} style={{ gridArea: `${Math.floor(dot / 3) + 1} / ${(dot % 3) + 1}` }} />
                      ))}
                    </div>
                  </div>
                  <div className="dice-face back" />
                  <div className="dice-face left" />
                  <div className="dice-face right" />
                  <div className="dice-face top" />
                  <div className="dice-face bottom" />
                </div>
              </div>
            </div>

            <div className="safe-sticky-bottom sticky z-30 mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/20 bg-slate-950/70 p-2 backdrop-blur max-[360px]:gap-1.5 max-[360px]:p-1.5 sm:static sm:z-auto sm:grid-cols-5 sm:border-0 sm:bg-transparent sm:p-0">
              <button
                className={`touch-target rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs ${recommendedMove === "hit" ? "bg-yellow-300" : "bg-emerald-300"}`}
                disabled={!canHitAction}
                onClick={() => {
                  void handleHit()
                }}
                type="button"
              >
                Hit
              </button>

              <button
                className={`touch-target rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs ${recommendedMove === "stand" ? "bg-yellow-300" : "bg-cyan-300"}`}
                disabled={!canStandAction}
                onClick={() => {
                  void handleStand()
                }}
                type="button"
              >
                Stand
              </button>

              <button
                className={`touch-target rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs ${recommendedMove === "doubleDown" ? "bg-yellow-300" : "bg-amber-300"}`}
                disabled={!canDoubleAction}
                onClick={() => {
                  void handleDoubleDown()
                }}
                type="button"
              >
                Double
              </button>

              <button
                className={`touch-target rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs ${recommendedMove === "split" ? "bg-yellow-300" : "bg-violet-300"}`}
                disabled={!canSplitAction}
                onClick={() => {
                  void handleSplit()
                }}
                type="button"
              >
                Split
              </button>

              <button
                className="touch-target rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition disabled:opacity-45 max-[360px]:px-2 max-[360px]:text-xs"
                disabled={game.phase !== "game_over" && game.phase !== "settled"}
                onClick={resetTable}
                type="button"
              >
                Restart
              </button>
            </div>

            {recommendedMove ? (
              <p className="mt-3 text-xs text-amber-200 sm:text-sm">
                Strategy hint: <span className="font-semibold uppercase">{recommendedMove}</span>
              </p>
            ) : null}
          </section>

          <aside className="glass-card rounded-3xl p-4 max-[360px]:p-3 sm:p-5">
            <h2 className="font-title text-2xl text-white">Round Log</h2>
            <p className="mt-1 text-xs text-slate-300 sm:text-sm">Latest 12 rounds on this table session.</p>

            <div className="mt-4 space-y-2">
              {game.history.length === 0 ? (
                <p className="text-sm text-slate-300">No rounds completed yet.</p>
              ) : (
                game.history.map((entry) => (
                  <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={entry.id}>
                    <p className="text-sm text-white">#{entry.roundNumber} {entry.outcome}</p>
                    <p className={`text-sm ${entry.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      Net {entry.net >= 0 ? "+" : "-"}${formatMoney(Math.abs(entry.net))}
                    </p>
                    <p className="text-xs text-slate-300">Player {entry.playerScores} vs Dealer {entry.dealerScore}</p>
                    <p className="text-xs text-slate-400">{entry.at}</p>
                  </article>
                ))
              )}
            </div>

            <div className="mt-4 rounded-xl border border-cyan-300/30 bg-cyan-500/10 p-3 text-xs text-cyan-100 sm:text-sm">
              Rules:
              <p>1. Dealer stands on all 17.</p>
              <p>2. Blackjack pays 3:2.</p>
              <p>3. Split once, no re-split.</p>
              <p>4. Double after split is allowed.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
