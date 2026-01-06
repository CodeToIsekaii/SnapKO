# 🐛 Báo Cáo & Bài Học: Lỗi "Sập Nguồn" Database (SQLite Crash)

> **Dành cho:** Team Dev & Các bạn học sinh yêu thích lập trình
> **Cấp độ:** Dễ hiểu (Cấp 2 cũng hiểu được!)

---

## 1. Chuyện gì đã xảy ra? (The Story) 📖

Hãy tưởng tượng **Database (Cơ sở dữ liệu)** của App giống như một **Cuốn Sổ Ghi Chép** duy nhất của quán.
Mọi dữ liệu (tên món, số lượng, doanh thu...) đều được ghi vào đây.

### Vấn đề:

Khi bạn mở App bằng tài khoản **Chủ Quán (Owner)**, App bỗng nhiên bị "đơ" hoặc thoát ra ngoài ngay lập tức (Crash).
Nhưng lạ thay, nếu đăng nhập bằng tài khoản **Nhân Viên (Staff)**, App lại chạy bon bon! 🤨

**Lỗi hiện trên màn hình đen ngòm:**

> `java.lang.NullPointerException` (Lỗi ám ảnh nhất của lập trình viên Android)
> Hiểu nôm na là: "Tôi đang cố cầm cái bút để viết, nhưng cái bút văng đi đâu mất rồi!"

---

## 2. Nguyên nhân tận gốc (The Root Cause) 🔍

Tại sao lại bị như vậy? Hãy dùng một ví dụ đời thường nhé.

### Ví dụ: Cánh Cửa Thần Kỳ

Tưởng tượng Database là một căn phòng chứa sổ sách, chỉ có **1 cánh cửa duy nhất**.

1.  **Chủ Quán (Owner) có 2 nhiệm vụ cùng lúc:**

    - **Nhiệm vụ A (Tay trái):** Tải cấu hình quán mới nhất về (Sync Config) -> Cần mở cửa để **GHI** vào sổ.
    - **Nhiệm vụ B (Tay phải):** Cần xem danh sách món sắp hết (Dashboard) -> Cần mở cửa để **ĐỌC** sổ.

2.  **Lỗi xảy ra ở đâu?**

    - Trong Code cũ (`App.tsx`), Tay trái tự tạo ra một chiếc chìa khóa riêng để mở cửa.
    - Trong Code cũ (`src/db/index.ts`), Tay phải cũng tự tạo ra một chiếc chìa khóa riêng khác để mở cửa.
    - 💥 **Bùm!** Hai tay cùng cố đút 2 chìa khóa vào 1 ổ khóa cùng một lúc. Cánh cửa bị kẹt, ổ khóa bị hỏng (NullPointerException), và App "sập nguồn" để bảo vệ dữ liệu.

3.  **Tại sao Nhân Viên không bị?**
    - Nhân viên chỉ có nhiệm vụ B (Đọc sổ). Họ chỉ dùng 1 tay, 1 chìa khóa -> Không tranh chấp -> Không sao cả.

---

## 3. Bài học rút ra (Key Takeaways) 💡

### Lỗi này tên khoa học là gì?

Nó gọi là **Race Condition (Cuộc đua kỳ thú)** trên tài nguyên chia sẻ.
Khi 2 luồng xử lý (Threads) cùng tranh giành một tài nguyên (File Database) mà không xếp hàng -> Tai nạn xảy ra.

### Các lỗi tương tự phổ biến:

1.  **File Locked:** Mở file Word lên sửa, nhưng thằng bạn cũng đang mở file đó -> Không lưu được.
2.  **Memory Leak:** Mở kết nối xong quên đóng -> Tốn RAM, máy chậm dần.
3.  **Deadlock (Kẹt xe):** Ông A chờ Ông B xong mới làm, Ông B lại chờ Ông A xong mới làm -> Cả 2 chờ nhau đến già.

---

## 4. Cách khắc phục (The Fix) 🛠️

Để sửa lỗi này, chúng ta dùng một quy tắc vàng trong lập trình: **Singleton Pattern (Độc Nhất Vô Nhị)**.

### Giải pháp: "Chỉ một chìa khóa duy nhất" 🔑

Thay vì để mỗi nơi trong App tự tạo chìa khóa riêng (tự `openDatabase`), chúng ta tạo ra một ""Ông Quản Gia"" (`src/db/index.ts`).

- Bất kỳ ai (Tay trái, Tay phải, Chủ, Lính) muốn vào phòng Database, đều phải hỏi xin "Ông Quản Gia".
- Ông Quản Gia sẽ chỉ đưa **đúng 1 chiếc chìa khóa duy nhất** cho tất cả mọi người dùng chung.
- Nếu chìa khóa đang bận, ông bắt người sau xếp hàng chờ 1 chút (Mutex Lock).

**Code minh họa (Dễ hiểu):**

**❌ Cách cũ (Sai):**

```typescript
// App.tsx: Tự mở
const db1 = openDatabase("so_sach.db");

// Dashboard.tsx: Tự mở tiếp
const db2 = openDatabase("so_sach.db");

// => 2 db đánh nhau => Crash!
```

**✅ Cách mới (Đúng - Singleton):**

```typescript
// src/db/index.ts (Ông Quản Gia)
let db_duy_nhat; // Biến lưu chìa khóa

export function getDB() {
  if (!db_duy_nhat) {
    db_duy_nhat = openDatabase("so_sach.db"); // Chỉ mở lần đầu tiên
  }
  return db_duy_nhat; // Trả về cái đã mở
}

// Mọi nơi khác đều gọi:
const db = getDB(); // Luôn lấy được đúng 1 cái
```

### 🚑 Cơ chế Tự Hồi Phục (Auto-Recovery)

Để App xịn hơn nữa, mình cài thêm cho "Ông Quản Gia" một kỹ năng đặc biệt:
Nếu ông phát hiện cuốn sổ bị rách nát (File DB bị hỏng do lần trước 2 ông kia đánh nhau), ông sẽ **TỰ ĐỘNG** vứt cuốn sổ cũ đi và mua cuốn sổ mới tinh (`deleteDatabaseAsync`) để App chạy lại bình thường ngay lập tức!

---

## 5. Tổng kết

> **"Một nước không thể có 2 vua, một App không thể có 2 kết nối Database chạy loạn xạ."**

Nhớ kỹ nguyên tắc **Singleton** khi làm việc với Database hoặc File hệ thống nhé! Chúc bạn code vui và không bao giờ gặp lại lỗi NullPointer này nữa! 🚀
