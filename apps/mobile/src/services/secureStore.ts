/**
 * Mobile Secure Storage Service
 * Stores session tokens securely using expo-secure-store
 */

import * as SecureStore from "expo-secure-store";

const KEYS = {
  SESSION_TOKEN: "snapko_session_token",
  REFRESH_TOKEN: "snapko_refresh_token",
  PROFILE_ID: "snapko_profile_id",
  BUSINESS_ID: "snapko_business_id",
} as const;

/**
 * Save session tokens after successful login/approval
 */
export async function saveSession(data: {
  sessionToken: string;
  refreshToken?: string;
  profileId?: string;
  businessId?: string;
}): Promise<void> {
  await SecureStore.setItemAsync(KEYS.SESSION_TOKEN, data.sessionToken);

  if (data.refreshToken) {
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, data.refreshToken);
  }
  if (data.profileId) {
    await SecureStore.setItemAsync(KEYS.PROFILE_ID, data.profileId);
  }
  if (data.businessId) {
    await SecureStore.setItemAsync(KEYS.BUSINESS_ID, data.businessId);
  }
}

/**
 * Get session token
 */
export async function getSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.SESSION_TOKEN);
}

/**
 * Get refresh token
 */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

/**
 * Get profile ID
 */
export async function getProfileId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.PROFILE_ID);
}

/**
 * Get business ID
 */
export async function getBusinessId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.BUSINESS_ID);
}

/**
 * Get all session data
 */
export async function getSession(): Promise<{
  sessionToken: string | null;
  refreshToken: string | null;
  profileId: string | null;
  businessId: string | null;
}> {
  const [sessionToken, refreshToken, profileId, businessId] = await Promise.all(
    [
      SecureStore.getItemAsync(KEYS.SESSION_TOKEN),
      SecureStore.getItemAsync(KEYS.REFRESH_TOKEN),
      SecureStore.getItemAsync(KEYS.PROFILE_ID),
      SecureStore.getItemAsync(KEYS.BUSINESS_ID),
    ]
  );

  return { sessionToken, refreshToken, profileId, businessId };
}

/**
 * Clear all session data (logout)
 */
export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEYS.SESSION_TOKEN),
    SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN),
    SecureStore.deleteItemAsync(KEYS.PROFILE_ID),
    SecureStore.deleteItemAsync(KEYS.BUSINESS_ID),
  ]);
}

/**
 * Check if user has valid session
 */
export async function hasValidSession(): Promise<boolean> {
  const token = await getSessionToken();
  return token !== null && token.length > 0;
}
