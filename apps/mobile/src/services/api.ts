/**
 * Mobile Services - API Client for BE-SnapKO
 *
 * All domain requests go through `apiFetch` / `api.get/post/patch/delete`.
 * Auto-refresh on 401 with in-flight dedup. Refresh token stored in expo-secure-store.
 */

import * as SecureStore from "expo-secure-store";
import { Env } from "../env";

// ─────────────────────────────────────────────────────────────────
// Backend-authenticated client (BE-SnapKO)
// ─────────────────────────────────────────────────────────────────

const REFRESH_TOKEN_KEY = "snapko_refresh_token";

let backendAccessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let exchangeInFlight: Promise<string | null> | null = null;
let supabaseAccessTokenProvider: (() => Promise<string | null>) | null = null;

export class ApiError extends Error {
  status: number;
  data: unknown;
  path: string;
  response: { status: number; data: unknown };

  constructor(message: string, status: number, data: unknown, path: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.path = path;
    this.response = { status, data };
  }
}

export function setBackendAccessToken(token: string | null): void {
  backendAccessToken = token;
}

export function getBackendAccessToken(): string | null {
  return backendAccessToken;
}

export async function setBackendRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getBackendRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function clearBackendTokens(): Promise<void> {
  backendAccessToken = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
}

export function setUnauthorizedHandler(cb: (() => void) | null): void {
  onUnauthorized = cb;
}

export function setSupabaseAccessTokenProvider(
  provider: (() => Promise<string | null>) | null,
): void {
  supabaseAccessTokenProvider = provider;
}

interface TokenRes {
  accessToken: string;
  refreshToken: string;
}

async function refreshBackendTokens(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refreshToken = await getBackendRefreshToken();
      if (!refreshToken) return null;

      const res = await fetch(`${Env.BACKEND_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        await clearBackendTokens();
        return null;
      }

      const json = (await res.json()) as { data?: TokenRes } & Partial<TokenRes>;
      const tokens = json.data ?? (json as TokenRes);
      backendAccessToken = tokens.accessToken;
      await setBackendRefreshToken(tokens.refreshToken);
      console.log("[API] /auth/refresh ok");
      return tokens.accessToken;
    } catch {
      await clearBackendTokens();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function exchangeBackendTokensFromSupabase(): Promise<string | null> {
  if (exchangeInFlight) return exchangeInFlight;

  exchangeInFlight = (async () => {
    try {
      const supabaseAccessToken = await supabaseAccessTokenProvider?.();
      if (!supabaseAccessToken) return null;

      const tokens = await loginMobile(supabaseAccessToken);
      return tokens.accessToken;
    } catch (err) {
      console.warn("[API] Backend token exchange failed:", err);
      await clearBackendTokens();
      return null;
    } finally {
      exchangeInFlight = null;
    }
  })();

  return exchangeInFlight;
}

export async function ensureBackendAuthReady(): Promise<string | null> {
  if (backendAccessToken) return backendAccessToken;

  const refreshed = await refreshBackendTokens();
  if (refreshed) return refreshed;

  return exchangeBackendTokensFromSupabase();
}

/**
 * Authenticated fetch against BE-SnapKO.
 * Automatically injects Bearer token, hydrates auth before the first request,
 * and retries once after refresh/exchange on 401.
 *
 * @param path absolute path starting with "/" (e.g. "/profiles/me")
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${Env.BACKEND_URL}${path}`;

  const buildHeaders = (token: string | null): HeadersInit => {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  };

  const initialToken = await ensureBackendAuthReady();
  let res = await fetch(url, { ...init, headers: buildHeaders(initialToken) });

  if (res.status === 401) {
    backendAccessToken = null;
    const refreshedToken = await refreshBackendTokens();
    const newToken = refreshedToken ?? (await exchangeBackendTokensFromSupabase());
    if (newToken) {
      res = await fetch(url, { ...init, headers: buildHeaders(newToken) });
    }
  }

  if (res.status === 401) {
    await clearBackendTokens();
    onUnauthorized?.();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const message =
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : data && typeof data === "object"
        ? String(
            (data as any).message ??
              (data as any).error ??
              text ??
              `HTTP ${res.status}`,
          )
        : text || `HTTP ${res.status}`;

    throw new ApiError(message, res.status, data, path);
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as { data?: T };
  return (json && typeof json === "object" && "data" in json ? json.data : json) as T;
}

/**
 * Convenience wrappers over apiFetch.
 */
export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

// ─────────────────────────────────────────────────────────────────
// Auth exchange — Supabase access token → backend tokens
// ─────────────────────────────────────────────────────────────────

export async function loginMobile(
  supabaseAccessToken: string,
  profile: { fullName?: string; avatarUrl?: string; phoneNumber?: string } = {},
): Promise<TokenRes> {
  const res = await fetch(`${Env.BACKEND_URL}/auth/login-mobile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`,
    },
    body: JSON.stringify(profile),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `login-mobile failed: HTTP ${res.status}`);
  }

  const json = (await res.json()) as { data?: TokenRes } & Partial<TokenRes>;
  const tokens = json.data ?? (json as TokenRes);
  backendAccessToken = tokens.accessToken;
  await setBackendRefreshToken(tokens.refreshToken);
  console.log("[API] /auth/login-mobile ok");
  return tokens;
}

export async function logoutBackend(): Promise<void> {
  const refreshToken = await getBackendRefreshToken();
  if (refreshToken) {
    await fetch(`${Env.BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => {});
  }
  await clearBackendTokens();
}
