// src/types/index.ts - Shared Type Definitions
// All interfaces MUST be defined here, not in component files (.antigravityrules)

export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface StockLevel {
  id: string;
  ingredient_id: string;
  area_id: string;
  quantity: number;
  last_counted_at?: string | null;
}

export interface StorageArea {
  id: string;
  business_id: string;
  name: string;
  type: "STORAGE" | "SERVICE";
  is_default: number;
  is_active: number;
}

export interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  stock_check_unit?: string | null;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  last_purchase_price?: number | null;
  last_purchase_qty?: number | null;
  last_purchase_unit?: string | null;
  density?: number | null;
  unit_weight?: number | null;
  unit_weight_unit?: string | null;
  min_threshold?: number;
  type?: "raw_material" | "supply" | "semi_product" | "resale_item";
  shelf_life_days?: number | null;
  stock_levels?: StockLevel[];
}

export interface PendingLog {
  id: string;
  type: string;
  created_at: string;
}

export interface SyncStatus {
  pending: number;
  lastSync: string | null;
  syncing: boolean;
  lastError: string | null;
}

export interface ToastMessage {
  id: string;
  type: "info" | "success" | "warning";
  message: string;
}

export interface StaffProfile {
  id: string;
  full_name: string;
  phone_number: string;
  role: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE" | "REJECTED";
  created_at: string;
}

export interface COGSReport {
  summary: {
    totalValue: number;
    itemCount: number;
    lowStockCount: number;
  };
  monthly: Array<{
    month: string;
    date?: string;
    fullDate?: string;
    warehouse: number;
    bar: number;
  }>;
  losses: Array<{ name: string; value: number; color: string }>;
}

export interface ActivityLogItem {
  ingredient_name?: string;
  name?: string;
  rawName?: string;
  original_name?: string;
  quantity?: number;
  unit?: string;
}

export interface ActivityLog {
  id: string;
  created_at: string;
  staff_name: string;
  action: string;
  details: string;
  quantity_change?: number;
  items?: ActivityLogItem[]; // For expandable dropdown
}
