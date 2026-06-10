/**
 * backendClient — browser-side BE-SnapKO client
 *
 * - Access token in memory (cleared on logout / tab reload)
 * - Refresh token persisted to localStorage (`snapko_refresh_token`)
 * - Auto-refreshes on 401 with a queue to dedupe concurrent requests
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "";
const REFRESH_KEY = "snapko_refresh_token";

let accessToken: string | null = null;

// ─── Token management ───────────────────────────────────────────────────────
export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  if (typeof window !== "undefined") {
    localStorage.setItem(REFRESH_KEY, refresh);
  }
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem(REFRESH_KEY);
  }
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

// ─── Refresh queue ──────────────────────────────────────────────────────────
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

async function doRefresh(): Promise<string> {
  const rt = getStoredRefreshToken();
  if (!rt) throw new Error("No refresh token stored");

  const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: rt }),
  });

  if (!res.ok) {
    clearTokens();
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const json = await res.json();
  const { accessToken: newAccess, refreshToken: newRefresh } =
    json.data ?? json;
  setTokens(newAccess, newRefresh);
  return newAccess;
}

// ─── Core fetch ─────────────────────────────────────────────────────────────
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const makeReq = (token: string | null) =>
    fetch(`${BACKEND_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...((init.headers as Record<string, string>) ?? {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  let res = await makeReq(accessToken);

  if (res.status === 401) {
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        accessToken = await doRefresh();
        pendingQueue.forEach((cb) => cb(accessToken));
      } catch (err) {
        pendingQueue.forEach((cb) => cb(null));
        throw err;
      } finally {
        isRefreshing = false;
        pendingQueue = [];
      }
    } else {
      await new Promise<void>((resolve, reject) => {
        pendingQueue.push((token) =>
          token ? resolve() : reject(new Error("Refresh failed"))
        );
      });
    }
    res = await makeReq(accessToken);
  }

  if (!res.ok) throw new Error(`apiFetch ${res.status}: ${path}`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

/**
 * Exchange a Supabase access token for backend tokens.
 * Call after every Supabase signIn / signUp / OAuth callback.
 */
export async function loginMobile(
  supabaseToken: string,
  profile: { fullName?: string } = {}
): Promise<void> {
  const res = await fetch(`${BACKEND_URL}/auth/login-mobile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseToken}`,
    },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`login-mobile failed: ${res.status}`);
  const json = await res.json();
  const { accessToken: at, refreshToken: rt } = json.data ?? json;
  setTokens(at, rt);
}

/**
 * Revoke refresh token on backend, then clear local tokens.
 */
export async function logoutBackend(): Promise<void> {
  const rt = getStoredRefreshToken();
  if (rt) {
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
  }
  clearTokens();
}
