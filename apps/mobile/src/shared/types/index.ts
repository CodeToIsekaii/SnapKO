// src/shared/types/index.ts - Shared Type Definitions
// All common interfaces MUST be defined here

export interface User {
  id: string;
  email: string;
  role?: "OWNER" | "BRANCH_MANAGER" | "STAFF";
  businessId?: string;
  fullName?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  stock_check_unit?: string | null;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  business_id?: string;
}

export interface Recipe {
  id: string;
  name: string;
  serving_size: number;
  business_id: string;
  ingredients?: RecipeIngredient[];
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  unit: string;
  ingredient?: Ingredient;
}

export interface InventoryLog {
  id: string;
  ingredient_id: string;
  location: "warehouse" | "bar";
  type: "add" | "transfer" | "adjustment";
  quantity_before: number;
  quantity_after: number;
  unit: string;
  source_photo_url?: string;
  ai_parsed_quantity?: number;
  final_confirmed_quantity?: number;
  diff_percentage?: number;
  created_at: string;
}

export interface PendingSyncLog {
  id: string;
  data_json: string;
  local_image_path?: string;
  sync_status: "pending" | "syncing" | "synced" | "error";
  created_at: string;
}

export interface SyncStatus {
  pending: number;
  syncing: boolean;
  lastSync: string | null;
}
