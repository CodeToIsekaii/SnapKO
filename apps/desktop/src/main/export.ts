/**
 * SnapKO Desktop - Export Module
 * Excel export with Save As dialog (per user feedback)
 */

import { ipcMain, dialog, BrowserWindow } from "electron";
import * as XLSX from "xlsx";
import fs from "fs";

/**
 * Format date for filename (avoid Windows colon error)
 * Returns: YYYY-MM-DD_HH-mm
 */
function formatDateForFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

/**
 * Register export IPC handlers
 */
export function registerExportIPC(mainWindow: BrowserWindow | null): void {
  // Export ingredients to Excel with Save As dialog
  ipcMain.handle(
    "export:excel",
    async (
      _event,
      data: Array<{
        name: string;
        base_unit: string;
        warehouse_qty: number;
        bar_qty: number;
        unit_cost: number;
      }>
    ) => {
      try {
        // 1. Show Save As dialog (CRITICAL FIX: Windows-safe filename)
        const { filePath } = await dialog.showSaveDialog({
          title: "Xuất báo cáo tồn kho",
          defaultPath: `inventory_report_${formatDateForFilename()}.xlsx`,
          filters: [{ name: "Excel", extensions: ["xlsx"] }],
        });

        if (!filePath) {
          return { success: false, cancelled: true };
        }

        // 2. Transform data for Vietnamese headers
        const exportData = data.map((item, index) => ({
          STT: index + 1,
          "Tên nguyên liệu": item.name,
          "Đơn vị": item.base_unit || "N/A",
          "SL Kho": item.warehouse_qty,
          "SL Quầy": item.bar_qty,
          "Tổng SL": item.warehouse_qty + item.bar_qty,
          "Đơn giá (VNĐ)": item.unit_cost,
          "Giá trị (VNĐ)": (item.warehouse_qty + item.bar_qty) * item.unit_cost,
        }));

        // Add summary row
        const totalValue = exportData.reduce(
          (sum, row) => sum + (row["Giá trị (VNĐ)"] || 0),
          0
        );
        exportData.push({
          STT: 0,
          "Tên nguyên liệu": "TỔNG CỘNG",
          "Đơn vị": "",
          "SL Kho": 0,
          "SL Quầy": 0,
          "Tổng SL": 0,
          "Đơn giá (VNĐ)": 0,
          "Giá trị (VNĐ)": totalValue,
        });

        // 3. Create workbook
        const worksheet = XLSX.utils.json_to_sheet(exportData);

        // Set column widths
        worksheet["!cols"] = [
          { wch: 5 }, // STT
          { wch: 25 }, // Tên
          { wch: 10 }, // Đơn vị
          { wch: 10 }, // SL Kho
          { wch: 10 }, // SL Quầy
          { wch: 10 }, // Tổng SL
          { wch: 15 }, // Đơn giá
          { wch: 18 }, // Giá trị
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Tồn kho");

        // 4. Write file
        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "buffer",
        });
        fs.writeFileSync(filePath, buffer);

        console.log("[Export] Excel saved to:", filePath);
        return { success: true, path: filePath };
      } catch (err: any) {
        console.error("[Export] Error:", err);
        return { success: false, error: err.message };
      }
    }
  );

  // Export COGS report to Excel
  ipcMain.handle(
    "export:cogsReport",
    async (
      _event,
      reportData: {
        summary: { totalValue: number; cogsPercent: number };
        monthly: Array<{ month: string; import: number; waste: number }>;
      }
    ) => {
      try {
        const { filePath } = await dialog.showSaveDialog({
          title: "Xuất báo cáo COGS",
          defaultPath: `cogs_report_${formatDateForFilename()}.xlsx`,
          filters: [{ name: "Excel", extensions: ["xlsx"] }],
        });

        if (!filePath) {
          return { success: false, cancelled: true };
        }

        const workbook = XLSX.utils.book_new();

        // Summary sheet
        const summaryData = [
          ["BÁO CÁO GIÁ VỐN (COGS)", ""],
          ["Ngày xuất", new Date().toLocaleDateString("vi-VN")],
          ["", ""],
          ["Tổng giá trị tồn kho", reportData.summary.totalValue],
          ["Tỷ lệ COGS (%)", reportData.summary.cogsPercent],
        ];
        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Tổng quan");

        // Monthly sheet
        const monthlySheet = XLSX.utils.json_to_sheet(
          reportData.monthly.map((m) => ({
            Tháng: m.month,
            "Nhập kho (VNĐ)": m.import,
            "Hao hụt (VNĐ)": m.waste,
            "Chênh lệch": m.import - m.waste,
          }))
        );
        XLSX.utils.book_append_sheet(workbook, monthlySheet, "Theo tháng");

        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "buffer",
        });
        fs.writeFileSync(filePath, buffer);

        return { success: true, path: filePath };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    }
  );

  console.log("[Export] IPC handlers registered");
}
