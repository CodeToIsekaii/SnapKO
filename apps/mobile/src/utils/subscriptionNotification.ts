/**
 * Subscription Notification Utility
 * Handles push notification for subscription expiry warnings
 *
 * Key features:
 * - Only sends one notification per day (AsyncStorage flag)
 * - Triggers for PRO_WARNING state (≤5 days until expiry)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  getExpirationWarning,
  SubscriptionStatus,
} from "../hooks/useSubscription";

const NOTIFICATION_KEY = "last_subscription_notif_date";

/**
 * Check subscription status and send push notification if needed
 * Should be called on app launch or when subscription status changes
 *
 * @param subscription - Current subscription status
 * @returns true if notification was sent, false otherwise
 */
export async function checkAndNotifySubscription(
  subscription: SubscriptionStatus
): Promise<boolean> {
  try {
    // Only notify for PRO_WARNING state (≤5 days until expiry)
    // Don't notify for EXPIRED (they see banner in-app)
    // or TRIAL (not paying customers yet)
    if (subscription.state !== "PRO_WARNING") {
      return false;
    }

    // Check if we already sent notification today
    const today = new Date().toISOString().split("T")[0];
    const lastSent = await AsyncStorage.getItem(NOTIFICATION_KEY);

    if (lastSent === today) {
      console.log("[SubscriptionNotif] Already sent today, skipping");
      return false;
    }

    // Get the warning message
    const message = getExpirationWarning(subscription.daysRemaining);
    if (!message) {
      return false;
    }

    // Check notification permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      console.log("[SubscriptionNotif] Notifications not permitted");
      return false;
    }

    // Schedule immediate notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⏳ Sắp hết hạn gói PRO",
        body: message,
        data: { type: "subscription_warning" },
        sound: true,
      },
      trigger: null, // Send immediately
    });

    // Mark as sent for today
    await AsyncStorage.setItem(NOTIFICATION_KEY, today);
    console.log("[SubscriptionNotif] Notification sent successfully");

    return true;
  } catch (error) {
    console.error("[SubscriptionNotif] Error sending notification:", error);
    return false;
  }
}

/**
 * Clear the notification flag (useful for testing or reset)
 */
export async function clearNotificationFlag(): Promise<void> {
  await AsyncStorage.removeItem(NOTIFICATION_KEY);
}

/**
 * Request notification permissions if not already granted
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } =
      await Notifications.getPermissionsAsync();

    if (existingStatus === "granted") {
      return true;
    }

    const { status } = await Notifications.requestPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("[SubscriptionNotif] Error requesting permissions:", error);
    return false;
  }
}
