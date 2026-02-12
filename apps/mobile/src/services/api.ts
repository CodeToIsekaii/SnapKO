/**
 * Mobile Services - API Client for NestJS Backend
 * Migrated from Edge Functions
 */

import { Env } from "../env";

interface ApiOptions {
  auth?: string;
  body?: unknown;
}

async function callEdgeFunction<T>(
  functionName: string,
  options: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // apikey: Env.SUPABASE_ANON_KEY, // Not needed for NestJS
    Authorization: options.auth
      ? `Bearer ${options.auth}`
      : `Bearer ${Env.SUPABASE_ANON_KEY}`, // Fallback if needed, or remove if NestJS doesn't use anon key
  };

  // Map Edge Function names to NestJS endpoints
  const endpointMap: Record<string, string> = {
    "invite-join": "invite/join",
    // Add others if needed
  };

  const route = endpointMap[functionName] || functionName;
  const url = `${Env.BACKEND_URL}/${route}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `HTTP ${response.status}`);
  }

  return response.json();
}

// Invite APIs
export async function inviteCreate(
  auth: string,
): Promise<{ inviteCode: string }> {
  return callEdgeFunction("invite-create", { auth });
}

export async function inviteJoin(input: {
  inviteCode: string;
  fullName: string;
  phoneNumber: string;
}): Promise<{ pending: true; profileId: string }> {
  return callEdgeFunction("invite-join", { body: input });
}

export async function inviteApprove(
  auth: string,
  profileId: string,
  approve: boolean,
): Promise<{ success: true; activated: boolean }> {
  return callEdgeFunction("invite-approve", {
    auth,
    body: { profileId, approve },
  });
}

// AI Parse APIs
export async function aiParseHandwriting(input: {
  image_base64: string;
  business_id: string;
}): Promise<{
  items: Array<{
    ingredient_name: string;
    stock_qty: number;
    import_qty: number;
    unit?: string;
    confidence: number;
    needs_review?: boolean;
  }>;
  confidence: number;
}> {
  return callEdgeFunction("ai-parse-handwriting", { body: input });
}

export async function aiParseMenu(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<{
  items: Array<{ name: string; ingredients: string[]; price?: number }>;
  rawJson: string;
}> {
  return callEdgeFunction("ai-parse-menu", { body: input });
}

// Sync API
export async function syncUp(
  auth: string,
  logs: Array<Record<string, unknown>>,
): Promise<{
  synced: number;
  total: number;
  results: Array<{ id: string; success: boolean; error?: string }>;
}> {
  return callEdgeFunction("sync-up", { auth, body: { logs } });
}
