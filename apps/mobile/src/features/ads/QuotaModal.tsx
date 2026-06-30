import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { api } from "../../services/api";
import { showRewardedScanAd } from "./rewardedAds";

interface QuotaModalProps {
  visible: boolean;
  adRewardScans: number;
  maxAdRewardsPerDay: number;
  canWatchAd: boolean;
  onClose: () => void;
  onRewardGranted: () => void;
}

export function QuotaModal({
  visible,
  adRewardScans,
  maxAdRewardsPerDay,
  canWatchAd,
  onClose,
  onRewardGranted,
}: QuotaModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) {
      setLoading(false);
      setErrorMessage(null);
    }
  }, [visible]);

  const handleWatchAd = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const didEarnReward = await showRewardedScanAd();

      if (!didEarnReward) {
        setErrorMessage(
          "Bạn cần xem hết quảng cáo để nhận thêm lượt scan."
        );
        return;
      }

      await api.post("/scans/reward-ad");
      onRewardGranted();
    } catch {
      setErrorMessage("Không thể tải quảng cáo lúc này. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const limitText =
    maxAdRewardsPerDay === -1 ? "" : ` (tối đa ${maxAdRewardsPerDay} lần/ngày)`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>📷</Text>
          <Text style={styles.title}>Hết lượt scan tháng này</Text>
          <Text style={styles.body}>
            Bạn đã dùng hết lượt scan miễn phí tháng này.
          </Text>

          {canWatchAd && (
            <>
              <Text style={styles.adInfo}>
                Xem 1 quảng cáo để nhận thêm{" "}
                <Text style={styles.highlight}>+{adRewardScans} lượt</Text>
                {limitText}.
              </Text>
              {errorMessage && (
                <Text style={styles.errorText}>{errorMessage}</Text>
              )}
              <TouchableOpacity
                style={styles.btnAd}
                onPress={handleWatchAd}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnAdText}>
                    📺 Xem quảng cáo (+{adRewardScans} lượt)
                  </Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.btnClose} onPress={onClose}>
            <Text style={styles.btnCloseText}>Đóng</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#1A1A1A",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: "#F5F3EF", marginBottom: 8 },
  body: { fontSize: 14, color: "#B8B3A8", textAlign: "center", marginBottom: 12 },
  adInfo: { fontSize: 13, color: "#B8B3A8", textAlign: "center", marginBottom: 16 },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    textAlign: "center",
  },
  highlight: { color: "#E07A2F", fontWeight: "700" },
  btnAd: {
    backgroundColor: "#E07A2F",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
    marginBottom: 10,
  },
  btnAdText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnClose: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    width: "100%",
    alignItems: "center",
  },
  btnCloseText: { color: "#B8B3A8", fontSize: 14 },
});
