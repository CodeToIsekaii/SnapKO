// src/features/inventory/hooks/useInventoryCapture.ts
// SOLID: Controller Pattern - Hook handles capture logic
// Encapsulates Camera, Image Compression, and Pending Log creation

import { useState, useCallback, useRef } from "react";
import { CameraView } from "expo-camera";
import { File, Paths } from "expo-file-system/next";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { PendingLogService } from "../services/inventory.service";

interface CaptureResult {
  success: boolean;
  localPath?: string;
  error?: string;
}

interface UseInventoryCaptureReturn {
  cameraRef: React.MutableRefObject<CameraView | null>;
  isCapturing: boolean;
  lastPhoto: string | null;
  error: string | null;

  // Actions
  capture: () => Promise<CaptureResult>;
  saveLog: (data: {
    ingredientId?: string;
    location: string;
    type: string;
    aiParsedQty?: number;
    confirmedQty?: number;
    diffPercent?: number;
  }) => Promise<boolean>;
  clearPhoto: () => void;
}

// Helper: Compress image for efficient storage
async function compressImage(uri: string): Promise<string> {
  try {
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1024, height: 1024 } }], // Aligned with aiService.ts (1024px max)
      { compress: 0.7, format: SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri; // Return original if compression fails
  }
}

// Helper: Generate unique ID
function generateId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useInventoryCapture(): UseInventoryCaptureReturn {
  const cameraRef = useRef<CameraView | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const capture = useCallback(async (): Promise<CaptureResult> => {
    if (!cameraRef.current) {
      return { success: false, error: "Camera not ready" };
    }

    setIsCapturing(true);
    setError(null);

    try {
      // 1. Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        throw new Error("Failed to capture photo");
      }

      // 2. Compress image (.antigravityrules: optimize storage)
      const compressedUri = await compressImage(photo.uri);

      // 3. Move to permanent location using expo-file-system/next API
      const fileName = `inventory_${Date.now()}.jpg`;
      const photosDir = new File(Paths.document, "photos");

      // Ensure directory exists
      if (!photosDir.exists) {
        photosDir.create();
      }

      // Move compressed file
      const sourceFile = new File(compressedUri);
      const destFile = new File(photosDir, fileName);
      sourceFile.move(destFile);

      const permanentPath = destFile.uri;

      setLastPhoto(permanentPath);
      return { success: true, localPath: permanentPath };
    } catch (err: any) {
      const errorMsg = err.message || "Capture failed";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    } finally {
      setIsCapturing(false);
    }
  }, []);

  const saveLog = useCallback(
    async (data: {
      ingredientId?: string;
      location: string;
      type: string;
      aiParsedQty?: number;
      confirmedQty?: number;
      diffPercent?: number;
    }): Promise<boolean> => {
      try {
        await PendingLogService.add({
          id: generateId(),
          ingredient_id: data.ingredientId,
          location: data.location,
          type: data.type,
          ai_parsed_quantity: data.aiParsedQty,
          final_confirmed_quantity: data.confirmedQty,
          diff_percentage: data.diffPercent,
          local_image_path: lastPhoto || undefined,
          created_at: new Date().toISOString(),
        });

        return true;
      } catch (err: any) {
        console.error("[useInventoryCapture] Save error:", err);
        setError(err.message || "Failed to save log");
        return false;
      }
    },
    [lastPhoto]
  );

  const clearPhoto = useCallback(() => {
    setLastPhoto(null);
    setError(null);
  }, []);

  return {
    cameraRef,
    isCapturing,
    lastPhoto,
    error,
    capture,
    saveLog,
    clearPhoto,
  };
}
