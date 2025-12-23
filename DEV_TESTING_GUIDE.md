# SnapKO - Development Testing Guide

Hướng dẫn từng bước test toàn bộ hệ thống trước khi deploy production.

## 📋 Checklist Tổng Quan

- [ ] **Phase 1:** Setup & Verify Environment
- [ ] **Phase 2:** Test Desktop App
- [ ] **Phase 3:** Test Mobile App
- [ ] **Phase 4:** Test Web Landing
- [ ] **Phase 5:** Test Full Integration Flow
- [ ] **Phase 6:** Verify Security & Compliance

---

## Phase 1: Setup & Verify Environment

### 1.1 Kiểm tra Prerequisites

```bash
# Verify versions
node --version   # Should be v18+
pnpm --version   # Should be v8+
```

### 1.2 Setup Supabase Cloud (QUAN TRỌNG)

1. **Login Supabase Dashboard:** https://supabase.com/dashboard
2. **Chọn project:** `kxeervlkzyitlbksbfvp`
3. **Copy Connection info:**
   - Project URL: `https://kxeervlkzyitlbksbfvp.supabase.co`
   - Anon Key: (copy từ Settings → API)

### 1.3 Apply Migrations

```bash
cd SnapKO

# Link project (nếu chưa link)
npx supabase link --project-ref kxeervlkzyitlbksbfvp

# Push all migrations to cloud
npx supabase db push
```

**Expected output:** `Applying migration 20251217120000...` (16 migrations)

### 1.4 Deploy Edge Functions

```bash
# Deploy tất cả functions
npx supabase functions deploy

# Hoặc deploy từng function:
npx supabase functions deploy ai-parse-inventory
npx supabase functions deploy sync-up
npx supabase functions deploy staff-generate-invite
```

> ⚠️ **Lưu ý:** Cần Docker Desktop chạy để deploy Edge Functions

### 1.5 Verify Environment Files

```bash
# Desktop .env
cat apps/desktop/.env
# Phải có: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

# Mobile .env
cat apps/mobile/.env
# Phải có: EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
```

---

## Phase 2: Test Desktop App

### 2.1 Start Desktop App

```bash
cd apps/desktop
pnpm dev
```

### 2.2 Test Case: Đăng ký Chủ quán

| Step | Action                                | Expected                                   |
| ---- | ------------------------------------- | ------------------------------------------ |
| 1    | Click tab "Đăng ký"                   | Form đăng ký xuất hiện                     |
| 2    | Nhập: Tên DN, Họ tên, Email, Password | Form validate                              |
| 3    | Click "Đăng ký"                       | Loading → Tự động login                    |
| 4    | Verify Dashboard                      | Hiện 3 tabs: Dashboard, Nhân viên, Tồn kho |

### 2.3 Test Case: Tạo mã mời (Online)

| Step | Action                | Expected                                      |
| ---- | --------------------- | --------------------------------------------- |
| 1    | Click tab "Nhân viên" | Danh sách nhân viên                           |
| 2    | Click "Tạo mã mời"    | Modal với mã 6 ký tự (VD: `ABC123`)           |
| 3    | Click "Copy mã"       | ✅ Đã sao chép                                |
| 4    | Verify Supabase       | Mã xuất hiện trong `staff_invite_codes` table |

### 2.4 Test Case: Offline Mode

| Step | Action             | Expected                          |
| ---- | ------------------ | --------------------------------- |
| 1    | Tắt WiFi           | -                                 |
| 2    | Click "Tạo mã mời" | ❌ "Vui lòng kết nối Internet..." |
| 3    | Bật lại WiFi       | -                                 |
| 4    | Click "Tạo mã mời" | ✅ Hoạt động bình thường          |

### 2.5 Test Case: Export Excel

| Step | Action               | Expected            |
| ---- | -------------------- | ------------------- |
| 1    | Click tab "Tồn kho"  | Bảng tồn kho        |
| 2    | Click "Xuất Excel"   | Dialog Save As      |
| 3    | Chọn vị trí, đặt tên | File .xlsx được tạo |
| 4    | Mở file Excel        | Dữ liệu đúng format |

### 2.6 Test Case: COGS Dashboard

| Step | Action                | Expected         |
| ---- | --------------------- | ---------------- |
| 1    | Click tab "Dashboard" | Charts hiển thị  |
| 2    | Check Bar Chart       | 6 ngày gần nhất  |
| 3    | Check Pie Chart       | Phân bổ tổn thất |
| 4    | Click "Xuất Excel"    | File COGS report |

---

## Phase 3: Test Mobile App

### 3.1 Start Expo

```bash
cd apps/mobile
pnpm start

# Scan QR với Expo Go app
```

### 3.2 Test Case: Staff Join với Invite Code

| Step | Action                             | Expected                 |
| ---- | ---------------------------------- | ------------------------ |
| 1    | Mở app (chưa login)                | Màn hình Login           |
| 2    | Click "Tham gia doanh nghiệp"      | Form nhập mã mời         |
| 3    | Nhập mã từ Desktop (VD: `ABC123`)  | -                        |
| 4    | Nhập: Họ tên, SĐT, Email, Password | -                        |
| 5    | Click "Tham gia"                   | Loading → Pending Screen |
| 6    | Verify: "Chờ chủ quán duyệt..."    | ✅                       |

### 3.3 Test Case: Owner Approve (Desktop → Mobile)

| Step | Platform | Action          | Expected                |
| ---- | -------- | --------------- | ----------------------- |
| 1    | Desktop  | Tab "Nhân viên" | Thấy staff PENDING      |
| 2    | Desktop  | Click "✓ Duyệt" | Staff → ACTIVE          |
| 3    | Mobile   | Refresh app     | Vào được màn hình chính |

### 3.4 Test Case: Inventory Capture

| Step | Action                | Expected             |
| ---- | --------------------- | -------------------- |
| 1    | Click "📸 Capture"    | Camera mở            |
| 2    | Chụp ảnh nguyên liệu  | Ảnh preview          |
| 3    | AI parse (nếu online) | Tự điền số lượng     |
| 4    | Xác nhận              | Lưu vào pending logs |
| 5    | Sync                  | Upload lên Supabase  |

### 3.5 Test Case: Recipe Cost (COGS)

| Step | Action                   | Expected               |
| ---- | ------------------------ | ---------------------- |
| 1    | Tab "Recipes"            | Danh sách công thức    |
| 2    | Click recipe             | Chi tiết + nguyên liệu |
| 3    | Check "Cost per Portion" | Tính đúng COGS         |

---

## Phase 4: Test Web Landing

### 4.1 Start Web

```bash
cd apps/web-landing
pnpm dev
# Open http://localhost:3000
```

### 4.2 Test Pages

| Page      | URL          | Check                           |
| --------- | ------------ | ------------------------------- |
| Home      | `/`          | Hero, Features, CTA             |
| Pricing   | `/pricing`   | 3 plans (Free, Pro, Enterprise) |
| Privacy   | `/privacy`   | Decree 13 compliance text       |
| Terms     | `/terms`     | Terms of Service                |
| Dashboard | `/dashboard` | Placeholder/redirect            |

### 4.3 Test Responsive

- [ ] Desktop (1920px)
- [ ] Tablet (768px)
- [ ] Mobile (375px)

---

## Phase 5: Full Integration Flow

### 5.1 Complete Flow Test

```
[Desktop] Owner Register
    ↓
[Desktop] Create Invite Code
    ↓
[Supabase] Code saved to DB
    ↓
[Mobile] Staff Join with Code
    ↓
[Desktop] Owner Approve Staff
    ↓
[Mobile] Staff captures inventory
    ↓
[Mobile] Sync to Supabase
    ↓
[Desktop] Data appears in Dashboard
    ↓
[Desktop] Export Excel report
```

### 5.2 Verify Data Sync

1. **Desktop tạo ingredient**
2. **Mobile refresh** → ingredient xuất hiện
3. **Mobile capture log**
4. **Desktop refresh** → log xuất hiện

---

## Phase 6: Security & Compliance

### 6.1 RLS Test (Supabase Dashboard)

```sql
-- Thử query với user khác business
SELECT * FROM ingredients WHERE business_id != 'your-business-id';
-- Expected: 0 rows (RLS blocks)
```

### 6.2 Invite Code Security

- [ ] Mã hết hạn sau 48h
- [ ] Mã invalid → lỗi rõ ràng
- [ ] Không thể brute-force (rate limit)

### 6.3 Data Compliance (Decree 13)

- [ ] Privacy policy hiển thị
- [ ] Không thu thập dữ liệu thừa (no avatars)
- [ ] Data purge function tồn tại

---

## ✅ Final Checklist

```
Development Testing Complete:
- [ ] Desktop: Login/Register works
- [ ] Desktop: Invite code generation works
- [ ] Desktop: Export Excel works
- [ ] Desktop: COGS Dashboard shows data
- [ ] Mobile: Join with code works
- [ ] Mobile: Inventory capture works
- [ ] Mobile: Sync to cloud works
- [ ] Web: All pages load correctly
- [ ] Integration: Desktop ↔ Mobile sync works
- [ ] Security: RLS policies working
```

---

## 🐛 Common Issues & Fixes

| Issue                     | Solution                                  |
| ------------------------- | ----------------------------------------- |
| "Supabase not configured" | Check .env files                          |
| "Docker not running"      | Start Docker Desktop                      |
| "Invalid hook call"       | Run `pnpm install --force`                |
| "better-sqlite3 error"    | Run `npx @electron/rebuild`               |
| "Edge function failed"    | Check function logs in Supabase Dashboard |
