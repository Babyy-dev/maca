import { defineStore } from "pinia"

import {
  Card,
  HandResult,
  canSplit,
  createShoe,
  getBasicStrategyMove,
  score,
} from "../lib/blackjack"

type Phase = "idle" | "dealing" | "player_turn" | "dealer_turn" | "settled" | "game_over"

type Hand = {
  id: string
  cards: Card[]
  bets: number[]
  result: HandResult | null
  isSplitHand: boolean
}

type RoundBanner = {
  label: "WIN" | "LOSE" | "PUSH" | "BLACKJACK"
  net: number
}

type SingleState = {
  settings: {
    deckCount: number
    minimumBet: number
    shuffleAfterPercent: number
    startingBank: number
  }
  bank: number
  shoe: Card[]
  dealer: Hand
  players: Hand[]
  activeHandIndex: number | null
  phase: Phase
  isDealing: boolean
  message: string
  overlay: RoundBanner | null
  actionLock: boolean
}

function uid(): string {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createHand(isSplit = false): Hand {
  return {
    id: uid(),
    cards: [],
    bets: [],
    result: null,
    isSplitHand: isSplit,
  }
}

function handBet(hand: Hand): number {
  return hand.bets.reduce((sum, value) => sum + value, 0)
}

function canTakeAction(state: SingleState): boolean {
  return state.phase === "player_turn" && !state.isDealing && !state.actionLock
}

export const useSinglePlayerStore = defineStore("single-player", {
  state: (): SingleState => ({
    settings: {
      deckCount: 6,
      minimumBet: 1,
      shuffleAfterPercent: 0.75,
      startingBank: 250,
    },
    bank: 250,
    shoe: createShoe(6),
    dealer: createHand(false),
    players: [createHand(false)],
    activeHandIndex: null,
    phase: "idle",
    isDealing: false,
    message: "Place your bet and start a round.",
    overlay: null,
    actionLock: false,
  }),
  getters: {
    activeHand: (state) =>
      state.activeHandIndex === null ? null : state.players[state.activeHandIndex] ?? null,
    dealerTotalLabel: (state) => {
      if (state.dealer.cards.length === 0) return "-"
      if (state.dealer.cards.some((card) => card.isFaceDown)) {
        const visible = state.dealer.cards.filter((card) => !card.isFaceDown)
        return `${score(visible)} + ?`
      }
      return String(score(state.dealer.cards))
    },
    canHit: (state) => canTakeAction(state),
    canStand: (state) => canTakeAction(state),
    canDouble: (state) => {
      if (!canTakeAction(state)) return false
      const hand = state.activeHandIndex === null ? null : state.players[state.activeHandIndex]
      if (!hand) return false
      return hand.cards.length === 2 && state.bank >= handBet(hand)
    },
    canSplit: (state) => {
      if (!canTakeAction(state)) return false
      if (state.players.length > 1) return false
      const hand = state.activeHandIndex === null ? null : state.players[state.activeHandIndex]
      if (!hand) return false
      return canSplit(hand.cards) && state.bank >= handBet(hand)
    },
    strategyHint: (state) => {
      if (state.activeHandIndex === null || state.phase !== "player_turn") return null
      const hand = state.players[state.activeHandIndex]
      if (!hand) return null
      return getBasicStrategyMove({ playerCards: hand.cards, dealerCards: state.dealer.cards })
    },
  },
  actions: {
    resetGame() {
      this.bank = this.settings.startingBank
      this.shoe = createShoe(this.settings.deckCount)
      this.resetRound("Game reset. Place your bet and deal.")
    },
    resetRound(message = "Round reset.") {
      this.dealer = createHand(false)
      this.players = [createHand(false)]
      this.activeHandIndex = null
      this.phase = "idle"
      this.isDealing = false
      this.actionLock = false
      this.message = message
      this.overlay = null
    },
    drawCard(isFaceDown = false): Card {
      if (this.shoe.length === 0) {
        this.shoe = createShoe(this.settings.deckCount)
      }
      const card = this.shoe.shift()
      if (!card) {
        throw new Error("Shoe is empty")
      }
      return { ...card, isFaceDown }
    },
    ensureShoe() {
      const used = 1 - this.shoe.length / (this.settings.deckCount * 52)
      if (used >= this.settings.shuffleAfterPercent) {
        this.shoe = createShoe(this.settings.deckCount)
      }
    },
    async startRound(bet: number) {
      if (this.phase === "dealing" || this.phase === "player_turn" || this.phase === "dealer_turn") return
      if (this.phase === "game_over") {
        this.message = "Game over. Reset bankroll to continue."
        return
      }
      const normalized = Number.isFinite(bet) ? Math.floor(bet) : this.settings.minimumBet
      const safeBet = Math.max(this.settings.minimumBet, normalized)
      if (this.bank < safeBet) {
        this.message = "Insufficient bankroll for this bet."
        return
      }

      this.ensureShoe()
      this.overlay = null
      this.phase = "dealing"
      this.isDealing = true
      this.message = "Dealing cards..."
      this.dealer = createHand(false)
      this.players = [createHand(false)]
      this.players[0].bets = [safeBet]
      this.bank -= safeBet

      const sequence: Array<"player" | "dealer" | "player" | "dealer"> = [
        "player",
        "dealer",
        "player",
        "dealer",
      ]
      for (const target of sequence) {
        if (target === "player") {
          this.players[0].cards.push(this.drawCard(false))
        } else {
          this.dealer.cards.push(this.drawCard(this.dealer.cards.length === 0))
        }
        await wait(170)
      }
      this.isDealing = false
      this.phase = "player_turn"
      this.activeHandIndex = 0
      this.message = "Your turn."
      this.evaluateImmediateResults()
    },
    evaluateImmediateResults() {
      const player = this.players[0]
      const playerTotal = score(player.cards)
      const dealerVisible = this.dealer.cards.filter((card) => !card.isFaceDown)
      const dealerVisibleTotal = score(dealerVisible)
      if (playerTotal === 21 && player.cards.length === 2) {
        if (dealerVisibleTotal === 11) {
          this.dealer.cards = this.dealer.cards.map((card) => ({ ...card, isFaceDown: false }))
          const dealerTotal = score(this.dealer.cards)
          player.result = dealerTotal === 21 ? "PUSH" : "BLACKJACK"
        } else {
          player.result = "BLACKJACK"
          this.dealer.cards = this.dealer.cards.map((card) => ({ ...card, isFaceDown: false }))
        }
      }
      if (player.result) {
        void this.settleRound()
      }
    },
    async hit() {
      if (!this.canHit) return
      this.actionLock = true
      const hand = this.activeHand
      if (!hand || this.activeHandIndex === null) {
        this.actionLock = false
        return
      }
      hand.cards.push(this.drawCard(false))
      await wait(130)
      const total = score(hand.cards)
      if (total > 21) {
        hand.result = "BUST"
        await this.advanceTurn()
      }
      this.actionLock = false
    },
    async stand() {
      if (!this.canStand) return
      this.actionLock = true
      await this.advanceTurn()
      this.actionLock = false
    },
    async doubleDown() {
      if (!this.canDouble) return
      this.actionLock = true
      const hand = this.activeHand
      if (!hand) {
        this.actionLock = false
        return
      }
      const amount = handBet(hand)
      this.bank -= amount
      hand.bets.push(amount)
      hand.cards.push(this.drawCard(false))
      await wait(140)
      const total = score(hand.cards)
      if (total > 21) {
        hand.result = "BUST"
      }
      await this.advanceTurn()
      this.actionLock = false
    },
    async splitHand() {
      if (!this.canSplit) return
      this.actionLock = true
      const source = this.activeHand
      if (!source || source.cards.length !== 2) {
        this.actionLock = false
        return
      }
      const firstCard = source.cards[0]
      const secondCard = source.cards[1]
      const wager = handBet(source)

      this.bank -= wager
      source.cards = [firstCard]
      const split = createHand(true)
      split.cards = [secondCard]
      split.bets = [wager]
      source.isSplitHand = true
      this.players.push(split)
      source.cards.push(this.drawCard(false))
      split.cards.push(this.drawCard(false))
      await wait(160)
      this.actionLock = false
    },
    async advanceTurn() {
      if (this.activeHandIndex === null) return
      const current = this.players[this.activeHandIndex]
      if (current && !current.result && score(current.cards) > 21) {
        current.result = "BUST"
      }

      if (this.activeHandIndex < this.players.length - 1) {
        this.activeHandIndex += 1
        this.message = `Hand ${this.activeHandIndex + 1} turn.`
      } else {
        this.activeHandIndex = null
        await this.playDealer()
      }
    },
    async playDealer() {
      this.phase = "dealer_turn"
      this.isDealing = true
      this.message = "Dealer turn..."
      this.dealer.cards = this.dealer.cards.map((card) => ({ ...card, isFaceDown: false }))
      await wait(220)

      while (score(this.dealer.cards) < 17 && this.players.some((hand) => !hand.result)) {
        this.dealer.cards.push(this.drawCard(false))
        await wait(180)
      }
      this.isDealing = false
      await this.settleRound()
    },
    async settleRound() {
      let payout = 0
      let net = 0
      const dealerTotal = score(this.dealer.cards)

      this.players = this.players.map((hand) => {
        const bet = handBet(hand)
        const total = score(hand.cards)
        if (!hand.result) {
          if (dealerTotal > 21 || total > dealerTotal) hand.result = "WIN"
          else if (total < dealerTotal) hand.result = "LOSE"
          else hand.result = "PUSH"
        }

        if (hand.result === "BLACKJACK") {
          payout += bet * 2.5
          net += bet * 1.5
        } else if (hand.result === "WIN") {
          payout += bet * 2
          net += bet
        } else if (hand.result === "PUSH") {
          payout += bet
        } else {
          net -= bet
        }
        return hand
      })

      this.bank += payout
      this.phase = this.bank < this.settings.minimumBet ? "game_over" : "settled"
      if (this.phase === "game_over") {
        this.message = "Game over. Reset to continue."
      } else {
        this.message =
          net >= 0
            ? `Round won +${net.toFixed(2)}. Press Deal Next Round.`
            : `Round lost ${net.toFixed(2)}. Press Deal Next Round.`
      }

      const hasBlackjack = this.players.some((hand) => hand.result === "BLACKJACK")
      this.overlay = {
        label: hasBlackjack ? "BLACKJACK" : net > 0 ? "WIN" : net < 0 ? "LOSE" : "PUSH",
        net,
      }
    },
  },
})
