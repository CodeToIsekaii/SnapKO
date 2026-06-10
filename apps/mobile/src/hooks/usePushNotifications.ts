/**
 * usePushNotifications - Request and save Expo Push token
 * Called on first login to enable notifications
 */

import { useState, useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { api } from "../services/api";
import { Env } from "../env";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  token: string | null;
  permission: boolean;
  loading: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    token: null,
    permission: false,
    loading: true,
  });
  const notificationListener = useRef<Notifications.Subscription>(undefined);
  const responseListener = useRef<Notifications.Subscription>(undefined);

  useEffect(() => {
    registerForPush();

    // Listen for incoming notifications
    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("Notification received:", notification);
      });

    // Listen for notification responses (when user taps)
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        console.log("Notification response:", response);
        const data = response.notification.request.content.data;
        // Handle navigation based on notification type
        if (data?.type === "INVITE_PENDING") {
          // Navigate to pending list
          console.log("Navigate to pending list for:", data.profileId);
        }
      });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  async function registerForPush() {
    if (!Device.isDevice) {
      console.log("Push notifications require physical device");
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    try {
      // Check existing permission
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Push notification permission denied");
        setState({ token: null, permission: false, loading: false });
        return;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Env.EAS_PROJECT_ID,
      });

      const pushToken = tokenData.data;

      // Save push token to backend profile
      await api
        .patch("/profiles/me", { expoPushToken: pushToken })
        .catch((err: any) => console.warn("Failed to save push token:", err?.message));

      // Android channel setup
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#E07A2F",
        });
      }

      setState({ token: pushToken, permission: true, loading: false });
      console.log("Push token:", pushToken);
    } catch (err) {
      console.error("Push registration error:", err);
      setState({ token: null, permission: false, loading: false });
    }
  }

  return state;
}
