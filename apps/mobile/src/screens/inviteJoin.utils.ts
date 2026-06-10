export interface JoinSessionPayload {
  access_token: string;
  refresh_token: string;
}

export interface JoinSuccessPayload {
  profileId?: string;
  accessToken?: string;
  refreshToken?: string;
  session?: JoinSessionPayload;
}

export function unwrapJoinPayload(raw: unknown): JoinSuccessPayload {
  if (raw && typeof raw === "object" && "data" in raw) {
    return ((raw as { data?: unknown }).data ?? {}) as JoinSuccessPayload;
  }
  return (raw ?? {}) as JoinSuccessPayload;
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }
  return null;
}

export function getJoinErrorMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as { message?: unknown; error?: unknown };
  return normalizeMessage(payload.message) ?? normalizeMessage(payload.error);
}

export async function runOnceInFlight<T>(
  guard: { current: boolean },
  task: () => Promise<T>,
): Promise<T | null> {
  if (guard.current) return null;
  guard.current = true;
  try {
    return await task();
  } finally {
    guard.current = false;
  }
}
