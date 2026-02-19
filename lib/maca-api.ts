export type AuthUser = {
  id: string
  email: string
  username: string
  balance: number
  role: "player" | "mod" | "admin" | "super"
  referral_code: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

export type Table = {
  id: string
  name: string
  owner_id: string
  max_players: number
  is_private: boolean
  invite_code: string | null
  players: string[]
  ready_players?: string[]
  online_players?: string[]
  is_ready_to_start?: boolean
  has_active_turn?: boolean
  current_turn_user_id?: string | null
  turn_deadline?: string | null
  turn_remaining_seconds?: number | null
  spectator_count?: number
  is_locked?: boolean
}

export type TableGameState = {
  table_id: string
  status: "idle" | "active" | "ended"
  players: string[]
  turn_index: number | null
  current_turn_user_id: string | null
  turn_seconds: number
  turn_deadline: string | null
  turn_remaining_seconds: number
  hand_number: number
  last_action:
    | {
        user_id: string | null
        action: string
        at: string
        meta?: Record<string, unknown>
      }
    | null
  action_count: number
}

export type SocialUser = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export type FriendRequest = {
  id: string
  sender_id: string
  recipient_id: string
  sender_username: string
  recipient_username: string
  status: string
  created_at: string
  resolved_at: string | null
}

export type TableInvite = {
  id: string
  sender_id: string
  recipient_id: string
  sender_username: string
  recipient_username: string
  table_id: string
  invite_code: string | null
  status: string
  created_at: string
  resolved_at: string | null
}

export type NotificationItem = {
  id: string
  type: string
  message: string
  created_at: string
  meta: Record<string, string>
}

export type SocialOverview = {
  friends: SocialUser[]
  incoming_friend_requests: FriendRequest[]
  outgoing_friend_requests: FriendRequest[]
  incoming_table_invites: TableInvite[]
  outgoing_table_invites: TableInvite[]
}

export type AdminAuditLog = {
  id: string
  actor_user_id: string
  actor_role: string
  command_text: string
  status: string
  message: string
  target_user_id: string | null
  target_table_id: string | null
  metadata_json: string
  created_at: string
}

export type AdminUser = {
  id: string
  username: string
  role: string
  balance: number
}

export type AdminBalanceMode = "add" | "remove" | "set"

export type StatsPeriod = "all" | "weekly" | "monthly"
export type LeaderboardSort = "win_rate" | "balance" | "games" | "blackjacks"

export type PeriodStats = {
  period: StatsPeriod
  total_games: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  win_rate: number
  balance: number
}

export type UserStats = {
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  all_time: PeriodStats
  weekly: PeriodStats
  monthly: PeriodStats
}

export type LeaderboardEntry = {
  rank: number
  user_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  balance: number
  total_games: number
  wins: number
  losses: number
  pushes: number
  blackjacks: number
  win_rate: number
}

export type LeaderboardResponse = {
  scope: "global" | "friends" | string
  period: StatsPeriod
  sort_by: LeaderboardSort
  generated_at: string
  entries: LeaderboardEntry[]
}

export type ReferralEntry = {
  referral_id: string
  referred_user_id: string
  referred_username: string
  referred_display_name: string | null
  referrer_bonus: number
  new_user_bonus: number
  created_at: string
}

export type ReferralDashboard = {
  referral_code: string
  referral_code_length: number
  referrer_bonus_amount: number
  new_user_bonus_amount: number
  total_referrals: number
  total_bonus_earned: number
  total_bonus_given_to_friends: number
  total_new_user_bonus_received: number
  referred_by_user_id: string | null
  referred_by_username: string | null
  referrals: ReferralEntry[]
}

export type WalletSupportedAsset = {
  chain: "BTC" | "ETH" | "SOL" | string
  asset: "BTC" | "ETH" | "SOL" | string
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
  tx_type: "deposit" | "withdrawal" | string
  status: "pending_approval" | "completed" | "rejected" | string
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

export type OnChainVerification = {
  verification_mode: string
  provider: string
  tx_hash: string
  confirmations: number
  required_confirmations: number
  verified: boolean
}

export type WalletDepositResult = {
  transaction: WalletTransaction
  token_balance: number
  credited_tokens: number
  verification: OnChainVerification
}

export type WalletWithdrawalResult = {
  transaction: WalletTransaction
  token_balance: number
  requested_tokens: number
}

export type SinglePlayerRound = {
  round_id: string
  status: "player_turn" | "completed"
  bet: number
  player_cards: string[]
  dealer_cards: string[]
  player_score: number
  dealer_score: number | null
  can_hit: boolean
  can_stand: boolean
  result: "win" | "lose" | "push" | "blackjack" | null
  payout: number | null
  message: string | null
  actions: string[]
  created_at: string
  ended_at: string | null
}

export type RoundLog = {
  id: string
  user_id: string
  bet: number
  result: "win" | "lose" | "push" | "blackjack" | string
  payout: number
  player_score: number
  dealer_score: number
  player_cards: string[]
  dealer_cards: string[]
  actions: string[]
  created_at: string
  ended_at: string
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  token?: string
  body?: unknown
}

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ?? "http://localhost:8000"

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
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
      `Request failed with status ${response.status}`
    throw new ApiError(message, response.status)
  }

  return data as T
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("maca_access_token")
}

export function setStoredToken(token: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem("maca_access_token", token)
}

export function clearStoredToken(): void {
  if (typeof window === "undefined") return
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
  return apiRequest<{ access_token: string; token_type: string }>("/api/v1/auth/login", {
    method: "POST",
    body: payload,
  })
}

export async function getMe(token: string): Promise<AuthUser> {
  return apiRequest<AuthUser>("/api/v1/auth/me", { token })
}

export async function updateProfile(
  token: string,
  payload: { display_name?: string; avatar_url?: string; bio?: string },
): Promise<AuthUser> {
  return apiRequest<AuthUser>("/api/v1/profile/me", {
    method: "PATCH",
    token,
    body: payload,
  })
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

export async function joinTable(token: string, tableId: string): Promise<Table> {
  return apiRequest<Table>(`/api/v1/lobby/tables/${tableId}/join`, {
    method: "POST",
    token,
    body: {},
  })
}

export async function joinTableByCode(token: string, inviteCode: string): Promise<Table> {
  return apiRequest<Table>("/api/v1/lobby/tables/join-by-code", {
    method: "POST",
    token,
    body: { invite_code: inviteCode },
  })
}

export async function startSinglePlayerRound(
  token: string,
  payload: { bet: number },
): Promise<SinglePlayerRound> {
  return apiRequest<SinglePlayerRound>("/api/v1/game/single-player/start", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function getSinglePlayerRound(
  token: string,
  roundId: string,
): Promise<SinglePlayerRound> {
  return apiRequest<SinglePlayerRound>(`/api/v1/game/single-player/${roundId}`, { token })
}

export async function hitSinglePlayerRound(
  token: string,
  roundId: string,
  actionId?: string,
): Promise<SinglePlayerRound> {
  return apiRequest<SinglePlayerRound>(`/api/v1/game/single-player/${roundId}/hit`, {
    method: "POST",
    token,
    body: actionId ? { action_id: actionId } : {},
  })
}

export async function standSinglePlayerRound(
  token: string,
  roundId: string,
  actionId?: string,
): Promise<SinglePlayerRound> {
  return apiRequest<SinglePlayerRound>(`/api/v1/game/single-player/${roundId}/stand`, {
    method: "POST",
    token,
    body: actionId ? { action_id: actionId } : {},
  })
}

export async function listSinglePlayerHistory(
  token: string,
  limit = 20,
): Promise<RoundLog[]> {
  return apiRequest<RoundLog[]>(`/api/v1/game/single-player/history/list?limit=${limit}`, {
    token,
  })
}

export async function getSocialOverview(token: string): Promise<SocialOverview> {
  return apiRequest<SocialOverview>("/api/v1/social/overview", { token })
}

export async function listNotifications(token: string): Promise<NotificationItem[]> {
  return apiRequest<NotificationItem[]>("/api/v1/social/notifications", { token })
}

export async function sendFriendRequest(
  token: string,
  payload: { username: string },
): Promise<FriendRequest> {
  return apiRequest<FriendRequest>("/api/v1/social/friends/request", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function respondFriendRequest(
  token: string,
  requestId: string,
  accept: boolean,
): Promise<FriendRequest> {
  return apiRequest<FriendRequest>(
    `/api/v1/social/friends/requests/${requestId}/${accept ? "accept" : "decline"}`,
    {
      method: "POST",
      token,
      body: {},
    },
  )
}

export async function removeFriend(token: string, friendUserId: string): Promise<void> {
  await apiRequest(`/api/v1/social/friends/${friendUserId}`, {
    method: "DELETE",
    token,
  })
}

export async function sendTableInvite(
  token: string,
  payload: { recipient_username: string; table_id?: string },
): Promise<TableInvite> {
  return apiRequest<TableInvite>("/api/v1/social/invites", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function respondTableInvite(
  token: string,
  inviteId: string,
  accept: boolean,
): Promise<TableInvite> {
  return apiRequest<TableInvite>(`/api/v1/social/invites/${inviteId}/${accept ? "accept" : "decline"}`, {
    method: "POST",
    token,
    body: {},
  })
}

export async function listAdminAudits(token: string, limit = 100): Promise<AdminAuditLog[]> {
  return apiRequest<AdminAuditLog[]>(`/api/v1/admin/audits?limit=${limit}`, {
    token,
  })
}

export async function listAdminUsers(
  token: string,
  options?: { search?: string; limit?: number },
): Promise<AdminUser[]> {
  const search = options?.search ? encodeURIComponent(options.search) : ""
  const limit = options?.limit ?? 50
  const query = search ? `?search=${search}&limit=${limit}` : `?limit=${limit}`
  return apiRequest<AdminUser[]>(`/api/v1/admin/users${query}`, { token })
}

export async function updateAdminUserRole(
  token: string,
  userId: string,
  role: AuthUser["role"],
): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${userId}/role`, {
    method: "PATCH",
    token,
    body: { role },
  })
}

export async function adjustAdminUserBalance(
  token: string,
  userId: string,
  payload: { amount: number; mode: AdminBalanceMode },
): Promise<AdminUser> {
  return apiRequest<AdminUser>(`/api/v1/admin/users/${userId}/balance`, {
    method: "POST",
    token,
    body: payload,
  })
}

export async function getMyStats(token: string): Promise<UserStats> {
  return apiRequest<UserStats>("/api/v1/stats/me", { token })
}

export async function getReferralDashboard(token: string): Promise<ReferralDashboard> {
  return apiRequest<ReferralDashboard>("/api/v1/referrals/me", { token })
}

export async function getWalletOverview(token: string): Promise<WalletOverview> {
  return apiRequest<WalletOverview>("/api/v1/wallet/me", { token })
}

export async function listWalletAssets(token: string): Promise<WalletSupportedAsset[]> {
  return apiRequest<WalletSupportedAsset[]>("/api/v1/wallet/assets", { token })
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
  options?: { limit?: number },
): Promise<WalletTransaction[]> {
  const limit = options?.limit ?? 50
  return apiRequest<WalletTransaction[]>(`/api/v1/wallet/transactions?limit=${limit}`, { token })
}

export async function verifyWalletDeposit(
  token: string,
  payload: {
    chain: string
    asset: string
    tx_hash: string
    crypto_amount: number
    usd_rate?: number
    wallet_address?: string
  },
): Promise<WalletDepositResult> {
  return apiRequest<WalletDepositResult>("/api/v1/wallet/deposits/verify", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function requestWalletWithdrawal(
  token: string,
  payload: {
    chain: string
    asset: string
    destination_address: string
    token_amount: number
    usd_rate?: number
  },
): Promise<WalletWithdrawalResult> {
  return apiRequest<WalletWithdrawalResult>("/api/v1/wallet/withdrawals/request", {
    method: "POST",
    token,
    body: payload,
  })
}

export async function listPendingWithdrawals(
  token: string,
  options?: { limit?: number },
): Promise<WalletTransaction[]> {
  const limit = options?.limit ?? 100
  return apiRequest<WalletTransaction[]>(`/api/v1/wallet/withdrawals/pending?limit=${limit}`, { token })
}

export async function decideWithdrawal(
  token: string,
  transactionId: string,
  payload: { approve: boolean; chain_tx_hash?: string; reason?: string },
): Promise<WalletTransaction> {
  return apiRequest<WalletTransaction>(`/api/v1/wallet/withdrawals/${transactionId}/decision`, {
    method: "POST",
    token,
    body: payload,
  })
}

export async function getGlobalLeaderboard(
  token: string,
  options?: { period?: StatsPeriod; sort_by?: LeaderboardSort; limit?: number },
): Promise<LeaderboardResponse> {
  const period = options?.period ?? "all"
  const sortBy = options?.sort_by ?? "win_rate"
  const limit = options?.limit ?? 50
  return apiRequest<LeaderboardResponse>(
    `/api/v1/stats/leaderboard/global?period=${period}&sort_by=${sortBy}&limit=${limit}`,
    { token },
  )
}

export async function getFriendsLeaderboard(
  token: string,
  options?: { period?: StatsPeriod; sort_by?: LeaderboardSort; limit?: number },
): Promise<LeaderboardResponse> {
  const period = options?.period ?? "all"
  const sortBy = options?.sort_by ?? "win_rate"
  const limit = options?.limit ?? 50
  return apiRequest<LeaderboardResponse>(
    `/api/v1/stats/leaderboard/friends?period=${period}&sort_by=${sortBy}&limit=${limit}`,
    { token },
  )
}

export { ApiError }
