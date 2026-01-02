import { useState, useEffect } from "react";
import { getDB } from "../db";

export interface IncomingItem {
  name: string;
  qty: number;
  unit: string;
  created_at: string;
  source: "IMPORT" | "TRANSFER";
}

export function useTodayIncoming(areaId: string | null) {
  const [items, setItems] = useState<IncomingItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!areaId) {
      setItems([]);
      return;
    }

    const loadIncoming = async () => {
      setLoading(true);
      try {
        const db = await getDB();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startOfDayISO = startOfDay.toISOString();

        const transfers = await db.getAllAsync<{
          items_json: string;
          created_at: string;
        }>(
          `SELECT items_json, created_at FROM local_transfer_logs 
           WHERE to_area_id = ? AND created_at >= ?`,
          [areaId, startOfDayISO]
        );

        const imports = await db.getAllAsync<{
          items_json: string;
          created_at: string;
        }>(
          `SELECT items_json, created_at FROM local_import_logs 
           WHERE target_area_id = ? AND created_at >= ?`,
          [areaId, startOfDayISO]
        );

        const allItems: IncomingItem[] = [];

        // Parse Transfers
        transfers.forEach((row) => {
          try {
            const parsed = JSON.parse(row.items_json);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                allItems.push({
                  name: item.ingredient_name || item.name || "Unknown",
                  qty: parseFloat(item.quantity || 0),
                  unit: item.unit || "đv",
                  created_at: row.created_at,
                  source: "TRANSFER",
                });
              });
            }
          } catch (e) {
            console.error("Error parsing transfer log:", e);
          }
        });

        // Parse Imports
        imports.forEach((row) => {
          try {
            const parsed = JSON.parse(row.items_json);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                allItems.push({
                  name: item.ingredient_name || item.name || "Unknown",
                  qty: parseFloat(item.quantity || 0),
                  unit: item.unit || "đv",
                  created_at: row.created_at,
                  source: "IMPORT",
                });
              });
            }
          } catch (e) {
            console.error("Error parsing import log:", e);
          }
        });

        // Sort recent first
        allItems.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setItems(allItems);
      } catch (err) {
        console.error("[useTodayIncoming] Error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadIncoming();
  }, [areaId]);

  return { items, loading };
}
