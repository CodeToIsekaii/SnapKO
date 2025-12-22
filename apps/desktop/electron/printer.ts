/**
 * SnapKO Desktop - ESC/POS Thermal Printer Module
 * Supports USB and network printers for inventory reports
 */

import { ipcMain } from "electron";

// ESC/POS commands
const ESC = 0x1b;
const GS = 0x1d;

const commands = {
  // Initialize printer
  init: Buffer.from([ESC, 0x40]),
  // Text alignment
  alignLeft: Buffer.from([ESC, 0x61, 0x00]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  // Text style
  bold: Buffer.from([ESC, 0x45, 0x01]),
  boldOff: Buffer.from([ESC, 0x45, 0x00]),
  doubleHeight: Buffer.from([ESC, 0x21, 0x10]),
  normalSize: Buffer.from([ESC, 0x21, 0x00]),
  // Line feed
  newline: Buffer.from([0x0a]),
  // Cut paper
  cut: Buffer.from([GS, 0x56, 0x00]),
  partialCut: Buffer.from([GS, 0x56, 0x01]),
};

interface InventoryItem {
  name: string;
  quantity: number;
  unit: string;
  location?: string;
}

interface PrintReportOptions {
  title: string;
  items: InventoryItem[];
  createdBy?: string;
  date?: string;
  businessName?: string;
}

// Build ESC/POS buffer for inventory report
function buildInventoryReport(options: PrintReportOptions): Buffer {
  const parts: Buffer[] = [];
  const encoder = new TextEncoder();

  // Helper to add text line
  const addLine = (text: string) => {
    parts.push(Buffer.from(encoder.encode(text)));
    parts.push(commands.newline);
  };

  // Initialize
  parts.push(commands.init);

  // Header
  parts.push(commands.alignCenter);
  parts.push(commands.bold);
  parts.push(commands.doubleHeight);
  addLine(options.businessName || "SnapKO");
  parts.push(commands.normalSize);
  addLine("-----------------------------");
  parts.push(commands.boldOff);

  // Title
  parts.push(commands.bold);
  addLine(options.title);
  parts.push(commands.boldOff);
  parts.push(commands.newline);

  // Date and creator
  parts.push(commands.alignLeft);
  addLine(`Ngày: ${options.date || new Date().toLocaleDateString("vi-VN")}`);
  if (options.createdBy) {
    addLine(`Người tạo: ${options.createdBy}`);
  }
  addLine("-----------------------------");
  parts.push(commands.newline);

  // Column headers
  parts.push(commands.bold);
  addLine("STT  Nguyên liệu          SL   ĐV");
  parts.push(commands.boldOff);
  addLine("-----------------------------");

  // Items
  options.items.forEach((item, idx) => {
    const num = String(idx + 1).padStart(3, " ");
    const name = item.name.slice(0, 18).padEnd(18, " ");
    const qty = String(item.quantity).padStart(5, " ");
    const unit = item.unit.slice(0, 4);
    addLine(`${num}  ${name} ${qty} ${unit}`);
  });

  // Footer
  addLine("-----------------------------");
  parts.push(commands.alignCenter);
  addLine(`Tổng: ${options.items.length} nguyên liệu`);
  parts.push(commands.newline);
  addLine("--- Hết ---");

  // Feed and cut
  parts.push(commands.newline);
  parts.push(commands.newline);
  parts.push(commands.newline);
  parts.push(commands.partialCut);

  return Buffer.concat(parts);
}

// Printer connection interfaces
interface USBPrinterConfig {
  type: "usb";
  vendorId: number;
  productId: number;
}

interface NetworkPrinterConfig {
  type: "network";
  host: string;
  port: number;
}

type PrinterConfig = USBPrinterConfig | NetworkPrinterConfig;

// Print via network (TCP)
async function printToNetwork(
  buffer: Buffer,
  host: string,
  port: number
): Promise<{ success: boolean; error?: string }> {
  const net = await import("node:net");

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(10000); // 10 second timeout

    socket.on("connect", () => {
      socket.write(buffer, () => {
        socket.end();
        if (!resolved) {
          resolved = true;
          resolve({ success: true });
        }
      });
    });

    socket.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: err.message });
      }
    });

    socket.on("timeout", () => {
      socket.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: "Connection timeout" });
      }
    });

    socket.connect(port, host);
  });
}

// Register IPC handlers for printer
export function registerPrinterIPC(): void {
  // Print inventory report
  ipcMain.handle(
    "printer:printInventoryReport",
    async (
      _event,
      options: PrintReportOptions,
      printerConfig: PrinterConfig
    ) => {
      try {
        const buffer = buildInventoryReport(options);

        if (printerConfig.type === "network") {
          return await printToNetwork(
            buffer,
            printerConfig.host,
            printerConfig.port
          );
        }

        // USB printing requires additional packages like 'usb' or 'escpos'
        // For MVP, we'll return an error suggesting network printer
        return {
          success: false,
          error: "USB printing not yet implemented. Use network printer.",
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Print failed",
        };
      }
    }
  );

  // Test printer connection
  ipcMain.handle(
    "printer:testConnection",
    async (_event, printerConfig: PrinterConfig) => {
      if (printerConfig.type === "network") {
        const testBuffer = Buffer.concat([
          commands.init,
          Buffer.from("SnapKO Printer Test\n"),
          commands.newline,
          commands.partialCut,
        ]);

        return await printToNetwork(
          testBuffer,
          printerConfig.host,
          printerConfig.port
        );
      }

      return { success: false, error: "USB test not implemented" };
    }
  );

  console.log("[Printer] IPC handlers registered");
}

export { buildInventoryReport, PrintReportOptions, PrinterConfig };
