import React from "react";
import PendingTransfersScreen from "../screens/PendingTransfersScreen";
import { useRouter } from "expo-router";

export default function PendingTransfersRoute() {
  const router = useRouter();
  return <PendingTransfersScreen onBack={() => router.back()} />;
}
