import { defineStore } from "pinia"

import {
  AuthUser,
  clearStoredToken,
  getMe,
  getStoredToken,
  login,
  register,
  setStoredToken,
} from "../lib/api"

type AuthState = {
  token: string | null
  user: AuthUser | null
  loading: boolean
  error: string | null
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    token: getStoredToken(),
    user: null,
    loading: false,
    error: null,
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
  },
  actions: {
    async bootstrap() {
      if (!this.token) return
      this.loading = true
      this.error = null
      try {
        this.user = await getMe(this.token)
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Failed to load user"
        this.logout()
      } finally {
        this.loading = false
      }
    },
    async loginWithEmail(payload: { email: string; password: string }) {
      this.loading = true
      this.error = null
      try {
        const auth = await login(payload)
        this.token = auth.access_token
        setStoredToken(auth.access_token)
        this.user = await getMe(auth.access_token)
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Login failed"
        throw error
      } finally {
        this.loading = false
      }
    },
    async registerAndLogin(payload: {
      email: string
      username: string
      password: string
      referral_code?: string
    }) {
      this.loading = true
      this.error = null
      try {
        await register(payload)
        await this.loginWithEmail({ email: payload.email, password: payload.password })
      } catch (error) {
        this.error = error instanceof Error ? error.message : "Registration failed"
        throw error
      } finally {
        this.loading = false
      }
    },
    logout() {
      this.token = null
      this.user = null
      clearStoredToken()
    },
  },
})
