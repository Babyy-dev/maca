export type AuthUser = {
  id: string
  email: string
  username: string
  balance: number
  role: "player" | "mod" | "admin" | "super"
}

export type Table = {
  id: string
  name: string
  owner_id: string
  max_players: number
  players: string[]
  spectator_count?: number
}

export type TableGameState = {
  table_id: string
  status: "idle" | "active" | "ended"
  phase?: string
  current_turn_user_id: string | null
  available_actions?: string[]
  dealer_cards?: string[]
  dealer_score?: number | null
  player_states?: Record<
    string,
    {
      user_id: string
      hands: Array<{
        hand_id: string
        cards: string[]
        score: number
        bet: number
        status: string
        result: string | null
      }>
      active_hand_index: number
      completed: boolean
      base_bet: number
      committed_bet: number
      total_payout: number
    }
  >
}

export type WalletSupportedAsset = {
  chain: string
  asset: string
  display_name: string
  usd_rate: number
  min_confirmations: number
}

export type WalletLink = {
  id: string
  user_id: string
  chain: string
  wallet_address: string
  label: string | null
  is_verified: boolean
  created_at: string
  verified_at: string | null
}

export type WalletTransaction = {
  id: string
  user_id: string
  wallet_link_id: string | null
  tx_type: string
  status: string
  chain: string
  asset: string
  wallet_address: string
  destination_address: string | null
  tx_hash: string | null
  crypto_amount: number
  usd_rate: number
  usd_amount: number
  token_amount: number
  approval_required: boolean
  approved_by_user_id: string | null
  failure_reason: string | null
  metadata_json: string
  created_at: string
  updated_at: string
  processed_at: string | null
}

export type WalletOverview = {
  token_balance: number
  token_symbol: string
  usd_per_token: number
  supported_assets: WalletSupportedAsset[]
  linked_wallets: WalletLink[]
  recent_transactions: WalletTransaction[]
  pending_withdrawals: number
}

export type DepositVerifyResult = {
  transaction: WalletTransaction
  token_balance: number
  credited_tokens: number
  verification: {
    verification_mode: string
    provider: string
    tx_hash: string
    confirmations: number
    required_confirmations: number
    verified: boolean
  }
}

export type WithdrawalRequestResult = {
  transaction: WalletTransaction
  token_balance: number
  requested_tokens: number
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  token?: string
  body?: unknown
}

const BASE_URL =
  resolveApiBase()

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const isJson = response.headers.get("content-type")?.includes("application/json")
  const data = isJson ? await response.json() : null

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "detail" in data && String(data.detail)) ||
      `Request failed (${response.status})`
    throw new ApiError(message, response.status)
  }
  return data as T
}

export function getApiBase(): string {
  return BASE_URL
}

function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search)
    const apiBaseFromQuery = params.get("apiBase")?.replace(/\/+$/, "")
    if (apiBaseFromQuery) {
      localStorage.setItem("maca_vue_api_base", apiBaseFromQuery)
      return apiBaseFromQuery
    }
    const apiBaseFromStorage = localStorage.getItem("maca_vue_api_base")?.replace(/\/+$/, "")
    if (apiBaseFromStorage) return apiBaseFromStorage
  }
  return (
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ??
    "http://localhost:8000"
  )
}

export function getStoredToken(): string | null {
  return localStorage.getItem("maca_access_token")
}

export function setStoredToken(token: string): void {
  localStorage.setItem("maca_access_token", token)
}

export function clearStoredToken(): void {
  localStorage.removeItem("maca_access_token")
}

export async function register(payload: {
  email: string
  username: string
  password: string
  referral_code?: string
}): Promise<AuthUser> {
  return apiRequest<AuthUser>("/api/v1/auth/register", {
    method: "POST",
    body: payload,
  })
}

export async function login(payload: {
  email: string
  password: string
}): Promise<{ access_token: string; token_type: string }> {
  return apiRequest<{ access_token: string; token_type: string }>(
    "/api/v1/auth/login",
    {
      method: "POST",
      body: payload,
    },
  )
}

export async function getMe(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>("/api/v1/auth/me", { token })
}

export async function listTables(token: string): Promise<Table[]> {
  return apiRequest<Table[]>("/api/v1/lobby/tables", { token })
}

export async function createTable(
  token: string,
  payload: { name: string; max_players: number; is_private: boolean },
): Promise<Table> {
  return apiRequest<Table>("/api/v1/lobby/tables", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function getWalletOverview(token: string): Promise<WalletOverview> {
  return apiRequest<WalletOverview>("/api/v1/wallet/me", { token })
}

export async function linkWallet(
  token: string,
  payload: { chain: string; wallet_address: string; label?: string },
): Promise<WalletLink> {
  return apiRequest<WalletLink>("/api/v1/wallet/link", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function listWalletTransactions(
  token: string,
  limit = 50,
): Promise<WalletTransaction[]> {
  return apiRequest<WalletTransaction[]>(`/api/v1/wallet/transactions?limit=${limit}`, {
    token,
  })
}

export async function verifyDeposit(
  token: string,
  payload: {
    chain: string
    asset: string
    tx_hash: string
    crypto_amount: number
    usd_rate?: number
    wallet_address?: string
  },
): Promise<DepositVerifyResult> {
  return apiRequest<DepositVerifyResult>("/api/v1/wallet/deposits/verify", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function requestWithdrawal(
  token: string,
  payload: {
    chain: string
    asset: string
    destination_address: string
    token_amount: number
    usd_rate?: number
  },
): Promise<WithdrawalRequestResult> {
  return apiRequest<WithdrawalRequestResult>("/api/v1/wallet/withdrawals/request", {
    method: "POST",
    token,
    body: payload,
  })
}
