/**
 * File System Utilities
 * Per .antigravityrules: Local image management before sync
 *
 * Handles:
 * - Storing captured images locally
 * - Compressing images before upload
 * - Cleaning up after successful sync
 *
 * MIGRATED to new expo-file-system API (File/Directory classes) in SDK 54
 */

import { File, Directory, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";

// Pending images directory name
const PENDING_IMAGES_DIR = "pending_images";

/**
 * Get pending images directory
 */
function getPendingImagesDirectory(): Directory {
  return new Directory(Paths.document, PENDING_IMAGES_DIR);
}

/**
 * Ensure the pending images directory exists
 */
export async function ensurePendingImagesDir(): Promise<void> {
  const pendingDir = getPendingImagesDirectory();
  if (!pendingDir.exists) {
    pendingDir.create();
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

  // Create source file from URI and copy to pending directory
  const sourceFile = new File(uri);
  const destDir = getPendingImagesDirectory();
  const destFile = new File(destDir, filename);

  sourceFile.copy(destFile);

  return destFile.uri;
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
  const file = new File(uri);
  const base64 = await file.base64();
  return base64;
}

/**
 * Delete a local image after successful sync
 * @param localPath - The local file path to delete
 */
export async function deleteLocalImage(localPath: string): Promise<void> {
  try {
    const file = new File(localPath);
    if (file.exists) {
      file.delete();
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
  const pendingDir = getPendingImagesDirectory();
  const items = pendingDir.list();
  return items
    .filter((item): item is File => item instanceof File)
    .map((file) => file.uri);
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
  const file = new File(uri);
  return file.size ?? 0;
}
