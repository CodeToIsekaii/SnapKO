import { calculateNetVolume } from "@snapko/shared";

export type VolumeWeightFeedback =
  | { kind: "invalid" }
  | { kind: "converted"; netMl: number };

export function parseNumericField(text: string): number {
  const parsed = Number.parseFloat(text.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getVolumeWeightFeedback(params: {
  baseUnit?: string | null;
  inputUnit?: string | null;
  quantity: number;
  tareWeight?: number | null;
  density?: number | null;
}): VolumeWeightFeedback | null {
  const baseUnit = params.baseUnit ?? "";
  const inputUnit = params.inputUnit ?? "";
  const isVolumeBased =
    baseUnit === "ml" || baseUnit === "l" || baseUnit === "lít";
  const isWeightInput = inputUnit === "g" || inputUnit === "kg";

  if (!isVolumeBased || !isWeightInput) return null;

  const netMl = calculateNetVolume(
    params.quantity,
    inputUnit,
    params.tareWeight || 0,
    params.density || 1,
  );

  if (netMl === null || netMl === -1) {
    return { kind: "invalid" };
  }

  return { kind: "converted", netMl };
}
