/**
 * Profile Edit Route - Expo Router wrapper for ProfileEditScreen
 */

import React from "react";
import { useRouter } from "expo-router";
import { ProfileEditScreen } from "../screens";
import { useAuth } from "../contexts/AuthContext";

export default function ProfileEditRoute() {
  const router = useRouter();
  const { authState } = useAuth();

  // Get initial data from auth context
  // Note: UserProfile uses camelCase (fullName, phoneNumber)
  // business_name is not in UserProfile, but ProfileEditScreen can fetch it if needed
  const initialData =
    authState.status === "authenticated"
      ? {
          fullName: authState.profile?.fullName || "",
          businessName: "", // Will be fetched by ProfileEditScreen from DB if needed
          phoneNumber: authState.profile?.phoneNumber || "",
        }
      : undefined;

  // Check if user is owner
  const isOwner =
    authState.status === "authenticated" && authState.profile?.role === "OWNER";

  return (
    <ProfileEditScreen
      onBack={() => router.back()}
      onSave={() => router.back()}
      isOwner={isOwner}
      initialData={initialData}
    />
  );
}
