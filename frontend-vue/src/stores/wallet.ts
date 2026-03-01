import { defineStore } from "pinia"

import {
  WalletOverview,
  getWalletOverview,
  linkWallet,
  listWalletTransactions,
  requestWithdrawal,
  verifyDeposit,
} from "../lib/api"
import { useAuthStore } from "./auth"

type WalletState = {
  overview: WalletOverview | null
  loading: boolean
  saving: boolean
  error: string | null
  success: string | null
}

export const useWalletStore = defineStore("wallet", {
  state: (): WalletState => ({
    overview: null,
    loading: false,
    saving: false,
    error: null,
    success: null,
  }),
  getters: {
    balance: (state) => state.overview?.token_balance ?? 0,
    assets: (state) => state.overview?.supported_assets ?? [],
    links: (state) => state.overview?.linked_wallets ?? [],
    txs: (state) => state.overview?.recent_transactions ?? [],
  },
  actions: {
    clearMessages() {
      this.error = null
      this.success = null
    },
    async refresh() {
      const auth = useAuthStore()
      if (!auth.token) return
      this.loading = true
      this.error = null
      try {
        this.overview = await getWalletOverview(auth.token)
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load wallet"
      } finally {
        this.loading = false
      }
    },
    async refreshTransactions(limit = 50) {
      const auth = useAuthStore()
      if (!auth.token) return
      this.loading = true
      this.error = null
      try {
        const txs = await listWalletTransactions(auth.token, limit)
        if (!this.overview) {
          await this.refresh()
          return
        }
        this.overview = { ...this.overview, recent_transactions: txs }
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load transactions"
      } finally {
        this.loading = false
      }
    },
    async addWalletLink(payload: { chain: string; wallet_address: string; label?: string }) {
      const auth = useAuthStore()
      if (!auth.token) return
      this.saving = true
      this.clearMessages()
      try {
        await linkWallet(auth.token, payload)
        this.success = "Wallet linked."
        await this.refresh()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to link wallet"
      } finally {
        this.saving = false
      }
    },
    async addDeposit(payload: {
      chain: string
      asset: string
      tx_hash: string
      crypto_amount: number
      usd_rate?: number
      wallet_address?: string
    }) {
      const auth = useAuthStore()
      if (!auth.token) return
      this.saving = true
      this.clearMessages()
      try {
        const result = await verifyDeposit(auth.token, payload)
        this.success = `Deposit credited: +${result.credited_tokens.toFixed(2)} tokens`
        await this.refresh()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Deposit verification failed"
      } finally {
        this.saving = false
      }
    },
    async withdraw(payload: {
      chain: string
      asset: string
      destination_address: string
      token_amount: number
      usd_rate?: number
    }) {
      const auth = useAuthStore()
      if (!auth.token) return
      this.saving = true
      this.clearMessages()
      try {
        const result = await requestWithdrawal(auth.token, payload)
        this.success = `Withdrawal requested: ${result.requested_tokens.toFixed(2)} tokens`
        await this.refresh()
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Withdrawal request failed"
      } finally {
        this.saving = false
      }
    },
  },
})
