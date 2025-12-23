# Manual Test Guide: Staff Invite Flow

Complete step-by-step guide to manually test the full staff invite flow from Desktop to Mobile.

---

## Prerequisites

- Desktop app running (`cd apps/desktop && pnpm dev`)
- Mobile app running (`cd apps/mobile && pnpm dev`)
- Supabase cloud connected (migrations applied)
- Owner account created

---

## Test Flow

### Part 1: Desktop - Generate Invite Code

**Steps:**

1. **Start Desktop App**

   ```bash
   cd apps/desktop
   pnpm dev
   ```

2. **Login as OWNER**

   - Email: `owner@snapko.test` (or your owner account)
   - Password: Your password
   - Click "Đăng nhập"

3. **Navigate to Employees Tab**

   - Click tab "👥 Nhân viên" in top navigation

4. **Generate Invite Code**

   - Click button "➕ Tạo mã mời"
   - Wait for modal to appear

5. **Verify Modal Display**

   - ✅ Modal shows with title "🎫 Mã mời nhân viên"
   - ✅ Code displayed in large font (48px, monospace)
   - ✅ Code is 6 characters (alphanumeric, uppercase)
   - ✅ Expiry notice shows "48 giờ"
   - ✅ "📋 Copy mã" button visible

6. **Copy Invite Code**

   - Click "📋 Copy mã"
   - Button changes to "✓ Đã sao chép!"
   - **Save this code** (e.g., `ABC123`)

7. **Verify in Supabase**

   - Go to https://supabase.com/dashboard/project/kxeervlkzyitlbksbfvp/editor
   - Open table `staff_invite_codes`
   - ✅ New row exists with your code
   - ✅ `status` = `ACTIVE`
   - ✅ `expires_at` is ~48 hours from now
   - ✅ `business_id` matches your business

8. **Close Modal**
   - Click "Đóng" button

---

### Part 2: Mobile - Join Using Invite Code

**Steps:**

1. **Start Mobile App**

   ```bash
   cd apps/mobile
   pnpm dev
   ```

   - Scan QR code with Expo Go

2. **Navigate to Join Screen**

   - If logged in, logout first
   - Tap "Tham gia doanh nghiệp" or "Join Business"

3. **Enter Invite Code**

   - Input field: Enter the 6-char code from Desktop (e.g., `ABC123`)
   - ✅ Code accepts uppercase letters and numbers only

4. **Fill Staff Details**

   - **Full Name:** `Nguyen Van A`
   - **Phone:** `0901234567`
   - **Email:** `staff@snapko.test`
   - **Password:** `password123`

5. **Submit Join Request**

   - Tap "Gửi yêu cầu" or "Submit"
   - Wait for processing

6. **Verify Success**

   - ✅ Success message appears
   - ✅ Redirected to "Pending Approval" screen
   - ✅ Message shows "Chờ chủ quán duyệt"

7. **Verify in Supabase**
   - Open table `profiles`
   - ✅ New row with email `staff@snapko.test`
   - ✅ `role` = `STAFF`
   - ✅ `status` = `PENDING`
   - ✅ `business_id` matches owner's business

---

### Part 3: Desktop - Approve Staff

**Steps:**

1. **Return to Desktop App**

   - Should already be on "Nhân viên" tab

2. **Verify Pending Section Appears**

   - ✅ Yellow section "⏳ Đang chờ duyệt (1)" visible
   - ✅ Staff name "Nguyen Van A" appears
   - ✅ Phone number "0901234567" shown

3. **Approve Staff**

   - Click "✓ Duyệt" button next to staff name
   - Wait for refresh

4. **Verify Staff Moved to Active**

   - ✅ Staff disappears from "Pending" section
   - ✅ Staff appears in "Active Staff" table
   - ✅ Status badge shows "ACTIVE" (green)

5. **Verify in Supabase**
   - Refresh `profiles` table
   - ✅ Staff row updated: `status` = `ACTIVE`

---

### Part 4: Mobile - Access Inventory

**Steps:**

1. **Return to Mobile App**

   - If still on pending screen, pull to refresh or restart app

2. **Login as New Staff**

   - Email: `staff@snapko.test`
   - Password: `password123`

3. **Verify Access Granted**

   - ✅ Successfully logged in
   - ✅ Can see inventory screen
   - ✅ Can navigate to "Chụp ảnh" tab
   - ✅ Camera button visible

4. **Test Inventory Capture**
   - Tap "Chụp ảnh"
   - Take photo of ingredients
   - ✅ AI parsing works
   - ✅ Can confirm and sync

---

## Edge Cases to Test

### Test 1: Offline Code Generation

**Steps:**

1. Desktop: Disconnect internet (Airplane mode)
2. Click "Tạo mã mời"
3. ✅ Alert appears: "⚠️ Vui lòng kết nối Internet..."
4. Reconnect internet
5. Try again → Should work

### Test 2: Invalid Code

**Steps:**

1. Mobile: Enter wrong code (e.g., `WRONG1`)
2. Submit
3. ✅ Error message: "Mã không hợp lệ"

### Test 3: Expired Code

**Steps:**

1. Supabase: Manually update `expires_at` to past date
2. Mobile: Try to join with that code
3. ✅ Error message: "Mã đã hết hạn"

### Test 4: Multiple Staff, Same Code

**Steps:**

1. Desktop: Generate code `SHARED1`
2. Mobile 1: Join with `SHARED1` as "Staff One"
3. Mobile 2: Join with `SHARED1` as "Staff Two"
4. Desktop: Both appear in pending list
5. ✅ Approve both individually

### Test 5: Reject Staff

**Steps:**

1. Desktop: Pending staff visible
2. Click "✗ Từ chối" button
3. ✅ Staff disappears from pending
4. Supabase: `status` = `REJECTED`
5. Mobile: Cannot login

### Test 6: Deactivate Active Staff

**Steps:**

1. Desktop: Active staff visible
2. Click "🚫 Vô hiệu hóa"
3. ✅ Status changes to INACTIVE
4. Mobile: Logout and try to login
5. ✅ Login blocked or limited access

---

## Verification Checklist

### Desktop

- [ ] Login works
- [ ] Employees tab loads
- [ ] Generate invite code button works
- [ ] Modal displays correctly
- [ ] Code is 6 chars, alphanumeric
- [ ] Copy to clipboard works
- [ ] Pending staff section appears
- [ ] Approve button works
- [ ] Reject button works
- [ ] Active staff table updates
- [ ] Deactivate button works

### Mobile

- [ ] Join screen accessible
- [ ] Invite code input works
- [ ] Form validation works
- [ ] Submit creates profile
- [ ] Pending status shown
- [ ] Login after approval works
- [ ] Inventory access granted
- [ ] Camera capture works

### Supabase

- [ ] `staff_invite_codes` table has new rows
- [ ] `profiles` table updates correctly
- [ ] RLS policies prevent unauthorized access
- [ ] Edge Function logs show success

### Security

- [ ] Cannot SELECT invite codes directly (RLS)
- [ ] Expired codes rejected
- [ ] Invalid codes rejected
- [ ] Offline handling prevents crashes
- [ ] Multiple staff can use same code

---

## Troubleshooting

### Issue: "Function not found"

**Cause:** Edge Function not deployed

**Fix:**

```bash
# Deploy via Dashboard (if Docker not available)
# OR
npx supabase functions deploy staff-generate-invite
```

### Issue: "RLS policy violation"

**Cause:** Migrations not applied

**Fix:**

```bash
npx supabase db push
```

### Issue: Code not appearing in Supabase

**Cause:** Edge Function error or network issue

**Fix:**

1. Check Desktop console logs
2. Check Supabase Function logs
3. Verify internet connection

### Issue: Mobile cannot join

**Cause:** Code verification failing

**Fix:**

1. Check code is correct (case-sensitive)
2. Verify code not expired
3. Check Supabase connection

---

## Success Criteria

✅ **All tests pass**
✅ **No console errors**
✅ **Supabase data correct**
✅ **UX smooth and intuitive**
✅ **Security policies enforced**

---

## Next Steps After Testing

1. Document any bugs found
2. Fix issues
3. Re-test
4. Mark as production-ready
5. Deploy to production environment
