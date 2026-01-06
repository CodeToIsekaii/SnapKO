/**
 * Root Index Route - Redirects to Dashboard
 * This file ensures the app always starts at the Dashboard tab
 */

import { Redirect } from "expo-router";

export default function Index() {
  return <Redirect href="/(tabs)/dashboard" />;
}
