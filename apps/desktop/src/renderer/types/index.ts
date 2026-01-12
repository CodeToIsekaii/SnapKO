// src/types/index.ts - Shared Type Definitions
// All interfaces MUST be defined here, not in component files (.antigravityrules)

export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  base_unit: string;
  warehouse_qty: number;
  bar_qty: number;
  unit_cost: number;
  min_threshold?: number;
  type?: "raw_material" | "supply" | "semi_product";
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
  monthly: Array<{ month: string; warehouse: number; bar: number }>;
  losses: Array<{ name: string; value: number; color: string }>;
}

export interface ActivityLog {
  id: string;
  created_at: string;
  staff_name: string;
  action: string;
  details: string;
  quantity_change?: number;
}
