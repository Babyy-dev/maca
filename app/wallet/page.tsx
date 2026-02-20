"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { FormEvent, useEffect, useMemo, useState } from "react"

import {
  ApiError,
  AuthUser,
  WalletOverview,
  WalletTransaction,
  decideWithdrawal,
  getMe,
  getStoredToken,
  getWalletOverview,
  linkWallet,
  listPendingWithdrawals,
  listWalletTransactions,
  requestWalletWithdrawal,
  verifyWalletDeposit,
} from "@/lib/maca-api"

const DEFAULT_CHAINS = ["BTC", "ETH", "SOL"]

function formatMoney(value: number): string {
  return Number(value || 0).toFixed(2)
}

export default function WalletPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [walletOverview, setWalletOverview] = useState<WalletOverview | null>(null)
  const [transactions, setTransactions] = useState<WalletTransaction[]>([])
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WalletTransaction[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isWorking, setIsWorking] = useState(false)

  const [linkChain, setLinkChain] = useState("BTC")
  const [linkAddress, setLinkAddress] = useState("")
  const [linkLabel, setLinkLabel] = useState("")

  const [depositChain, setDepositChain] = useState("BTC")
  const [depositTxHash, setDepositTxHash] = useState("")
  const [depositAmount, setDepositAmount] = useState("")
  const [depositUsdRate, setDepositUsdRate] = useState("")
  const [depositWalletAddress, setDepositWalletAddress] = useState("")

  const [withdrawChain, setWithdrawChain] = useState("BTC")
  const [withdrawDestination, setWithdrawDestination] = useState("")
  const [withdrawTokenAmount, setWithdrawTokenAmount] = useState("")
  const [withdrawUsdRate, setWithdrawUsdRate] = useState("")
  const [decisionReasonById, setDecisionReasonById] = useState<Record<string, string>>({})
  const [decisionTxHashById, setDecisionTxHashById] = useState<Record<string, string>>({})

  const canUseAdminTools = useMemo(() => {
    if (!user) return false
    return user.role === "mod" || user.role === "admin" || user.role === "super"
  }, [user])

  const availableChains = useMemo(() => {
    const fromApi = walletOverview?.supported_assets.map((asset) => asset.chain) ?? []
    const unique = Array.from(new Set([...fromApi, ...DEFAULT_CHAINS]))
    return unique.length > 0 ? unique : DEFAULT_CHAINS
  }, [walletOverview])

  useEffect(() => {
    const stored = getStoredToken()
    if (!stored) {
      router.replace("/auth/login")
      return
    }
    setToken(stored)
    const authToken = stored

    async function bootstrap() {
      try {
        const me = await getMe(authToken)
        setUser(me)
        await refreshAll(authToken, me)
      } catch (caught) {
        const text = caught instanceof ApiError ? caught.message : "Failed to load wallet"
        setMessage(text)
      } finally {
        setIsLoading(false)
      }
    }

    bootstrap()
  }, [router])

  async function refreshAll(authToken: string, authUser?: AuthUser | null) {
    const currentUser = authUser ?? user
    const [overviewData, transactionData] = await Promise.all([
      getWalletOverview(authToken),
      listWalletTransactions(authToken, { limit: 80 }),
    ])
    setWalletOverview(overviewData)
    setTransactions(transactionData)

    if (currentUser && (currentUser.role === "admin" || currentUser.role === "super")) {
      const pending = await listPendingWithdrawals(authToken, { limit: 120 })
      setPendingWithdrawals(pending)
    } else {
      setPendingWithdrawals([])
    }
  }

  async function onRefresh() {
    if (!token) return
    setMessage(null)
    try {
      const me = await getMe(token)
      setUser(me)
      await refreshAll(token, me)
      setMessage("Wallet data refreshed.")
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Refresh failed"
      setMessage(text)
    }
  }

  async function onLinkWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setIsWorking(true)
    setMessage(null)
    try {
      await linkWallet(token, {
        chain: linkChain,
        wallet_address: linkAddress.trim(),
        label: linkLabel.trim() || undefined,
      })
      setLinkAddress("")
      setLinkLabel("")
      await refreshAll(token)
      setMessage(`${linkChain} wallet linked.`)
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Wallet linking failed"
      setMessage(text)
    } finally {
      setIsWorking(false)
    }
  }

  async function onVerifyDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const cryptoAmount = Number(depositAmount)
    if (!Number.isFinite(cryptoAmount) || cryptoAmount <= 0) {
      setMessage("Deposit amount must be greater than 0.")
      return
    }
    const usdRate = depositUsdRate.trim() ? Number(depositUsdRate) : undefined
    if (typeof usdRate === "number" && (!Number.isFinite(usdRate) || usdRate <= 0)) {
      setMessage("Deposit USD rate must be greater than 0.")
      return
    }

    setIsWorking(true)
    setMessage(null)
    try {
      const result = await verifyWalletDeposit(token, {
        chain: depositChain,
        asset: depositChain,
        tx_hash: depositTxHash.trim(),
        crypto_amount: cryptoAmount,
        usd_rate: usdRate,
        wallet_address: depositWalletAddress.trim() || undefined,
      })
      setDepositTxHash("")
      setDepositAmount("")
      setDepositUsdRate("")
      setDepositWalletAddress("")
      await refreshAll(token)
      setMessage(
        `Deposit verified via ${result.verification.provider}. Credited ${formatMoney(result.credited_tokens)} tokens (${result.verification.confirmations}/${result.verification.required_confirmations} confirmations).`,
      )
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Deposit verification failed"
      setMessage(text)
    } finally {
      setIsWorking(false)
    }
  }

  async function onRequestWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    const tokenAmount = Number(withdrawTokenAmount)
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      setMessage("Withdrawal token amount must be greater than 0.")
      return
    }
    const usdRate = withdrawUsdRate.trim() ? Number(withdrawUsdRate) : undefined
    if (typeof usdRate === "number" && (!Number.isFinite(usdRate) || usdRate <= 0)) {
      setMessage("Withdrawal USD rate must be greater than 0.")
      return
    }

    setIsWorking(true)
    setMessage(null)
    try {
      await requestWalletWithdrawal(token, {
        chain: withdrawChain,
        asset: withdrawChain,
        destination_address: withdrawDestination.trim(),
        token_amount: tokenAmount,
        usd_rate: usdRate,
      })
      setWithdrawDestination("")
      setWithdrawTokenAmount("")
      setWithdrawUsdRate("")
      await refreshAll(token)
      setMessage("Withdrawal request submitted and pending admin approval.")
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Withdrawal request failed"
      setMessage(text)
    } finally {
      setIsWorking(false)
    }
  }

  async function onDecideWithdrawal(transactionId: string, approve: boolean) {
    if (!token) return
    setIsWorking(true)
    setMessage(null)
    try {
      await decideWithdrawal(token, transactionId, {
        approve,
        chain_tx_hash: decisionTxHashById[transactionId]?.trim() || undefined,
        reason: decisionReasonById[transactionId]?.trim() || undefined,
      })
      await refreshAll(token)
      setMessage(approve ? "Withdrawal approved." : "Withdrawal rejected.")
    } catch (caught) {
      const text = caught instanceof ApiError ? caught.message : "Withdrawal decision failed"
      setMessage(text)
    } finally {
      setIsWorking(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-slate-200">Loading wallet...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-slate-900/55 p-4 backdrop-blur">
          <div>
            <h1 className="font-title text-3xl text-emerald-300 sm:text-5xl">Wallet Gateway</h1>
            <p className="text-sm text-slate-200">
              Milestone 8: wallet linking, BTC/ETH/SOL deposits, 1:1 USD tokens, and withdrawal approvals.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              onClick={() => {
                onRefresh().catch(() => setMessage("Refresh failed"))
              }}
              type="button"
            >
              Refresh
            </button>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/lobby"
            >
              Lobby
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/profile"
            >
              Profile
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/leaderboard"
            >
              Leaderboard
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/referrals"
            >
              Referrals
            </Link>
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/spectator"
            >
              Spectator
            </Link>
            {canUseAdminTools ? (
              <Link
                className="rounded-lg border border-orange-300/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200"
                href="/admin"
              >
                Admin
              </Link>
            ) : null}
            <Link
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
              href="/"
            >
              Landing
            </Link>
          </div>
        </header>

        {message ? <p className="text-sm text-amber-200">{message}</p> : null}

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Balance</h2>
            <p className="mt-3 text-sm text-slate-300">
              User: <span className="text-cyan-300">{user?.username}</span>
            </p>
            <p className="text-sm text-slate-300">
              Role: <span className="text-cyan-300">{user?.role}</span>
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Tokens:{" "}
              <span className="text-emerald-300">
                {formatMoney(walletOverview?.token_balance ?? user?.balance ?? 0)}{" "}
                {walletOverview?.token_symbol ?? "MCT"}
              </span>
            </p>
            <p className="text-sm text-slate-300">
              1 token = ${formatMoney(walletOverview?.usd_per_token ?? 1)} USD
            </p>
            <p className="mt-2 text-sm text-slate-300">
              Pending withdrawals:{" "}
              <span className="text-amber-300">{walletOverview?.pending_withdrawals ?? 0}</span>
            </p>
          </article>

          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Supported Assets</h2>
            <div className="mt-3 space-y-2">
              {(walletOverview?.supported_assets ?? []).map((asset) => (
                <div className="rounded-lg border border-white/15 bg-white/5 p-3" key={`${asset.chain}-${asset.asset}`}>
                  <p className="text-sm text-white">
                    {asset.asset} ({asset.chain})
                  </p>
                  <p className="text-xs text-slate-300">
                    Rate: ${formatMoney(asset.usd_rate)} | Min confirmations: {asset.min_confirmations}
                  </p>
                </div>
              ))}
            </div>
          </article>

          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Linked Wallets</h2>
            <div className="mt-3 space-y-2">
              {walletOverview?.linked_wallets.length ? (
                walletOverview.linked_wallets.map((wallet) => (
                  <div className="rounded-lg border border-white/15 bg-white/5 p-3" key={wallet.id}>
                    <p className="text-sm text-white">
                      {wallet.chain} {wallet.label ? `- ${wallet.label}` : ""}
                    </p>
                    <p className="break-all text-xs text-slate-300">{wallet.wallet_address}</p>
                    <p className="text-[11px] text-slate-400">
                      Linked: {new Date(wallet.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-300">No linked wallets yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Link Wallet</h2>
            <form className="mt-3 space-y-3" onSubmit={onLinkWallet}>
              <select
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setLinkChain(event.target.value)}
                value={linkChain}
              >
                {availableChains.map((chain) => (
                  <option key={`link-${chain}`} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setLinkAddress(event.target.value)}
                placeholder={`${linkChain} wallet address`}
                value={linkAddress}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setLinkLabel(event.target.value)}
                placeholder="Label (optional)"
                value={linkLabel}
              />
              <button
                className="w-full rounded-lg bg-gradient-to-r from-cyan-300 to-sky-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
                disabled={isWorking}
                type="submit"
              >
                Link Wallet
              </button>
            </form>
          </article>

          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Verify Deposit</h2>
            <form className="mt-3 space-y-3" onSubmit={onVerifyDeposit}>
              <select
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setDepositChain(event.target.value)}
                value={depositChain}
              >
                {availableChains.map((chain) => (
                  <option key={`dep-${chain}`} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setDepositTxHash(event.target.value)}
                placeholder="On-chain transaction hash"
                value={depositTxHash}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setDepositAmount(event.target.value)}
                placeholder={`${depositChain} amount`}
                type="number"
                value={depositAmount}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setDepositUsdRate(event.target.value)}
                placeholder="USD rate override (optional)"
                type="number"
                value={depositUsdRate}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setDepositWalletAddress(event.target.value)}
                placeholder="Wallet address (optional)"
                value={depositWalletAddress}
              />
              <button
                className="w-full rounded-lg bg-gradient-to-r from-emerald-300 to-lime-400 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
                disabled={isWorking}
                type="submit"
              >
                Verify & Credit
              </button>
            </form>
          </article>

          <article className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Request Withdrawal</h2>
            <form className="mt-3 space-y-3" onSubmit={onRequestWithdrawal}>
              <select
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setWithdrawChain(event.target.value)}
                value={withdrawChain}
              >
                {availableChains.map((chain) => (
                  <option key={`with-${chain}`} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setWithdrawDestination(event.target.value)}
                placeholder={`${withdrawChain} destination address`}
                value={withdrawDestination}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setWithdrawTokenAmount(event.target.value)}
                placeholder="Token amount"
                type="number"
                value={withdrawTokenAmount}
              />
              <input
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white"
                onChange={(event) => setWithdrawUsdRate(event.target.value)}
                placeholder="USD rate override (optional)"
                type="number"
                value={withdrawUsdRate}
              />
              <button
                className="w-full rounded-lg bg-gradient-to-r from-orange-300 to-rose-500 px-4 py-2 font-semibold text-slate-900 disabled:opacity-60"
                disabled={isWorking}
                type="submit"
              >
                Submit Request
              </button>
            </form>
          </article>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <h2 className="font-title text-3xl text-white">Transaction Log</h2>
          <div className="mt-3 space-y-2">
            {transactions.length ? (
              transactions.map((entry) => (
                <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={entry.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-white">
                      {entry.tx_type.toUpperCase()} {entry.chain} | {entry.status.toUpperCase()}
                    </p>
                    <p className="text-xs text-slate-300">{new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                  <p className="text-xs text-slate-200">
                    Tokens: {formatMoney(entry.token_amount)} | USD: ${formatMoney(entry.usd_amount)} | Crypto:{" "}
                    {entry.crypto_amount} {entry.asset}
                  </p>
                  {entry.tx_hash ? <p className="break-all text-[11px] text-slate-400">TX: {entry.tx_hash}</p> : null}
                  {entry.failure_reason ? <p className="text-xs text-rose-300">{entry.failure_reason}</p> : null}
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-300">No wallet transactions yet.</p>
            )}
          </div>
        </section>

        {user && (user.role === "admin" || user.role === "super") ? (
          <section className="glass-card rounded-2xl p-5">
            <h2 className="font-title text-3xl text-white">Withdrawal Approvals</h2>
            <div className="mt-3 space-y-3">
              {pendingWithdrawals.length ? (
                pendingWithdrawals.map((entry) => (
                  <article className="rounded-xl border border-white/15 bg-white/5 p-3" key={entry.id}>
                    <p className="text-sm text-white">
                      User {entry.user_id.slice(0, 8)} requested {formatMoney(entry.token_amount)} tokens ({entry.chain})
                    </p>
                    <p className="break-all text-xs text-slate-300">
                      Destination: {entry.destination_address ?? "N/A"}
                    </p>
                    <input
                      className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white"
                      onChange={(event) =>
                        setDecisionTxHashById((previous) => ({ ...previous, [entry.id]: event.target.value }))
                      }
                      placeholder="Payout chain tx hash (optional on approve)"
                      value={decisionTxHashById[entry.id] ?? ""}
                    />
                    <input
                      className="mt-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs text-white"
                      onChange={(event) =>
                        setDecisionReasonById((previous) => ({ ...previous, [entry.id]: event.target.value }))
                      }
                      placeholder="Reason/notes (optional)"
                      value={decisionReasonById[entry.id] ?? ""}
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-900 disabled:opacity-60"
                        disabled={isWorking}
                        onClick={() => {
                          onDecideWithdrawal(entry.id, true).catch(() => setMessage("Decision failed"))
                        }}
                        type="button"
                      >
                        Approve
                      </button>
                      <button
                        className="rounded-lg border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 disabled:opacity-60"
                        disabled={isWorking}
                        onClick={() => {
                          onDecideWithdrawal(entry.id, false).catch(() => setMessage("Decision failed"))
                        }}
                        type="button"
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-slate-300">No pending withdrawal requests.</p>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}
