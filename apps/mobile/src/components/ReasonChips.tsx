/**
 * ReasonChips - Selectable reason tags for variance explanation
 * Per .UXUIrules Section 3.D.3: Variance > 15% reason chips
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export type VarianceReason = "BROKEN" | "SPOILED" | "EXPIRED" | "OTHER";

const REASON_OPTIONS: {
  value: VarianceReason;
  label: string;
  emoji: string;
}[] = [
  { value: "BROKEN", label: "Đổ vỡ", emoji: "💔" },
  { value: "SPOILED", label: "Hư hỏng", emoji: "🗑️" },
  { value: "EXPIRED", label: "Hết hạn", emoji: "📅" },
  { value: "OTHER", label: "Khác", emoji: "📝" },
];

interface ReasonChipsProps {
  selected: VarianceReason | null;
  onSelect: (reason: VarianceReason) => void;
}

export default function ReasonChips({ selected, onSelect }: ReasonChipsProps) {
  return (
    <View style={styles.container}>
      {REASON_OPTIONS.map((option) => (
        <Pressable
          key={option.value}
          style={[
            styles.chip,
            selected === option.value && styles.chipSelected,
          ]}
          onPress={() => onSelect(option.value)}
        >
          <Text style={styles.emoji}>{option.emoji}</Text>
          <Text
            style={[
              styles.label,
              selected === option.value && styles.labelSelected,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
  },
  chipSelected: {
    borderColor: "#E63946", // Tomato Red when selected
    backgroundColor: "rgba(230, 57, 70, 0.15)",
  },
  emoji: {
    fontSize: 16,
    marginRight: 6,
  },
  label: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
  },
  labelSelected: {
    color: "#F5F3EF",
  },
});
