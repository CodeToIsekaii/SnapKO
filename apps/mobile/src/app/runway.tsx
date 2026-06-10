import React from "react";
import RunwayScreen from "../screens/RunwayScreen";
import { useRouter } from "expo-router";

export default function RunwayRoute() {
  const router = useRouter();
  return <RunwayScreen onBack={() => router.back()} />;
}
