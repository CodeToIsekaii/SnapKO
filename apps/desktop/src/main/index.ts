import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { initDatabase, closeDatabase, registerDatabaseIPC } from "./database";
import { registerPrinterIPC } from "./printer";

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Initialize local database
  initDatabase();
  console.log("[SnapKO Desktop] Database initialized");

  // Register IPC handlers
  registerDatabaseIPC();
  registerPrinterIPC();
  console.log("[SnapKO Desktop] IPC handlers registered");

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  closeDatabase();
  if (process.platform !== "darwin") app.quit();
});
