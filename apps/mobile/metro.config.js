const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// 1. Xác định vị trí thư mục hiện tại và thư mục gốc của Monorepo
// apps/mobile -> đi ngược lên 2 cấp là tới root
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

// 2. Lấy config mặc định của Expo
const config = getDefaultConfig(projectRoot);

// 3. Cấu hình WatchFolders:
// Chỉ cần theo dõi các workspace packages mà mobile thật sự import.
// Watch cả monorepo root dễ làm Metro reload liên tục khi desktop/web còn thay đổi.
config.watchFolders = [path.resolve(monorepoRoot, "packages")];

// 4. Cấu hình Node Modules Resolution:
// Giúp Metro tìm thấy các thư viện được cài ở root (do cơ chế của pnpm workspaces)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 5. (Tùy chọn) Chặn Metro tự động leo cây thư mục tìm node_modules lung tung
// Giúp build nhanh hơn và tránh xung đột phiên bản
config.resolver.disableHierarchicalLookup = true;

// 6. Windows local dev: avoid Metro worker spawn EPERM on some locked-down shells.
config.maxWorkers = 1;

// 7. Kết hợp với NativeWind
module.exports = withNativeWind(config, { input: "./global.css" });
