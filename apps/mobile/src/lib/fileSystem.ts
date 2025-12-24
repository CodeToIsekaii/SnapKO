/**
 * File System Utilities
 * Per .antigravityrules: Local image management before sync
 *
 * Handles:
 * - Storing captured images locally
 * - Compressing images before upload
 * - Cleaning up after successful sync
 */

import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

/**
 * Get document directory path
 * Using a function to avoid type issues with documentDirectory
 */
function getDocumentDirectory(): string {
  // Cast to any to avoid TypeScript issues with expo-file-system types
  const fs = FileSystem as unknown as { documentDirectory: string | null };
  return fs.documentDirectory ?? "";
}

/**
 * Get pending images directory path
 */
function getPendingImagesDir(): string {
  return `${getDocumentDirectory()}pending_images/`;
}

/**
 * Ensure the pending images directory exists
 */
export async function ensurePendingImagesDir(): Promise<void> {
  const pendingDir = getPendingImagesDir();
  const dirInfo = await FileSystem.getInfoAsync(pendingDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(pendingDir, {
      intermediates: true,
    });
  }
}

/**
 * Save a captured image to local storage
 * @param uri - The URI of the captured image
 * @param prefix - Prefix for the filename (e.g., 'import', 'stock', 'transfer')
 * @returns The local file path
 */
export async function saveImageLocally(
  uri: string,
  prefix: string = "image"
): Promise<string> {
  await ensurePendingImagesDir();

  const timestamp = Date.now();
  const filename = `${prefix}_${timestamp}.jpg`;
  const localPath = `${getPendingImagesDir()}${filename}`;

  await FileSystem.copyAsync({
    from: uri,
    to: localPath,
  });

  return localPath;
}

/**
 * Compress an image for upload
 * Per .antigravityrules: Use expo-image-manipulator for compression
 *
 * @param uri - The URI of the image to compress
 * @param maxWidth - Maximum width (default: 1024)
 * @param quality - JPEG quality (default: 0.7)
 * @returns Compressed image URI
 */
export async function compressImage(
  uri: string,
  maxWidth: number = 1024,
  quality: number = 0.7
): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: maxWidth } }],
    {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return result.uri;
}

/**
 * Get Base64 encoded image for API calls
 * @param uri - The URI of the image
 * @returns Base64 encoded string
 */
export async function getImageBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
  return base64;
}

/**
 * Delete a local image after successful sync
 * @param localPath - The local file path to delete
 */
export async function deleteLocalImage(localPath: string): Promise<void> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(localPath);
    }
  } catch (error) {
    console.warn("Failed to delete local image:", error);
  }
}

/**
 * Get all pending images (for debugging/cleanup)
 */
export async function getPendingImages(): Promise<string[]> {
  await ensurePendingImagesDir();
  const pendingDir = getPendingImagesDir();
  const files = await FileSystem.readDirectoryAsync(pendingDir);
  return files.map((f) => `${pendingDir}${f}`);
}

/**
 * Clean up all pending images (use with caution!)
 */
export async function cleanupAllPendingImages(): Promise<void> {
  const files = await getPendingImages();
  await Promise.all(files.map((f) => deleteLocalImage(f)));
}

/**
 * Get file size in bytes
 */
export async function getFileSize(uri: string): Promise<number> {
  const fileInfo = await FileSystem.getInfoAsync(uri);
  // expo-file-system types don't include size directly, cast as needed
  return (fileInfo as { size?: number }).size ?? 0;
}
