/**
 * useLowStock Hook
 * Fetches all low stock items once, filters by type on client side
 * Per user feedback: more efficient than 2 separate API calls
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { getDB } from "../db";

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  min_threshold: number;
  unit: string;
  type: string; // 'raw_material' | 'supply' | 'semi_product'
}

export const useLowStock = () => {
  const [allItems, setAllItems] = useState<LowStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLowStock = useCallback(async () => {
    try {
      setIsLoading(true);
      const db = await getDB();

      // Fetch ALL low stock items in one query
      const items = await db.getAllAsync<LowStockItem>(`
        SELECT 
          i.id,
          i.name,
          COALESCE(SUM(sl.quantity), 0) as quantity,
          i.min_threshold,
          i.base_unit as unit,
          i.type
        FROM local_ingredients i
        LEFT JOIN local_stock_levels sl ON sl.ingredient_id = i.id
        WHERE i.min_threshold > 0 
          AND i.archived = 0
        GROUP BY i.id
        HAVING quantity < i.min_threshold
        ORDER BY (quantity / i.min_threshold) ASC
      `);

      setAllItems(items);
      setError(null);
    } catch (err) {
      console.error("[useLowStock] Failed to fetch:", err);
      setError("Không thể tải dữ liệu");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLowStock();
  }, [fetchLowStock]);

  // Client-side filtering - efficient for small datasets
  const { ingredients, supplies } = useMemo(() => {
    const ingredients = allItems.filter((item) =>
      ["raw_material", "semi_product"].includes(item.type)
    );
    const supplies = allItems.filter((item) => item.type === "supply");
    return { ingredients, supplies };
  }, [allItems]);

  return {
    ingredients,
    supplies,
    totalCount: allItems.length,
    isLoading,
    error,
    refetch: fetchLowStock,
  };
};
