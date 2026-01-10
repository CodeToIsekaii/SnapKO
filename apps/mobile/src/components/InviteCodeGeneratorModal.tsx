/**
 * InviteCodeGeneratorModal - Generate invite codes for staff
 * Features:
 * - Generate 6-char invite code
 * - Copy to clipboard
 * - Share via messaging apps
 * - F&B themed UI
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { supabase } from "../lib/supabase";
import { Env } from "../env";

interface InviteCodeGeneratorModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function InviteCodeGeneratorModal({
  visible,
  onClose,
}: InviteCodeGeneratorModalProps) {
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Generate new invite code
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setInviteCode(null);
    setCopied(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error("Chưa đăng nhập");
      }

      const res = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/invite-create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await res.json();

      if (res.ok && data.inviteCode) {
        setInviteCode(data.inviteCode);
      } else {
        throw new Error(data.error || "Không thể tạo mã mời");
      }
    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!inviteCode) return;

    try {
      await Clipboard.setStringAsync(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      Alert.alert("Lỗi", "Không thể copy mã mời");
    }
  };

  // Share invite code
  const handleShare = async () => {
    if (!inviteCode) return;

    try {
      await Share.share({
        message: `Mời bạn tham gia SnapKO!\n\nMã mời: ${inviteCode}\n\nHạn sử dụng: 48 giờ`,
        title: "Mã mời SnapKO",
      });
    } catch (err) {
      console.log("Share error:", err);
    }
  };

  // Reset on close
  const handleClose = () => {
    setInviteCode(null);
    setError(null);
    setCopied(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: "#121212",
            borderRadius: 20,
            padding: 24,
            width: "100%",
            maxWidth: 340,
          }}
        >
          {/* Header */}
          <Text
            style={{
              color: "white",
              fontSize: 20,
              fontWeight: "700",
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            🔗 Tạo mã mời
          </Text>
          <Text
            style={{
              color: "#94A3B8",
              fontSize: 14,
              textAlign: "center",
              marginBottom: 24,
            }}
          >
            Chia sẻ mã để nhân viên tham gia
          </Text>

          {/* Error */}
          {error && (
            <View
              style={{
                backgroundColor: "rgba(230, 57, 70, 0.15)",
                padding: 12,
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <Text style={{ color: "#E63946", textAlign: "center" }}>
                {error}
              </Text>
            </View>
          )}

          {/* Invite code display */}
          {inviteCode ? (
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <Pressable
                onPress={handleCopy}
                style={{
                  backgroundColor: "#1A1A1A",
                  paddingVertical: 20,
                  paddingHorizontal: 32,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: "#E07A2F",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    color: "#E07A2F",
                    fontSize: 32,
                    fontWeight: "700",
                    fontFamily: "monospace",
                    letterSpacing: 4,
                  }}
                >
                  {inviteCode}
                </Text>
              </Pressable>

              <Text
                style={{ color: copied ? "#6B8E23" : "#64748B", fontSize: 12 }}
              >
                {copied ? "✓ Đã copy!" : "Nhấn để copy mã"}
              </Text>

              <Text style={{ color: "#94A3B8", fontSize: 12, marginTop: 8 }}>
                ⏰ Hết hạn sau 48 giờ
              </Text>
            </View>
          ) : (
            <View style={{ alignItems: "center", marginBottom: 24 }}>
              <View
                style={{
                  backgroundColor: "#1A1A1A",
                  paddingVertical: 20,
                  paddingHorizontal: 32,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: "#2A2A2A",
                  borderStyle: "dashed",
                }}
              >
                <Text
                  style={{
                    color: "#475569",
                    fontSize: 32,
                    fontWeight: "700",
                    fontFamily: "monospace",
                    letterSpacing: 4,
                  }}
                >
                  ------
                </Text>
              </View>
            </View>
          )}

          {/* Buttons */}
          <View style={{ gap: 12 }}>
            {inviteCode ? (
              <Pressable
                onPress={handleShare}
                style={{
                  backgroundColor: "#E07A2F",
                  padding: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "white", fontWeight: "600" }}>
                  📤 Chia sẻ mã mời
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleGenerate}
                disabled={loading}
                style={{
                  backgroundColor: loading ? "#1A1A1A" : "#6B8E23",
                  padding: 16,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                {loading ? (
                  <ActivityIndicator color="#6B8E23" />
                ) : (
                  <Text style={{ color: "white", fontWeight: "600" }}>
                    ✨ Tạo mã mời mới
                  </Text>
                )}
              </Pressable>
            )}

            <Pressable
              onPress={handleClose}
              style={{
                backgroundColor: "#1A1A1A",
                padding: 16,
                borderRadius: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#94A3B8", fontWeight: "600" }}>Đóng</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
