/**
 * Auth Group Layout
 * Contains login and join-staff screens
 */

import { Stack } from "expo-router";

// Colors from .UXUIrules
const COLORS = {
  background: "#121212",
};

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="join-staff" />
    </Stack>
  );
}
