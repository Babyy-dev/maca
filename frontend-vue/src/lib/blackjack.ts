export type Suit = "C" | "D" | "H" | "S"
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A"
export type Card = {
  id: string
  value: Rank
  suit: Suit
  isFaceDown?: boolean
}

export type HandResult = "BUST" | "WIN" | "LOSE" | "PUSH" | "BLACKJACK"

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

export function createDeck(): Card[] {
  const values: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]
  const suits: Suit[] = ["C", "D", "H", "S"]
  const deck: Card[] = []
  values.forEach((value) => {
    suits.forEach((suit) => {
      deck.push({ id: uid(), value, suit, isFaceDown: false })
    })
  })
  return deck
}

export function shuffle<T>(items: T[]): T[] {
  const cards = items.slice()
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1))
    const randomCard = cards[randomIndex]
    cards[randomIndex] = cards[i]
    cards[i] = randomCard
  }
  return cards
}

export function createShoe(deckCount = 6): Card[] {
  let shoe: Card[] = []
  for (let i = 0; i < deckCount; i += 1) {
    shoe = shoe.concat(shuffle(createDeck()))
  }
  return shuffle(shoe)
}

function numericalValue(card: Card | (Card & { value: string })): number {
  if (FACE_VALUES[card.value] !== undefined) {
    return FACE_VALUES[card.value]
  }
  return Number.parseInt(card.value, 10)
}

function makeAcesLow(card: Card): Card & { value: string } {
  if (card.value !== "A") return card
  return { ...card, value: "a" }
}

function makeOneAceHigh(cards: Array<Card & { value: string }>): Array<Card & { value: string }> {
  const next = cards.slice()
  const index = next.findIndex((card) => card.value === "a")
  if (index >= 0) {
    next[index] = { ...next[index], value: "A" }
  }
  return next
}

export function score(cardsToTotal: Card[], getHighTotal = false): number {
  const cards = cardsToTotal.map(makeAcesLow)
  const lowTotal = cards.reduce((sum, card) => sum + numericalValue(card), 0)
  const highTotal = makeOneAceHigh(cards).reduce((sum, card) => sum + numericalValue(card), 0)
  if (highTotal <= 21 || getHighTotal) return highTotal
  return lowTotal
}

export function isSoftHand(cards: Card[]): boolean {
  if (!cards.some((card) => card.value === "A")) return false
  return score(cards, false) === score(cards, true)
}

export function canSplit(cards: Card[]): boolean {
  if (cards.length !== 2) return false
  const toSplitValue = (card: Card): number => {
    if (card.value === "A") return 11
    if (card.value === "10" || card.value === "J" || card.value === "Q" || card.value === "K") {
      return 10
    }
    return Number.parseInt(card.value, 10)
  }
  return toSplitValue(cards[0]) === toSplitValue(cards[1])
}

export function getBasicStrategyMove(params: {
  playerCards: Card[]
  dealerCards: Card[]
}): "hit" | "stand" | "doubleDown" | "split" {
  const { playerCards, dealerCards } = params
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
    const dealerUp = dealerCards.find((card) => !card.isFaceDown)
    if (dealerUp) {
      if (handValue === "A" || handValue === "8") return "split"
      if (handValue !== "5") {
        const target = splitTable[handValue]
        if (target && target.includes(dealerUp.value)) {
          return "split"
        }
      }
    }
  }

  if (isSoftHand(playerCards)) {
    const moveTable: Record<number, string> = {
      13: "  hhhddhhhhh",
      14: "  hhhddhhhhh",
      15: "  hhdddhhhhh",
      16: "  hhdddhhhhh",
      17: "  hddddhhhhh",
      18: "  sddddsshhh",
    }
    const moveMap: Record<string, "hit" | "stand" | "doubleDown"> = {
      h: "hit",
      s: "stand",
      d: "doubleDown",
    }
    const playerScore = score(playerCards)
    const dealerUp = dealerCards.find((card) => !card.isFaceDown)
    if (!dealerUp || !moveTable[playerScore]) return "hit"
    const key = moveTable[playerScore].charAt(score([dealerUp]))
    const move = moveMap[key] ?? "hit"
    if (move === "doubleDown" && playerCards.length > 2) return "hit"
    return move
  }

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
  const moveMap: Record<string, "hit" | "stand" | "doubleDown"> = {
    h: "hit",
    s: "stand",
    d: "doubleDown",
  }
  const hardScore = score(playerCards)
  if (hardScore <= 8) return "hit"
  if (hardScore >= 17) return "stand"
  const dealerUp = dealerCards.find((card) => !card.isFaceDown)
  if (!dealerUp || !moveTable[hardScore]) return "hit"
  const key = moveTable[hardScore].charAt(score([dealerUp]))
  const move = moveMap[key] ?? "hit"
  if (move === "doubleDown" && playerCards.length > 2) return "hit"
  return move
}
