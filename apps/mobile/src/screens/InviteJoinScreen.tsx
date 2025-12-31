/**
 * InviteJoinScreen - Staff onboarding flow (10 seconds!)
 * Enter invite code → Name + Phone → Submit → Pending
 *
 * Uses:
 * - F&B "Organic Tech" theme (Dark mode, Burnt Orange CTA)
 * - Zod validation from @snapko/logic
 * - Data minimization (Name + Phone only)
 */

import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import {
  inviteCodeSchema,
  inviteJoinSchema,
  getFirstError,
  type InviteJoinInput,
} from "@snapko/shared";
import { Env } from "../env";
import { supabase } from "../lib/supabase";

interface InviteJoinScreenProps {
  onSuccess: (profileId: string) => void;
  onBack: () => void;
}

// F&B Theme Colors
const colors = {
  background: "#121212", // Surface base
  surface: "#1A1A1A", // Surface raised
  primary: "#E07A2F", // Burnt Orange - CTA
  primaryMuted: "#C2410C", // Darker orange for disabled
  textPrimary: "#F5F3EF", // Cream white
  textSecondary: "#B8B3A8", // Warm gray
  textMuted: "#64748B", // Slate
  border: "#2A2A2A",
  borderFocused: "#E07A2F",
  error: "#E63946", // Tomato red
};

export default function InviteJoinScreen({
  onSuccess,
  onBack,
}: InviteJoinScreenProps) {
  const [step, setStep] = useState<"code" | "info">("code");
  const [inviteCode, setInviteCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format invite code as user types (uppercase, max 6 chars)
  const handleCodeChange = (text: string) => {
    const formatted = text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    setInviteCode(formatted);
    setError(null);
  };

  // Validate and proceed to info step
  const handleCodeSubmit = () => {
    const validationError = getFirstError(inviteCodeSchema, { inviteCode });
    if (validationError) {
      setError(validationError);
      return;
    }
    setStep("info");
  };

  // Submit join request - calls new auth-join-staff Edge Function
  const handleSubmit = async () => {
    // Validate with Zod
    const data: InviteJoinInput = {
      inviteCode,
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.replace(/\s+/g, ""),
    };

    const validationError = getFirstError(inviteJoinSchema, data);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Call the new auth-join-staff Edge Function (creates shadow account + returns session)
      const response = await fetch(
        `${Env.SUPABASE_URL}/functions/v1/auth-join-staff`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: Env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${Env.SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(data),
        }
      );

      const result = await response.json();

      console.log("[InviteJoin] Response status:", response.status);
      console.log("[InviteJoin] Response body:", result);

      if (!response.ok) {
        if (response.status === 429) {
          setError("Bạn đã thử quá nhiều lần. Vui lòng đợi 1 giờ.");
        } else {
          console.error("[InviteJoin] Error:", result.error);
          setError(result.error || "Có lỗi xảy ra");
        }
        return;
      }

      // AUTO-LOGIN: Set the session returned from Edge Function
      if (result.session) {
        console.log("[InviteJoin] Setting session for auto-login...");
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });

        if (sessionError) {
          console.error("[InviteJoin] Session error:", sessionError);
          setError("Không thể đăng nhập tự động. Vui lòng thử lại.");
          return;
        }

        console.log("[InviteJoin] Auto-login successful!");
      }

      // Success - navigate to pending screen (now authenticated!)
      onSuccess(result.profileId);
    } catch (err) {
      console.error("[InviteJoin] Network error:", err);
      setError("Không thể kết nối. Kiểm tra mạng và thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const isCodeValid = inviteCode.length === 6;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          padding: 24,
          justifyContent: "center",
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <Pressable
          onPress={onBack}
          style={{ position: "absolute", top: 60, left: 20 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 16 }}>
            ← Quay lại
          </Text>
        </Pressable>

        {/* Header with Logo */}
        <View style={{ alignItems: "center", marginBottom: 40 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: colors.primary,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              // Subtle shadow
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Text style={{ color: "white", fontSize: 24, fontWeight: "bold" }}>
              SK
            </Text>
          </View>
          <Text
            style={{
              color: colors.textPrimary,
              fontSize: 24,
              fontWeight: "bold",
              marginBottom: 8,
            }}
          >
            Tham gia quán
          </Text>
          <Text style={{ color: colors.textSecondary, textAlign: "center" }}>
            {step === "code"
              ? "Nhập mã mời từ Owner"
              : "Điền thông tin của bạn"}
          </Text>
        </View>

        {/* Step 1: Invite Code */}
        {step === "code" && (
          <View style={{ gap: 16 }}>
            <TextInput
              value={inviteCode}
              onChangeText={handleCodeChange}
              placeholder="ABC123"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 16,
                color: colors.textPrimary,
                fontSize: 24,
                fontWeight: "bold",
                textAlign: "center",
                letterSpacing: 8,
                borderWidth: 2,
                borderColor: error ? colors.error : colors.border,
              }}
            />

            {error && (
              <Text style={{ color: colors.error, textAlign: "center" }}>
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleCodeSubmit}
              disabled={!isCodeValid}
              style={({ pressed }) => ({
                backgroundColor: isCodeValid
                  ? pressed
                    ? colors.primaryMuted
                    : colors.primary
                  : colors.surface,
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
                // Subtle animation feel
                transform: [{ scale: pressed && isCodeValid ? 0.98 : 1 }],
              })}
            >
              <Text
                style={{
                  color: isCodeValid ? "white" : colors.textMuted,
                  fontSize: 16,
                  fontWeight: "600",
                }}
              >
                Tiếp tục
              </Text>
            </Pressable>
          </View>
        )}

        {/* Step 2: Name & Phone */}
        {step === "info" && (
          <View style={{ gap: 16 }}>
            <View>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                Họ và tên
              </Text>
              <TextInput
                value={fullName}
                onChangeText={(t) => {
                  setFullName(t);
                  setError(null);
                }}
                placeholder="Nguyễn Văn A"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  color: colors.textPrimary,
                  fontSize: 16,
                  borderWidth: 2,
                  borderColor: colors.border,
                }}
              />
            </View>

            <View>
              <Text
                style={{
                  color: colors.textSecondary,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                Số điện thoại
              </Text>
              <TextInput
                value={phoneNumber}
                onChangeText={(t) => {
                  setPhoneNumber(t);
                  setError(null);
                }}
                placeholder="0901234567"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                maxLength={12}
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  color: colors.textPrimary,
                  fontSize: 16,
                  borderWidth: 2,
                  borderColor: colors.border,
                }}
              />
            </View>

            {error && (
              <Text style={{ color: colors.error, textAlign: "center" }}>
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => ({
                backgroundColor: pressed ? colors.primaryMuted : colors.primary,
                borderRadius: 12,
                padding: 16,
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 8,
                opacity: loading ? 0.7 : 1,
                transform: [{ scale: pressed && !loading ? 0.98 : 1 }],
              })}
            >
              {loading && <ActivityIndicator color="white" />}
              <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
                {loading ? "Đang gửi..." : "Tham gia"}
              </Text>
            </Pressable>

            <Pressable onPress={() => setStep("code")}>
              <Text
                style={{
                  color: colors.textSecondary,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                ← Nhập lại mã mời
              </Text>
            </Pressable>
          </View>
        )}

        {/* Privacy note - Data minimization message */}
        <Text
          style={{
            color: colors.textMuted,
            fontSize: 12,
            textAlign: "center",
            marginTop: 40,
          }}
        >
          Chúng tôi chỉ lưu Họ tên và SĐT để xác thực.{"\n"}
          Không thu thập dữ liệu cá nhân khác.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
