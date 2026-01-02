# Fixing Realtime Sync Issues - Troubleshooting Guide

> **Dự án**: SnapKO Mobile App  
> **Ngày tạo**: 2026-01-02  
> **Môi trường**: React Native + Expo + Supabase Realtime

---

## 📋 Tổng Quan

Tài liệu này ghi lại các lỗi Realtime Sync đã gặp và cách sửa để tránh lặp lại trong tương lai.

---

## 🐛 Lỗi 1: Race Condition - Component Mount Trước Khi Có Data

### Triệu chứng

- Log hiển thị: `[Realtime] No businessId yet, skipping subscription`
- Sau đó `businessId` được set nhưng Realtime subscription KHÔNG được tạo
- Khi đổi model trên Desktop, Mobile không nhận được update

### Nguyên nhân

```
Thứ tự thực thi sai:
1. Dashboard component mount → businessId = null
2. useEffect chạy → thấy null → return early (skip subscription)
3. Context sync hoàn tất → setBusinessId("xxx")
4. Dashboard KHÔNG re-render → Realtime vẫn không được setup!
```

**Root cause**: useEffect chạy một lần khi mount, nhưng khi state ở component CHA (Context) thay đổi, component CON (Dashboard) không nhận được update đúng cách.

### Giải pháp

**Di chuyển Realtime subscription lên Context level** - nơi mà `businessId` state được quản lý:

```typescript
// ❌ SAI - Đặt trong DashboardScreen (component con)
function DashboardScreen() {
  const { businessId } = useInventoryModel();

  useEffect(() => {
    if (!businessId) return; // Chạy khi mount với businessId=null, skip luôn!
    // Setup Realtime...
  }, [businessId]);
}

// ✅ ĐÚNG - Đặt trong InventoryModelProvider (Context gốc)
function InventoryModelProvider({ children }) {
  const [businessId, setBusinessId] = useState(null);

  useEffect(() => {
    if (!businessId) return;
    // Setup Realtime tại đây - chạy NGAY khi businessId được set!
  }, [businessId]);
}
```

---

## 🐛 Lỗi 2: Stale Closure - Callback Bắt Giá Trị Cũ

### Triệu chứng

- Realtime nhận được event: `RECEIVED model change: SIMPLE`
- Nhưng log `Model updated to: SIMPLE` KHÔNG xuất hiện
- Chỉ update được model đầu tiên, các lần sau không update

### Nguyên nhân

```javascript
// Code lỗi:
useEffect(() => {
  const callback = async (payload) => {
    const newModel = payload.new?.inventory_model;

    // ❌ BUG: `model` ở đây là giá trị CŨ từ lúc useEffect được tạo!
    if (newModel && newModel !== model) {
      setModel(newModel);
    }
  };

  supabase.channel(...).on(..., callback).subscribe();
}, [businessId, model]); // model trong deps nhưng callback bắt closure cũ
```

**Root cause**: JavaScript closure - callback function "bắt" giá trị `model` tại thời điểm được tạo, không phải giá trị hiện tại.

### Giải pháp

**Không so sánh với state trong callback** - Realtime chỉ gửi event khi có thay đổi thật:

```typescript
// ✅ ĐÚNG - Luôn update, không check với model cũ
useEffect(() => {
  const callback = async (payload) => {
    const newModel = payload.new?.inventory_model;

    if (newModel) {
      // Luôn update - database đã thay đổi thì UI cũng phải thay đổi
      setModel(newModel);
    }
  };

  supabase.channel(...).on(..., callback).subscribe();
}, [businessId]); // Chỉ cần businessId, KHÔNG cần model
```

---

## 🐛 Lỗi 3: Async Import + Cleanup Function Sai

### Triệu chứng

- Log hiển thị subscription được tạo
- Nhưng khi navigate away rồi quay lại, có NHIỀU subscription chồng chéo
- Memory leak, app chậm dần

### Nguyên nhân

```javascript
// Code lỗi:
useEffect(() => {
  import("../lib/supabase").then(({ supabase }) => {
    const channel = supabase.channel(...).subscribe();

    // ❌ BUG: return này nằm TRONG .then(), không phải cleanup của useEffect!
    return () => {
      supabase.removeChannel(channel);
    };
  });
}, [businessId]);
```

**Root cause**: Cleanup function phải được return trực tiếp từ useEffect, không phải từ Promise callback.

### Giải pháp

**Sử dụng pattern IIFE với flag `isMounted`**:

```typescript
// ✅ ĐÚNG - Cleanup function đúng vị trí
useEffect(() => {
  let channel = null;
  let isMounted = true;

  // IIFE để dùng async/await
  (async () => {
    const { supabase } = await import("../lib/supabase");

    if (!isMounted) return; // Đã unmount trong lúc import

    channel = supabase.channel(...).subscribe();
  })();

  // ✅ Cleanup function ở ROOT level của useEffect
  return () => {
    isMounted = false;
    if (channel) {
      import("../lib/supabase").then(({ supabase }) => {
        supabase.removeChannel(channel);
      });
    }
  };
}, [businessId]);
```

---

## 🐛 Lỗi 4: Supabase Realtime Chưa Bật Cho Table

### Triệu chứng

- Log hiển thị: `Subscription status: CHANNEL_ERROR`
- Hoặc: `SUBSCRIBED` nhưng không nhận được event nào

### Nguyên nhân

Supabase mặc định KHÔNG bật Realtime cho tất cả tables. Cần enable thủ công.

### Giải pháp

**Option 1 - Supabase Dashboard:**

1. Vào **Database** → **Replication**
2. Tìm table `businesses`
3. Bật toggle **Realtime**

**Option 2 - SQL Migration:**

```sql
-- Enable realtime for businesses table
ALTER PUBLICATION supabase_realtime ADD TABLE businesses;
```

**Option 3 - Kiểm tra RLS:**

```sql
-- Staff phải có quyền SELECT để nhận Realtime events
CREATE POLICY "Users can view their business"
ON businesses FOR SELECT
USING (
  id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
);
```

---

## 📊 Checklist Debug Realtime

Khi Realtime không hoạt động, check theo thứ tự:

| #   | Check                    | Log cần tìm                                    |
| --- | ------------------------ | ---------------------------------------------- |
| 1   | businessId có giá trị?   | `✅ [Context] BusinessId SET: xxx`             |
| 2   | Subscription được tạo?   | `🔔 Setting up subscription for business: xxx` |
| 3   | Subscription thành công? | `✅ Successfully subscribed!`                  |
| 4   | Có nhận event?           | `🔔 RECEIVED model change: xxx`                |
| 5   | State được update?       | `✅ Model updated to: xxx`                     |

### Nếu thiếu log #1:

→ Vấn đề ở `syncBusinessConfig()` - check server response

### Nếu thiếu log #2:

→ Race condition - di chuyển subscription lên Context

### Nếu log #3 là `CHANNEL_ERROR`:

→ Bật Realtime cho table trong Supabase Dashboard

### Nếu thiếu log #4:

→ Kiểm tra RLS policies cho table

### Nếu thiếu log #5:

→ Stale closure - xóa điều kiện so sánh với model cũ

---

## 🚀 Performance Tips

| Môi trường     | Latency      | Lý do                                    |
| -------------- | ------------ | ---------------------------------------- |
| Dev + Tunnel   | 2-5s         | Ngrok proxy, JS unoptimized, console.log |
| Dev + LAN      | 0.5-1s       | Không tunnel, vẫn có debug overhead      |
| **Production** | **50-200ms** | Direct connection, optimized bundle      |

**Để tăng performance trong production:**

1. Xóa các `console.log` debug (giữ lại error logs)
2. Sử dụng production build: `eas build --profile production`
3. Tắt Hermes inspector

---

## 📁 Files Liên Quan

- `apps/mobile/src/contexts/InventoryModelContext.tsx` - Realtime subscription
- `apps/mobile/src/lib/supabase.ts` - syncBusinessConfig
- `apps/mobile/src/screens/DashboardScreen.tsx` - UI hiển thị model

---

_Tài liệu này được tạo sau khi fix lỗi ngày 2026-01-02_
