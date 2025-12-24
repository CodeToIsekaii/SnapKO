/**
 * Lib Module Exports
 * Centralized utilities per .antigravityrules
 */

export {
  supabase,
  getCurrentUserId,
  getCurrentBusinessId,
  isAuthenticated,
} from "./supabase";
export type { Session, User } from "./supabase";

export {
  saveImageLocally,
  compressImage,
  getImageBase64,
  deleteLocalImage,
  getPendingImages,
  cleanupAllPendingImages,
  getFileSize,
} from "./fileSystem";
