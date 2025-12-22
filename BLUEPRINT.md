# SnapKO Product Blueprint V17.0

> Cập nhật: 18/12/2024 - Phản ánh đúng trạng thái hiện tại của project

---

## 1️⃣ PRODUCT OVERVIEW

### Mục tiêu sản phẩm

Ứng dụng quản lý kho F&B **local-first** với AI multimodal (Gemini 1.5 Flash), tập trung:

- Onboarding nhân viên siêu nhanh (10 giây: tên + SĐT)
- Auto-extract từ ảnh hóa đơn/menu với confidence score
- Tính toán COGS/lãi gộp realtime
- Tuân thủ Nghị định 13 (data minimization)

### Tech Stack Hiện Tại

| Layer    | Technology                             |
| -------- | -------------------------------------- |
| Mobile   | React Native + Expo + TypeScript       |
| Desktop  | Electron + React + better-sqlite3      |
| Web      | Next.js 14 + Tailwind CSS              |
| Backend  | Supabase Edge Functions (Deno)         |
| Database | PostgreSQL (Supabase) + SQLite (Local) |
| AI       | Gemini 1.5 Flash API                   |

---

## 2️⃣ FOLDER STRUCTURE

```
SnapKO/
├── .npmrc                      # pnpm hoisted config
├── pnpm-workspace.yaml         # Monorepo packages
├── turbo.json                  # Turborepo config
├── docker-compose.yml          # Local dev services
│
├── apps/
│   ├── mobile/                 # React Native + Expo
│   │   ├── App.tsx             # Main entry
│   │   ├── app.json            # Expo config + permissions
│   │   ├── syncEngine.ts       # Offline sync engine
│   │   └── src/
│   │       ├── screens/        # 10 screens
│   │       ├── components/     # ErrorBoundary, LoadingSpinner, EmptyState
│   │       ├── hooks/          # useSubscription, usePushNotifications
│   │       └── features/cogs/  # COGS calculator
│   │
│   ├── web-landing/            # Next.js
│   │   └── app/
│   │       ├── page.tsx        # Landing
│   │       ├── pricing/        # Gói dịch vụ + QR
│   │       ├── privacy/        # Chính sách quyền riêng tư
│   │       ├── terms/          # Điều khoản sử dụng
│   │       ├── reports/        # COGS Dashboard (Owner)
│   │       └── api/webhook/    # SePay payment webhook
│   │
│   └── desktop/                # Electron
│       └── src/
│           ├── main/           # database.ts, printer.ts
│           ├── preload/        # IPC bridge
│           └── renderer/       # React UI + pages/Recipes.tsx
│
├── packages/
│   ├── logic/                  # Shared business logic
│   │   ├── cogs.ts             # COGS calculations
│   │   ├── confidence.ts       # AI confidence scoring
│   │   ├── conversions.ts      # Unit conversion (kg↔g, l↔ml)
│   │   └── permissions.ts      # Role-based access
│   │
│   └── ts-types/               # Shared TypeScript types
│       ├── ai.ts               # AI parsing types
│       └── index.ts            # Exports
│
└── supabase/
    ├── config.toml             # Local Supabase config
    ├── functions/              # 10 Edge Functions
    │   ├── _shared/cors.ts     # CORS headers
    │   ├── invite-create/      # Tạo mã mời (6 char, 48h expire)
    │   ├── invite-join/        # Staff đăng ký (rate limit 5/hr)
    │   ├── invite-approve/     # Owner duyệt
    │   ├── ai-parse-inventory/ # Gemini parse hóa đơn
    │   ├── ai-parse-menu/      # Gemini parse menu
    │   ├── sync-up/            # Cloud sync
    │   ├── payment-webhook/    # SePay/Casso callback
    │   ├── user-delete/        # Soft delete (30 ngày)
    │   └── data-purge/         # Self-service data deletion
    │
    └── migrations/             # 8 SQL files
        ├── 20251217120000_week1_init.sql
        ├── 20251217123000_week2_inventory_ai.sql
        ├── 20251218000000_week3_sync_payment.sql
        ├── 20251218010000_week1_invite_security.sql
        ├── 20251218020000_week3_recipes.sql
        ├── 20251218030000_week4_data_purge.sql
        ├── 20251218040000_week4_monitoring_support.sql
        └── 20251218050000_push_notifications.sql
```

---

## 3️⃣ DATABASE SCHEMA

### Core Tables

| Table                | Purpose                                |
| -------------------- | -------------------------------------- |
| `businesses`         | Quán/doanh nghiệp + invite_code + tier |
| `profiles`           | User (OWNER/STAFF) + expo_push_token   |
| `ingredients`        | Nguyên liệu + soft delete (archived)   |
| `recipes`            | Món ăn                                 |
| `recipe_ingredients` | Mapping món ↔ nguyên liệu              |
| `inventory_logs`     | Lịch sử nhập/xuất + AI confidence      |

### Supporting Tables

| Table                  | Purpose                 |
| ---------------------- | ----------------------- |
| `payment_transactions` | Giao dịch thanh toán    |
| `dpia_logs`            | Compliance logging      |
| `ai_monitoring_logs`   | AI performance tracking |
| `support_tickets`      | Customer support        |
| `invite_rate_limits`   | Rate limiting by IP     |

---

## 4️⃣ EDGE FUNCTIONS (10)

| Function             | Auth            | Purpose                       |
| -------------------- | --------------- | ----------------------------- |
| `invite-create`      | Owner           | Tạo mã 6 ký tự, expire 48h    |
| `invite-join`        | No (rate limit) | Staff đăng ký + push to Owner |
| `invite-approve`     | Owner           | Duyệt/từ chối                 |
| `ai-parse-inventory` | Yes             | Gemini parse hóa đơn          |
| `ai-parse-menu`      | Yes             | Gemini parse menu             |
| `sync-up`            | Yes             | Bi-directional sync           |
| `payment-webhook`    | Token           | SePay/Casso callback          |
| `user-delete`        | Yes             | Soft delete + 30 ngày purge   |
| `data-purge`         | Yes             | Self-service data deletion    |

---

## 5️⃣ MOBILE SCREENS (10)

| Screen                   | Purpose                   |
| ------------------------ | ------------------------- |
| `InviteJoinScreen`       | Nhập code + tên + SĐT     |
| `PendingScreen`          | Chờ duyệt                 |
| `OwnerPendingListScreen` | Owner duyệt nhân viên     |
| `InventoryCaptureScreen` | Chụp + AI parse + confirm |
| `IngredientsListScreen`  | Danh sách + soft delete   |
| `RecipeListScreen`       | Menu + COGS + Quick Sell  |
| `RecipeEditScreen`       | Thêm/sửa công thức        |
| `DashboardScreen`        | Tổng quan + quick actions |
| `SettingsScreen`         | Upgrade + Delete Account  |

---

## 6️⃣ KEY FEATURES IMPLEMENTED

### ✅ Week 1: Foundation

- Supabase Auth (OTP)
- RLS policies
- Invite flow (6 char, rate limit, 48h expire)

### ✅ Week 2: AI & Inventory

- Camera + image compression
- Gemini 1.5 Flash parsing
- Confidence score highlighting
- Offline-first SQLite sync

### ✅ Week 3: Business Logic

- Recipe builder + COGS
- Unit conversion (kg↔g, l↔ml)
- Quick Sell inventory deduction
- Payment webhook

### ✅ Week 4: Compliance

- Privacy Policy + Terms pages
- Delete Account (App Store compliant)
- Data purge functions
- Push notifications
- Error boundary

---

## 7️⃣ RUN COMMANDS

```bash
# Install dependencies
pnpm install

# Mobile development
pnpm --filter mobile start

# Web development
pnpm --filter web-landing dev

# Desktop development
pnpm --filter desktop dev

# Apply database migrations
npx supabase db push

# Deploy Edge Functions
npx supabase functions deploy
```
