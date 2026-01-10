import { useRouter } from "expo-router";
import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import DashboardScreenComponent from "../../../screens/DashboardScreen";
import { Alert } from "react-native";

export default function DashboardPage() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  // Increment refreshKey when screen gains focus (after returning from Quick Out, Transfer, etc.)
  useFocusEffect(
    useCallback(() => {
      console.log("📋 [DashboardPage] Screen focused, incrementing refreshKey");
      setRefreshKey((prev) => prev + 1);
    }, [])
  );

  return (
    <DashboardScreenComponent
      onOpenSettings={() => router.push("/settings")}
      // Helper for pending list - currently mapped to settings or we can make a modal
      onOpenPendingList={() => router.push("/settings")}
      onOpenInventory={(mode, area, captureMode) => {
        // Map simplified mode to camera route
        // mode: 'stock' | 'import' | 'sales'
        console.log("Navigating to camera:", mode, area);
        router.push({
          pathname: `/camera/${mode}`,
          params: {
            // areaId: Not needed, screen loads it from type
            areaType: area, // Pass through directly - StorageArea type is already "WAREHOUSE" | "BAR"
            captureMode,
          },
        });
      }}
      onOpenIngredients={() => router.push("/inventory")}
      onOpenTransfer={() => {
        // Navigate to transfer camera or screen
        // Assuming /camera/transfer exists or we use a specific form
        router.push("/camera/transfer");
      }}
      onOpenQuickOut={() => {
        // Navigate to Quick Out screen
        router.push("/camera/quickout");
      }}
      refreshKey={refreshKey}
    />
  );
}
