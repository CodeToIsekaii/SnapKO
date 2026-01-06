# 🕵️‍♂️ Báo Cáo & Bài Học: Xử Lý Lỗi Đồng Bộ Dữ Liệu (Sync) SnapKO

**Tài liệu dành cho:** Dev Team & Các thế hệ Developer tương lai của SnapKO.
**Mục tiêu:** Giải thích nguyên nhân, cách tìm lỗi và giải pháp cho các vấn đề đồng bộ dữ liệu giữa Mobile (Offline-first) và Desktop/Server, viết đơn giản dễ hiểu.

---

## 1. Môi Trường & Bối Cảnh (Context)

Hệ thống SnapKO hoạt động theo mô hình **Local-First** (Ưu tiên chạy offline):

- **Mobile (Admin/Staff):** Dùng `expo-sqlite` (database trên điện thoại).
- **Desktop (POS):** Dùng `better-sqlite3` (database trên máy tính).
- **Server (Supabase):** Dùng `PostgreSQL` (đám mây trung gian).

🔄 **Cơ chế Sync:** App Mobile và Desktop tự lưu dữ liệu vào máy mình trước, sau đó định kỳ "nói chuyện" với Server để cập nhật cái mới.

---

## 2. Các Con Bọ (Bugs) Đã Gặp & Cách "Tiêu Diệt"

Dưới đây là 5 "trùm cuối" chúng ta đã đánh bại trong đợt debug này:

### 🐛 Bug 1: "Mất trí nhớ tạm thời" (Data Loss on Sync)

**Hiện tượng:** Bạn chỉnh `min_threshold` (định mức tối thiểu) trên Desktop. Sau khi Sync, nó bị reset về 0 hoặc mất luôn giá trị vừa chỉnh.

**🔍 Nguyên nhân (Dễ hiểu):**
Tưởng tượng bạn đang viết dở bài văn vào vở (Local DB). Thầy giáo (Server) đưa cho bạn bài mẫu. Bạn **xé trang vở của mình đi** và chép lại y chang bài mẫu của thầy. Thế là những ghi chú riêng của bạn bên lề trang vở bị mất sạch!

- **Code lỗi:** Dùng lệnh `INSERT OR REPLACE`. Lệnh này thô bạo: Xóa dòng cũ, tạo dòng mới → Mất các trường chỉ có ở Local.

**✅ Giải pháp:**
Dùng chiến thuật **"Điền vào chỗ trống"** (`ON CONFLICT DO UPDATE`).

- Nếu chưa có dòng đó -> Tạo mới.
- Nếu có rồi -> Chỉ cập nhật những ô cần thiết, giữ nguyên các ô khác (như `min_threshold`).

---

### 🐛 Bug 2: "Bóng ma quá khứ" (Deleted Items Resurfacing)

**Hiện tượng:** Bạn xóa món "Cà phê đen". Sync xong, nó lại hiện lù lù ra đó. Xóa tiếp, sync tiếp, nó lại hiện ra.

**🔍 Nguyên nhân:**

1.  **Thứ tự sai:** Bạn "Pull" (lấy về) trước khi "Push" (đẩy đi).
    - Server vẫn còn "Cà phê đen".
    - Bạn chưa kịp báo Server là "Em xóa rồi nhé", thì bạn đã tải lại danh sách từ Server về → Món đó sống lại.
2.  **Xóa thật (Hard Delete):** Bạn xóa hẳn dòng đó khỏi Local DB. Khi Server trả về dòng đó, App tưởng là món mới chưa có → Lại thêm vào.

**✅ Giải pháp:**

1.  **Đổi luật chơi (Sync Order):** Luôn phải **PUSH** (báo cáo thay đổi) lên Server trước, rồi mới **PULL** (nhận cái mới) về.
2.  **Xóa "giả" (Soft Delete):** Không xóa hẳn. Đánh dấu `is_active = false` (hoặc `archived = 1`). Món đó vẫn nằm đó nhưng tàng hình. Khi Sync, Server biết là "à, món này bị ẩn rồi" và cập nhật trạng thái ẩn cho mọi người.

---

### 🐛 Bug 3: "Đếm sai số lượng" (Dashboard Count Mismatch)

**Hiện tượng:** Dashboard Mobile báo "62 Nguyên liệu", nhưng thực tế đếm tay có 63, hoặc Desktop báo khác Mobile.

**🔍 Nguyên nhân:**
Vấn đề nằm ở **"Tấm thẻ bảo vệ" (RLS Policy - Row Level Security)** trên Server.

- Nhân viên (Staff) có thẻ vào kho, nhưng cái thẻ đó được lập trình là: "Chỉ được nhìn thấy món Đang Dùng".
- Khi App Mobile đếm tổng, nó đếm cả món "Đã Ẩn" để tính toán, nhưng Server chặn không cho Staff thấy món ẩn → Kết quả đếm bị lệch.

**✅ Giải pháp:**
Cấp lại quyền cho thẻ Staff: "Cho phép xem cả món đã ẩn (`archived`) để đồng bộ, nhưng App sẽ tự lọc không hiển thị lên màn hình bán hàng".

---

### 🐛 Bug 4: "Hai nhà quản lý" (Duplicate Database Instances)

**Hiện tượng:** Sửa code thêm cột `archived` rồi, nhưng chạy lên vẫn lỗi `no such column: archived`.

**🔍 Nguyên nhân:**
Đây là lỗi kinh điển của Developer!

- File `db/index.ts` tạo ra một database tên `snapko.db`.
- File `inventory.service.ts` lại lén tạo một database riêng tên `snapko_mobile.db`.
- Ta thêm cột vào cái `snapko.db`, nhưng App lại đọc từ `snapko_mobile.db` → Tất nhiên là không thấy cột đó rồi!

**✅ Giải pháp:**
Bắt buộc tất cả mọi người phải dùng chung **"Một nguồn sự thật" (Single Source of Truth)**. Xóa code tạo DB bên `inventory.service.ts` đi và dùng chung `getDB()` từ `db/index.ts`.

---

### 🐛 Bug 5: "Thẻ căn cước không hợp lệ" (Invalid UUID & Constraints)

**Hiện tượng:** Desktop không Sync được, báo lỗi `invalid input syntax for type uuid` và `duplicate key value`.

**🔍 Nguyên nhân:**

1.  **Format ID:** Desktop đang dùng kiểu ID tự chế `ri_123_456...`. Server Supabase chỉ chấp nhận thẻ căn cước chuẩn quốc tế (UUID).
2.  **Luật cấm trùng tên:** Server cấm 2 món trùng tên. Nhưng ta đã "ẩn" món cũ "Ống hút" đi rồi, giờ tạo món mới "Ống hút" vẫn bị cấm.

**✅ Giải pháp:**

1.  Đổi ID sang `crypto.randomUUID()` cho chuẩn.
2.  Sửa luật cấm: "Chỉ cấm trùng tên với những món **Đang Dùng**. Còn món đã ẩn vào kho rồi thì được phép trùng tên".

---

### 🐛 Bug 6: "Kéo mãi không thả" (Pull-to-Refresh Stuck)

**Hiện tượng:** Bạn kéo xuống để làm mới (Pull-to-Refresh), vòng tròn xoay mãi không dừng. Hoặc kéo được 1 lần, lần sau không kéo được nữa.

**🔍 Nguyên nhân:**
Sau khi Sync xong, code hiện ra 1 cái **hộp thông báo** "Sync thành công!". Hộp thông báo này **chặn luồng code**, không cho chạy đến dòng `setRefreshing(false)` → Vòng tròn xoay mãi cho đến khi người dùng bấm OK.

**✅ Giải pháp:**
Xóa `Alert.alert("Thành công")` đi. Chỉ giữ Alert khi có lỗi. Người dùng sẽ tự biết là thành công khi danh sách được cập nhật.

---

### 🐛 Bug 7: "Số món không chịu thay đổi" (Recipe Count Not Updating)

**Hiện tượng:** Sync xong, số lượng Nguyên liệu cập nhật đúng, nhưng số lượng Món (Recipe) vẫn hiện số cũ.

**🔍 Nguyên nhân:**
Trong hàm `onRefresh`, lập trình viên quên gọi `setRecipeCount(...)` sau khi sync. Chỉ có `setIngredientCount(...)` được gọi.

**✅ Giải pháp:**
Thêm dòng `setRecipeCount(await InventoryService.getRecipeCount())` sau khi sync xong.

---

### 🐛 Bug 8: "Hàm biến mất bí ẩn" (getRecipeCount is not a function)

**Hiện tượng:** App crash với lỗi `getRecipeCount is not a function (it is undefined)`.

**🔍 Nguyên nhân:**
Trong quá trình refactor code trước đó, hàm `getRecipeCount` trong `InventoryService` bị xóa mất hoặc chưa bao giờ được viết.

**✅ Giải pháp:**
Thêm lại hàm vào `inventory.service.ts`:

```typescript
getRecipeCount: async (): Promise<number> => {
  const db = await getDB();
  const result = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM local_recipes WHERE is_active = 1"
  );
  return result?.count || 0;
};
```

---

### 🐛 Bug 9: "Thẻ căn cước cũ kỹ" (Legacy Recipe ID)

**Hiện tượng:** Có 1 món tên "Cà phê sữa" với ID `recipe_1767672165955` không thể Sync được.

**🔍 Nguyên nhân:**
Đây là ID được tạo theo kiểu cũ `recipe_${timestamp}`. Supabase yêu cầu ID phải là **UUID chuẩn** (ví dụ: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).

**✅ Giải pháp:**

1. Xóa món đó đi trên Desktop.
2. Tạo lại món mới. Lần này code sẽ dùng `crypto.randomUUID()`.

---

### 🐛 Bug 10: "Lọc nhầm hàng" (Mobile Recipe Sync Filter)

**Hiện tượng:** Món đã xóa (is_active = 0) không được sync về Mobile. Mobile vẫn hiện món đó như bình thường.

**🔍 Nguyên nhân:**
Trong file `pullSync.ts`, khi lấy danh sách Recipes từ Server, có dòng lọc `.eq("is_active", true)`. Dòng này chặn không cho món đã xóa được tải về.

**✅ Giải pháp:**
Bỏ filter `.eq("is_active", true)`. Tải **tất cả** recipes về, kể cả món đã xóa. Sau đó App sẽ tự lọc ở UI (chỉ hiện món `is_active = 1`).

---

### 🐛 Bug 11 (Bonus): "Aliases không được phép rỗng" (NULL Constraint Error)

**Hiện tượng:** Sync thất bại với lỗi `NOT NULL constraint failed: aliases`.

**🔍 Nguyên nhân:**
Một số nguyên liệu cũ không có `aliases` (biệt danh). Khi sync, Server gửi `aliases: null`, nhưng Local DB yêu cầu cột này không được NULL.

**✅ Giải pháp:**

1. Sửa lại cột trong DB: `aliases TEXT DEFAULT ''` (cho phép rỗng, mặc định là chuỗi rỗng).
2. Hoặc khi insert, kiểm tra: `aliases ?? ''` (nếu null thì dùng chuỗi rỗng).

---

### 🐛 Bug 12: "Số 0 bị coi là không có" (Falsy Value Bug)

**Hiện tượng:** Bạn đặt "Mức hao hụt cho phép" = 0%. Lưu lại. Mở ra lại thấy nó nhảy về 5%.

**🔍 Nguyên nhân:**
Trong JavaScript, số `0` được coi là "falsy" (như `false`, `null`, `undefined`).

```javascript
// Code lỗi:
allowable_variance: (ing.allowable_variance || 0.05) * 100;
// Khi allowable_variance = 0 → 0 || 0.05 = 0.05 (sai!)
```

**✅ Giải pháp:**
Dùng **Nullish Coalescing Operator** (`??`) thay vì Logical OR (`||`):

```javascript
// Code đúng:
allowable_variance: (ing.allowable_variance ?? 0.05) * 100;
// Khi allowable_variance = 0 → 0 ?? 0.05 = 0 (đúng!)
```

**📌 Rule:** Với các trường số có thể = 0 hợp lệ, **LUÔN** dùng `??` thay vì `||`.

---

### 🐛 Bug 13: "Hai nền tảng lệch pha" (Schema Drift)

**Hiện tượng:** Desktop có các trường cấu hình (`type`, `item_type`, `tracking_mode`, `allowable_variance`), nhưng Mobile không hiển thị đúng sau khi Sync.

**🔍 Nguyên nhân:**

- Desktop schema được nâng cấp thêm cột mới.
- Mobile quên nâng theo → Dữ liệu sync về bị bỏ lơ hoặc crash.

**✅ Giải pháp:**

1. Thêm các cột bị thiếu vào schema Mobile (`db/index.ts`).
2. Bump `SCHEMA_VERSION` để buộc DB reset khi mở app.
3. Cập nhật query trong `pullSync.ts` để sync đầy đủ các trường mới.

**📌 Rule:** Khi thêm cột mới cho Desktop, **PHẢI** check và thêm tương ứng cho Mobile.

---

### 🐛 Bug 14: "Chờ mãi không thấy data" (Startup Delay / Server-First Bug)

**Hiện tượng:** Mở app Mobile, Dashboard hiển thị "0 Nguyên liệu" một lúc lâu, sau đó mới hiện đúng số.

**🔍 Nguyên nhân:**
Logic khởi tạo app **chờ server sync xong** mới hiển thị data:

```typescript
// Code lỗi: Sync server trước
try {
  await syncModel(); // Chờ server (chậm!)
} catch {
  await loadModel(); // Chỉ load local khi lỗi
}
```

**✅ Giải pháp:**
Áp dụng **Offline-First** đúng nghĩa: Load local **NGAY LẬP TỨC**, sau đó mới sync server ngầm:

```typescript
// Code đúng: Offline-First
await loadModel(); // Hiện UI ngay!
try {
  await syncModel(); // Sync ngầm
} catch (err) {
  console.log("Offline, using local data");
}
```

**📌 Rule:** Local data phải hiện **tức thì (< 500ms)**. Server sync chạy ngầm, không block UI.

**💡 Lưu ý:** Trong **Development mode** (Metro Bundler + Tunnel), app vẫn sẽ chậm do phải bundle JS. Chỉ có **Production/Preview build** mới nhanh thực sự.

---

## 3. Bài Học Rút Ra (Checklist cho dự án sau)

Để không bao giờ gặp lại ác mộng này, hãy nhớ:

1.  **Luôn dùng Soft Delete:** Đừng bao giờ `DELETE FROM...` trừ khi bạn biết rất rõ mình đang làm gì. Hãy dùng cờ `is_active` hoặc `deleted_at`.
2.  **Database Singleton:** Trong 1 App, chỉ nên có **đúng 1 chỗ** khởi tạo kết nối Database. Đừng để mỗi màn hình tự new connection.
3.  **Sync Order:** Push **Local Changes** lên trước -> Sau đó mới Pull **Server Data** về.
4.  **Schema Versioning:** Khi sửa cấu trúc bảng (thêm cột), hãy nhớ tăng `SCHEMA_VERSION` hoặc viết code "Dynamic Migration" (Tự kiểm tra xem có cột chưa, chưa thì thêm) để App không bị crash trên máy người dùng cũ.
5.  **Log mọi thứ:** Khi debug Sync, hãy `console.log` ra xem mình đang gửi cái gì đi và nhận cái gì về. Đừng đoán mò.
6.  **UUID là bắt buộc:** Khi làm việc với Supabase/PostgreSQL, **LUÔN** dùng `crypto.randomUUID()` cho ID. Đừng tự chế format ID.
7.  **Đừng block UI:** Alert.alert() sẽ chặn code chạy tiếp. Cẩn thận khi dùng trong async flow.
8.  **Kiểm tra NULL:** Khi thiết kế DB, nghĩ trước xem cột nào có thể NULL không. Nếu không, hãy thêm `DEFAULT ''` hoặc `DEFAULT 0`.
9.  **Dùng `??` cho số:** Với các trường số 0 là giá trị hợp lệ, dùng `??` thay vì `||`.
10. **Schema đồng bộ:** Desktop và Mobile phải có cùng cấu trúc DB. Khi thêm cột, thêm cả hai nơi.
11. **Offline-First thật sự:** Load local TRƯỚC, sync server SAU. User không bao giờ phải chờ network.

---

_Created by me - 2026/01/06_
