import { AuthUser, Table, TableGameState } from "@/lib/maca-api"

export type MultiplayerMode = "player" | "spectator" | "viewer"

export type MultiplayerState = {
  token: string | null
  user: AuthUser | null
  tables: Table[]
  gameStates: Record<string, TableGameState>
  activeTableId: string | null
  spectatorTableId: string | null
  isRealtimeConnected: boolean
  isLoading: boolean
  notice: string | null
}

export type MultiplayerMutation =
  | { type: "set_token"; payload: string | null }
  | { type: "set_user"; payload: AuthUser | null }
  | { type: "set_tables"; payload: Table[] }
  | { type: "upsert_table"; payload: Table }
  | { type: "remove_table"; payload: string }
  | { type: "upsert_game_state"; payload: TableGameState }
  | { type: "remove_game_state"; payload: string }
  | { type: "set_active_table"; payload: string | null }
  | { type: "set_spectator_table"; payload: string | null }
  | { type: "set_realtime_connected"; payload: boolean }
  | { type: "set_loading"; payload: boolean }
  | { type: "set_notice"; payload: string | null }

export function createInitialMultiplayerState(): MultiplayerState {
  return {
    token: null,
    user: null,
    tables: [],
    gameStates: {},
    activeTableId: null,
    spectatorTableId: null,
    isRealtimeConnected: false,
    isLoading: true,
    notice: null,
  }
}

export function multiplayerReducer(
  state: MultiplayerState,
  mutation: MultiplayerMutation,
): MultiplayerState {
  switch (mutation.type) {
    case "set_token":
      return { ...state, token: mutation.payload }
    case "set_user":
      return { ...state, user: mutation.payload }
    case "set_tables":
      return { ...state, tables: mutation.payload }
    case "upsert_table": {
      const index = state.tables.findIndex((table) => table.id === mutation.payload.id)
      if (index === -1) {
        return { ...state, tables: [mutation.payload, ...state.tables] }
      }
      const nextTables = [...state.tables]
      nextTables[index] = mutation.payload
      return { ...state, tables: nextTables }
    }
    case "remove_table":
      return {
        ...state,
        tables: state.tables.filter((table) => table.id !== mutation.payload),
      }
    case "upsert_game_state":
      return {
        ...state,
        gameStates: {
          ...state.gameStates,
          [mutation.payload.table_id]: mutation.payload,
        },
      }
    case "remove_game_state": {
      const nextStates = { ...state.gameStates }
      delete nextStates[mutation.payload]
      return { ...state, gameStates: nextStates }
    }
    case "set_active_table":
      return { ...state, activeTableId: mutation.payload }
    case "set_spectator_table":
      return { ...state, spectatorTableId: mutation.payload }
    case "set_realtime_connected":
      return { ...state, isRealtimeConnected: mutation.payload }
    case "set_loading":
      return { ...state, isLoading: mutation.payload }
    case "set_notice":
      return { ...state, notice: mutation.payload }
    default:
      return state
  }
}

export const multiplayerGetters = {
  activeTable(state: MultiplayerState): Table | null {
    if (!state.activeTableId) return null
    return state.tables.find((table) => table.id === state.activeTableId) ?? null
  },
  activeGameState(state: MultiplayerState): TableGameState | null {
    if (!state.activeTableId) return null
    return state.gameStates[state.activeTableId] ?? null
  },
  isViewingAsSpectator(state: MultiplayerState): boolean {
    if (!state.activeTableId || !state.spectatorTableId) return false
    return state.activeTableId === state.spectatorTableId
  },
  isCurrentUserParticipant(state: MultiplayerState): boolean {
    const table = this.activeTable(state)
    if (!table || !state.user) return false
    return table.players.includes(state.user.id)
  },
  isCurrentUserReady(state: MultiplayerState): boolean {
    const table = this.activeTable(state)
    if (!table || !state.user) return false
    return Boolean(table.ready_players?.includes(state.user.id))
  },
  isMyTurn(state: MultiplayerState): boolean {
    const gameState = this.activeGameState(state)
    if (!gameState || !state.user) return false
    return (
      gameState.status === "active" &&
      gameState.current_turn_user_id === state.user.id
    )
  },
  myAvailableActions(state: MultiplayerState): string[] {
    if (!this.isMyTurn(state)) return []
    return this.activeGameState(state)?.available_actions ?? []
  },
}
