/**
 * ThermalPrintTemplate - Hidden component for 80mm thermal printer
 * Per user feedback: Text-only, monospace, no colors/charts
 */

import React from "react";

interface InventoryItem {
  name: string;
  warehouse_qty: number;
  bar_qty: number;
  base_unit: string;
}

interface ThermalPrintTemplateProps {
  items: InventoryItem[];
  businessName?: string;
}

export function ThermalPrintTemplate({
  items,
  businessName = "SnapKO",
}: ThermalPrintTemplateProps) {
  const totalItems = items.length;
  const printDate = new Date().toLocaleDateString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="print-content" style={{ display: "none" }}>
      {/* Header */}
      <div className="print-header">
        <h1 style={{ fontSize: 16, fontWeight: "bold", textAlign: "center" }}>
          {businessName}
        </h1>
        <p style={{ fontSize: 12, textAlign: "center", margin: "4px 0" }}>
          PHIEU KIEM KE TON KHO
        </p>
        <p style={{ fontSize: 10, textAlign: "center", margin: "4px 0" }}>
          {printDate}
        </p>
        <div
          style={{
            borderBottom: "2px solid #000",
            margin: "8px 0",
          }}
        />
      </div>

      {/* Items Table */}
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "Courier New, monospace",
          fontSize: 11,
        }}
      >
        <thead>
          <tr>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px dashed #000",
                padding: "4px 2px",
              }}
            >
              STT
            </th>
            <th
              style={{
                textAlign: "left",
                borderBottom: "1px dashed #000",
                padding: "4px 2px",
              }}
            >
              Ten NL
            </th>
            <th
              style={{
                textAlign: "right",
                borderBottom: "1px dashed #000",
                padding: "4px 2px",
              }}
            >
              Kho
            </th>
            <th
              style={{
                textAlign: "right",
                borderBottom: "1px dashed #000",
                padding: "4px 2px",
              }}
            >
              Quay
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index}>
              <td style={{ padding: "4px 2px" }}>{index + 1}.</td>
              <td style={{ padding: "4px 2px" }}>
                {item.name.length > 15
                  ? item.name.substring(0, 15) + "..."
                  : item.name}
              </td>
              <td style={{ textAlign: "right", padding: "4px 2px" }}>
                {item.warehouse_qty} {item.base_unit}
              </td>
              <td style={{ textAlign: "right", padding: "4px 2px" }}>
                {item.bar_qty} {item.base_unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className="print-footer">
        <div
          style={{
            borderTop: "1px dashed #000",
            margin: "8px 0",
          }}
        />
        <p
          style={{
            fontSize: 12,
            fontWeight: "bold",
            textAlign: "center",
            margin: "8px 0",
          }}
        >
          TONG CONG: {totalItems} mon
        </p>
        <p
          style={{
            fontSize: 10,
            textAlign: "center",
            margin: "8px 0",
          }}
        >
          Nguoi kiem: _______________
        </p>
        <p
          style={{
            fontSize: 10,
            textAlign: "center",
            margin: "8px 0",
          }}
        >
          Chu quan: _______________
        </p>
        <div
          style={{
            borderTop: "2px solid #000",
            margin: "8px 0",
          }}
        />
        <p
          style={{
            fontSize: 9,
            textAlign: "center",
            margin: "4px 0",
          }}
        >
          Powered by SnapKO
        </p>
      </div>
    </div>
  );
}

/**
 * Trigger thermal print
 * Call window.print() when this component is rendered
 */
export function printThermalReceipt(items: InventoryItem[]) {
  // Render component to hidden div
  const printDiv = document.createElement("div");
  printDiv.innerHTML = `
    <div class="print-content">
      <!-- Content will be rendered by React -->
    </div>
  `;
  document.body.appendChild(printDiv);

  // Trigger print
  window.print();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(printDiv);
  }, 1000);
}
