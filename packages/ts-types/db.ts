/**
 * SnapKO Database Types - Single Source of Truth
 * These interfaces match Supabase PostgreSQL schema
 */

// ================== ENUMS ==================

export type TierEnum = "FREE" | "PRO" | "CHAIN";
export type ProfileRoleEnum = "OWNER" | "BRANCH_MANAGER" | "STAFF";
export type ProfileStatusEnum = "PENDING" | "ACTIVE" | "INACTIVE" | "REJECTED";
export type InventoryLocationEnum = "WAREHOUSE" | "BAR";
export type InventoryTypeEnum =
  | "IMPORT"
  | "TRANSFER"
  | "AUDIT"
  | "WASTE"
  | "LENT";
export type PaymentStatusEnum = "PENDING" | "SUCCESS" | "FAILED";
export type PaymentGatewayEnum = "SEPAY" | "CASSO" | "PAYOS" | "MANUAL";

// ================== TABLES ==================

export interface Business {
  id: string;
  name: string;
  invite_code: string | null;
  tier: TierEnum;
  privacy_policy_version: string | null;
  tos_version: string | null;
  last_backup_at: string | null;
  dpia_report_version: string | null;
  legal_entity_status: boolean;
  payment_short_code: string | null;
  subscription_expires_at: string | null;
  chain_state?:
    | "ACTIVE"
    | "READ_ONLY_EXPIRED"
    | "BRANCH_SELECTION_REQUIRED"
    | "HUB_REBASELINE_REQUIRED"
    | "MIGRATION_REQUIRED";
  chain_outlet_limit?: number;
  created_at: string;
}

export interface Profile {
  id: string;
  business_id: string;
  role: ProfileRoleEnum;
  status: ProfileStatusEnum;
  full_name: string | null;
  phone_number: string | null;
  created_at: string;
}

export interface Ingredient {
  id: string;
  business_id: string;
  name: string;
  aliases: string[];
  base_unit: string | null;
  stock_check_unit?: string | null;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  business_id: string;
  name: string;
  selling_price: number;
  created_at: string;
}

export interface RecipeIngredient {
  recipe_id: string;
  ingredient_id: string;
  quantity_needed: number;
}

export interface InventoryLog {
  id: string;
  business_id: string;
  ingredient_id: string | null;
  location: InventoryLocationEnum;
  type: InventoryTypeEnum;
  created_by: string | null;
  ai_parsed_quantity: number | null;
  ai_confidence_score: number | null;
  final_confirmed_quantity: number | null;
  quantity_change_base: number | null;
  unit_cost_at_time: number | null;
  source_photos: string[];
  photo_metadata: Record<string, unknown> | null;
  ai_parsed_json: Record<string, unknown> | null;
  staff_note: string | null;
  is_verified: boolean;
  diff_percentage: number | null;
  synced_at: string | null;
  created_at: string;
}

export interface DpiaLog {
  id: string;
  business_id: string;
  log_id: string | null;
  data_processed: Record<string, unknown>;
  triggered_by: string;
  created_at: string;
}

export interface PaymentTransaction {
  id: string;
  business_id: string;
  amount: number;
  status: PaymentStatusEnum;
  transaction_code: string | null;
  gateway: PaymentGatewayEnum;
  created_at: string;
  updated_at: string;
}

export interface AiMonitoringLog {
  id: string;
  business_id: string;
  log_id: string | null;
  acceptance_rate: number | null;
  hallucination_detected: boolean;
  api_cost: number | null;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  business_id: string;
  created_by: string | null;
  issue_type:
    | "PASSWORD_RESET"
    | "DEVICE_LOSS"
    | "AI_ERROR"
    | "MIGRATION_FAIL"
    | "OTHER";
  description: string | null;
  status: "OPEN" | "RESOLVED";
  created_at: string;
}

// ================== AI TYPES ==================

export interface AiParsedItem {
  name: string;
  quantity: number;
  unit: string;
  confidence: number; // 0-100
  unit_cost?: number;
}

export interface AiParseResult {
  items: AiParsedItem[];
  rawJson: string;
  total_confidence: number;
}

// ================== SYNC TYPES ==================

export interface PendingSyncLog {
  id: string;
  ingredient_id: string | null;
  location: InventoryLocationEnum;
  type: InventoryTypeEnum;
  ai_parsed_quantity: number | null;
  ai_confidence_score: number | null;
  final_confirmed_quantity: number | null;
  quantity_change_base: number | null;
  unit_cost_at_time: number | null;
  source_photo_urls: string[];
  ai_parsed_json: string | null;
  staff_note: string | null;
  is_verified: boolean;
  diff_percentage: number | null;
  created_at: string;
  synced: boolean;
  sync_error: string | null;
}

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
}
