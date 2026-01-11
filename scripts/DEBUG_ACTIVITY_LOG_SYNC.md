# 🔧 Hướng Dẫn Debug: Activity Log Không Hiện Dữ Liệu

## 📋 Mô Tả Vấn Đề

**Triệu chứng:**

- Desktop và Mobile đều hiện "Chưa có hoạt động nào gần đây"
- Mặc dù người dùng đã thực hiện nhiều thao tác (Xuất Khác, Cấp Hàng Khẩn, v.v.)

**Môi trường:**

- Desktop: Electron + SQLite + Supabase
- Mobile: React Native + Expo SQLite + Supabase

---

## 🔍 Quá Trình Debug (Theo Thứ Tự)

### Bước 1: Xác Định Nguồn Dữ Liệu

**Câu hỏi:** Activity Log đọc dữ liệu từ đâu?

**Khám phá:**

```
Desktop đọc từ → Supabase bảng `inventory_logs` (cloud)
                 ↓ nếu trống
                 → SQLite bảng `pending_sync_logs` (local)

Mobile đọc từ  → SQLite bảng `pending_sync_logs` (local)
```

**Vấn đề tìm thấy:**

- Bảng `inventory_logs` trên Supabase **trống hoàn toàn**
- Desktop local `pending_sync_logs` cũng **trống** (vì chỉ chứa logs của Desktop, không phải Mobile)

---

### Bước 2: Tại Sao Cloud Trống?

**Câu hỏi:** Mobile có sync logs lên cloud không?

**Khám phá:** Thêm debug log vào `syncEngine.ts`:

```typescript
console.log("[SyncEngine] Pending logs count:", rows.length);
console.log("[SyncEngine] sync-up response status:", response.status);
console.log("[SyncEngine] sync-up result:", result);
```

**Kết quả:**

```
Pending logs count: 6
sync-up response status: 200
Sync complete: 0 synced, 6 failed  ← TẤT CẢ ĐỀU FAIL!
```

---

### Bước 3: Lỗi Đầu Tiên - Sai Authorization Token

**Lỗi:** Sync-up API không thể xác định user

**Nguyên nhân:** Code cũ dùng `SUPABASE_ANON_KEY` làm Authorization header

```typescript
// ❌ SAI - Dùng API key thay vì user token
Authorization: `Bearer ${Env.SUPABASE_ANON_KEY}`;
```

**Hậu quả:**

```
            ┌─────────────────────────────────────────┐
            │  Edge Function "sync-up"                │
            │                                         │
User Token ─┤  getUser(token) → Xác định ai đang     │
    ???     │  gửi request → Lấy business_id        │
            │                                         │
            │  ❌ ANON_KEY không phải user token!     │
            │     → Không tìm được profile            │
            │     → Không có business_id              │
            │     → KHÔNG THỂ GHI VÀO DATABASE       │
            └─────────────────────────────────────────┘
```

**Giải pháp:**

```typescript
// ✅ ĐÚNG - Lấy access token của user đang đăng nhập
const { data: sessionData } = await supabase.auth.getSession();
const accessToken = sessionData?.session?.access_token;

Authorization: `Bearer ${accessToken}`;
```

---

### Bước 4: Lỗi Thứ Hai - Sai Giá Trị Enum `location`

**Lỗi mới sau khi fix auth:**

```
"error": "invalid input value for enum inventory_location_enum: \"mobile\""
```

**Nguyên nhân:** Database chỉ chấp nhận 2 giá trị cho `location`:

| Giá trị hợp lệ | Ý nghĩa  |
| -------------- | -------- |
| `WAREHOUSE`    | Kho hàng |
| `BAR`          | Quầy bar |

Nhưng code Mobile ghi:

```typescript
// ❌ SAI
location: "mobile"; // Database không chấp nhận giá trị này!
```

**Hình dung như thế này:**

```
Bạn điền form đăng ký:

Giới tính: □ Nam  □ Nữ

Nhưng bạn ghi: "mobile" → ❌ Form báo lỗi!
```

**Giải pháp:**

```typescript
// ✅ ĐÚNG - Dùng giá trị hợp lệ
location: "BAR"; // Quick Out thường xảy ra ở quầy bar
```

**Bonus - Fix logs cũ bị sai:**

```typescript
// Tự động sửa logs cũ trước khi sync
await db.runAsync(
  `UPDATE pending_sync_logs 
   SET location = 'BAR' 
   WHERE location = 'mobile' AND synced = 0`
);
```

---

### Bước 5: Lỗi Thứ Ba - Sai Giá Trị Enum `type`

**Lỗi tiếp theo:**

```
"error": "invalid input value for enum inventory_type_enum: \"LOAN\""
```

**Nguyên nhân:** Database chỉ chấp nhận các giá trị sau cho `type`:

| Giá trị hợp lệ | Ý nghĩa         |
| -------------- | --------------- |
| `IMPORT`       | Nhập hàng       |
| `TRANSFER`     | Chuyển kho      |
| `AUDIT`        | Kiểm kho        |
| `WASTE`        | Hao hụt/Vỡ hỏng |
| `LENT`         | Cho mượn        |

Nhưng code Mobile ghi:

```typescript
// ❌ SAI
LOAN: "LOAN",           // Database dùng "LENT" không phải "LOAN"!
MARKETING: "MARKETING", // Không có giá trị này trong enum!
```

**Giải pháp:**

```typescript
// ✅ ĐÚNG - Map sang giá trị hợp lệ
const typeMapping = {
  DAMAGED: "WASTE", // Vỡ/Hỏng → WASTE
  LOAN: "LENT", // Cho mượn → LENT (không phải LOAN)
  MARKETING: "WASTE", // Marketing → WASTE (tính vào hao hụt)
};
```

---

### Bước 6: Chi Tiết Không Hiện (details = empty)

**Vấn đề cuối:** Activity Log hiện nhưng cột "Chi tiết" trống

**Nguyên nhân:** Desktop đọc `staff_note` để lấy chi tiết:

```typescript
details: log.staff_note || "Không có chi tiết";
```

Nhưng Mobile lưu chi tiết trong `ai_parsed_json`:

```json
{
  "items": [...],
  "notes": "Xuất Khác - Vỡ/Hỏng",
  "reason": "DAMAGED"
}
```

**Giải pháp:**

```typescript
// 1. Thêm ai_parsed_json vào SELECT query
.select(`id, type, staff_note, ai_parsed_json, ...`)

// 2. Parse ai_parsed_json nếu staff_note trống
let details = log.staff_note || "";
if (!details && log.ai_parsed_json) {
  const parsed = JSON.parse(log.ai_parsed_json);
  details = parsed.notes || parsed.items?.map(i => i.name).join(", ");
}
```

---

## 📊 Tổng Kết Các Lỗi

| #   | Lỗi                     | Nguyên nhân                                      | Giải pháp                                     |
| --- | ----------------------- | ------------------------------------------------ | --------------------------------------------- |
| 1   | Sync thất bại hoàn toàn | Dùng ANON_KEY thay vì user token                 | Lấy `accessToken` từ `getSession()`           |
| 2   | `location` invalid      | Ghi "mobile" thay vì "WAREHOUSE"/"BAR"           | Đổi thành "BAR"                               |
| 3   | `type` invalid          | Ghi "LOAN"/"MARKETING" không có trong enum       | Map đúng: LOAN→LENT, MARKETING→WASTE          |
| 4   | Chi tiết trống          | Đọc sai field (`staff_note` vs `ai_parsed_json`) | Parse `ai_parsed_json` nếu `staff_note` trống |

---

## 🎓 Bài Học Rút Ra

### 1. **Luôn kiểm tra schema database trước khi code**

Xem bảng `inventory_logs`:

- Cột `location` có kiểu `inventory_location_enum` → check giá trị hợp lệ
- Cột `type` có kiểu `inventory_type_enum` → check giá trị hợp lệ

### 2. **Thêm debug log ở các điểm quan trọng**

```typescript
console.log("[SyncEngine] Pending logs count:", rows.length);
console.log("[SyncEngine] sync-up response:", result);
```

### 3. **Kiểm tra authentication flow cẩn thận**

- API key ≠ User token
- Edge functions cần user token để xác định business_id

### 4. **Consistency giữa Frontend và Backend**

- Mobile dùng "LOAN" → Database dùng "LENT"
- Phải thống nhất terminology!

---

## 🔗 Files Đã Sửa

| File                                         | Thay đổi                                         |
| -------------------------------------------- | ------------------------------------------------ |
| `apps/mobile/src/sync/syncEngine.ts`         | Fix auth token, thêm migration fix location/type |
| `apps/mobile/src/screens/QuickOutScreen.tsx` | Fix location và type mapping                     |
| `apps/desktop/src/main/database.ts`          | Thêm ai_parsed_json vào query, parse details     |

---

_Tài liệu này được tạo: 2026-01-11_
