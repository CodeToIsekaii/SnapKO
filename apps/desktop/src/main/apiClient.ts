/**
 * apiClient — main-process backend API client (BE-SnapKO)
 *
 * - Access token: kept in memory (cleared on logout/restart)
 * - Refresh token: persisted in electron-store under 'snapko_refresh_token'
 * - Auto-refreshes on 401 with a queue so concurrent requests don't race
 */

import Store from 'electron-store'
import { Env } from '../env'

export class ApiFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly path: string,
  ) {
    super(message)
    this.name = 'ApiFetchError'
  }
}

const store = new Store()
let accessToken: string | null = null

// ─── Token management ───────────────────────────────────────────────────────

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  store.set('snapko_refresh_token', refresh)
}

export function clearTokens(): void {
  accessToken = null
  store.delete('snapko_refresh_token')
}

export function getStoredRefreshToken(): string | null {
  return store.get('snapko_refresh_token', null) as string | null
}

// ─── Refresh queue ──────────────────────────────────────────────────────────

let isRefreshing = false
let pendingQueue: Array<(token: string | null) => void> = []

async function doRefresh(): Promise<string> {
  const rt = getStoredRefreshToken()
  if (!rt) throw new Error('No refresh token stored')
  const res = await fetch(`${Env.VITE_BACKEND_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  })
  if (!res.ok) {
    clearTokens()
    throw new Error(`Token refresh failed: ${res.status}`)
  }
  const json = await res.json()
  const { accessToken: newAccess, refreshToken: newRefresh } = json.data ?? json
  setTokens(newAccess, newRefresh)
  return newAccess
}

// ─── Core fetch ─────────────────────────────────────────────────────────────

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const makeReq = (token: string | null) =>
    fetch(`${Env.VITE_BACKEND_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

  let res = await makeReq(accessToken)

  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true
      try {
        accessToken = await doRefresh()
        pendingQueue.forEach((cb) => cb(accessToken))
      } catch (err) {
        pendingQueue.forEach((cb) => cb(null))
        throw err
      } finally {
        isRefreshing = false
        pendingQueue = []
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        pendingQueue.push((token) =>
          token ? resolve() : reject(new Error('Refresh failed')),
        )
      })
    }
    res = await makeReq(accessToken)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const errBody = await res.json()
      detail = errBody?.message ?? errBody?.error ?? JSON.stringify(errBody)
    } catch { /* ignore parse errors */ }
    throw new ApiFetchError(detail || `apiFetch ${res.status}: ${path}`, res.status, path)
  }
  const json = await res.json()
  return (json?.data ?? json) as T
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Exchange a Supabase access token for backend tokens.
 * Call after every Supabase signIn / signUp / OAuth callback.
 */
export async function loginMobileExchange(
  supabaseToken: string,
  profile: { fullName?: string } = {},
): Promise<void> {
  const res = await fetch(`${Env.VITE_BACKEND_URL}/auth/login-mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${supabaseToken}`,
    },
    body: JSON.stringify(profile),
  })
  if (!res.ok) throw new Error(`login-mobile failed: ${res.status}`)
  const json = await res.json()
  const { accessToken: at, refreshToken: rt } = json.data ?? json
  setTokens(at, rt)
}

/**
 * Revoke the stored refresh token on the backend, then clear local tokens.
 * Safe to call even if no tokens are stored.
 */
export async function logoutBackend(): Promise<void> {
  const rt = getStoredRefreshToken()
  if (rt) {
    await fetch(`${Env.VITE_BACKEND_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {})
  }
  clearTokens()
}
