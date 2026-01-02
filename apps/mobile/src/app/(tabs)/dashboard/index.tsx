import { useRouter } from "expo-router";
import DashboardScreenComponent from "../../../screens/DashboardScreen";
import { Alert } from "react-native";

export default function DashboardPage() {
  const router = useRouter();

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
            areaType:
              area === "warehouse"
                ? "WAREHOUSE"
                : area === "bar"
                ? "BAR"
                : undefined,
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
    />
  );
}
