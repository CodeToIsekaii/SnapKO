/**
 * Quick Out Route - Direct form (no camera)
 * For stock disposal: Vỡ/Hỏng, Cho Mượn, Marketing
 */

import { useRouter } from "expo-router";
import QuickOutScreen from "../../screens/QuickOutScreen";

export default function QuickOutPage() {
  const router = useRouter();

  return (
    <QuickOutScreen
      onBack={() => router.back()}
      onSuccess={() => router.replace("/dashboard")}
    />
  );
}
