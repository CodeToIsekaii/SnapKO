# SnapKO Development & Testing Guide

Complete guide for developing and testing all parts of the SnapKO monorepo.

---

## 📋 Table of Contents

1. [Environment Setup](#environment-setup)
2. [Mobile App Development](#mobile-app-development)
3. [Desktop App Development](#desktop-app-development)
4. [Web Landing Development](#web-landing-development)
5. [Backend (Supabase) Development](#backend-development)
6. [Testing Strategy](#testing-strategy)
7. [Common Issues](#common-issues)

---

## Environment Setup

### Prerequisites

```bash
# Required
- Node.js 18+ (LTS)
- pnpm 8+
- Git

# Mobile Development
- Expo CLI
- Android Studio / Xcode (for emulators)
- Expo Go app (for physical device testing)

# Desktop Development
- Electron
- Windows/macOS/Linux

# Backend Development
- Supabase CLI
- Docker Desktop (for local Supabase)
```

### Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd SnapKO

# Install dependencies (from root)
pnpm install

# Setup environment files
cp apps/mobile/.env.example apps/mobile/.env
cp apps/desktop/.env.example apps/desktop/.env
cp apps/web-landing/.env.example apps/web-landing/.env
```

### Environment Variables

**Mobile (`apps/mobile/.env`):**

```bash
EXPO_PUBLIC_SUPABASE_URL=https://kxeervlkzyitlbksbfvp.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
EXPO_PUBLIC_GEMINI_API_KEY=<your-gemini-key>
```

**Desktop (`apps/desktop/.env`):**

```bash
VITE_SUPABASE_URL=https://kxeervlkzyitlbksbfvp.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

**Web (`apps/web-landing/.env`):**

```bash
NEXT_PUBLIC_SUPABASE_URL=https://kxeervlkzyitlbksbfvp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_PAYOS_CLIENT_ID=<payos-client-id>
```

---

## Mobile App Development

### Start Development Server

```bash
cd apps/mobile

# Start Metro bundler
pnpm dev

# Or with specific platform
pnpm android  # Android emulator
pnpm ios      # iOS simulator (macOS only)
```

### Testing on Physical Device

**Option 1: Expo Go (Recommended for quick testing)**

```bash
# Start with tunnel (works over internet)
pnpm start --tunnel

# Scan QR code with Expo Go app
```

**Option 2: Development Build**

```bash
# Build development client
eas build --profile development --platform android

# Install on device and run
pnpm dev
```

### Key Features to Test

#### 1. Camera & AI Parsing

```bash
# Test flow:
1. Open app → Navigate to "Chụp ảnh"
2. Take photo of ingredients
3. Verify AI parsing with confidence scores
4. Check highlight colors:
   - Green (≥90%): High confidence
   - Yellow (85-90%): Medium confidence
   - Red (<85%): Low confidence - needs review
```

#### 2. Offline Sync

```bash
# Test flow:
1. Enable Airplane Mode
2. Capture inventory → Confirm
3. Check SQLite: SELECT * FROM pending_sync_logs
4. Disable Airplane Mode
5. Verify auto-sync triggers
6. Check Desktop app receives realtime update
```

#### 3. Staff Invite Flow

```bash
# Test flow:
1. Get invite code from Desktop app
2. Mobile: Tap "Tham gia doanh nghiệp"
3. Enter 6-char code
4. Verify account created with role=STAFF
5. Check access to inventory features
```

### Mobile Testing Commands

```bash
# TypeScript check
pnpm tsc --noEmit

# Run E2E tests
pnpm test:e2e

# Clear cache (if issues)
pnpm start --clear

# Check bundle size
npx expo export --platform android
```

### Mobile Debugging

```bash
# View logs
npx react-native log-android  # Android
npx react-native log-ios      # iOS

# Debug SQLite database
adb shell
run-as <package-name>
sqlite3 databases/snapko.db
.tables
SELECT * FROM pending_sync_logs;
```

---

## Desktop App Development

### Start Development

```bash
cd apps/desktop

# Start Vite dev server + Electron
pnpm dev

# Build for production
pnpm build

# Package as installer
pnpm build:win   # Windows
pnpm build:mac   # macOS
pnpm build:linux # Linux
```

### Key Features to Test

#### 1. Dashboard & COGS Reports

```bash
# Test flow:
1. Login → Navigate to "Dashboard" tab
2. Verify charts render:
   - Bar chart: Inventory Value (6 months)
   - Pie chart: Loss breakdown
   - Summary cards: Total Value, Item Count, Low Stock
3. Click "Refresh" → Data updates
4. Click "Xuất Excel" → Save As dialog opens
5. Verify Excel file created with Vietnamese headers
```

#### 2. Employee Management

```bash
# Test flow:
1. Navigate to "Nhân viên" tab
2. Click "Tạo mã mời"
3. Verify:
   - 6-char code displayed (large font)
   - Copy to clipboard works
   - 48h expiry notice shown
4. Check Supabase: staff_invite_codes table has new row
5. Test Approve/Reject on pending staff
```

#### 3. Export Excel

```bash
# Test flow:
1. Navigate to "Tồn kho" tab
2. Click "Xuất Excel"
3. Save As dialog → Choose location
4. Verify filename format: inventory_report_2025-12-23_09-30.xlsx
5. Open Excel → Check Vietnamese headers
6. Verify totals row at bottom
```

#### 4. Realtime Sync

```bash
# Test flow:
1. Desktop app logged in
2. Mobile app: Capture inventory → Confirm
3. Desktop: Watch for toast notification
4. Verify new log appears in "Nhật ký" tab
5. Check ingredient quantities updated
```

### Desktop Testing Commands

```bash
# TypeScript check
pnpm tsc --noEmit

# Lint
pnpm lint

# Test build
pnpm build

# Check bundle size
pnpm build && ls -lh dist/
```

### Desktop Debugging

```bash
# Open DevTools in Electron
# Press F12 or Ctrl+Shift+I in app

# View main process logs
# Check terminal where `pnpm dev` is running

# Inspect SQLite database
cd %APPDATA%/snapko-desktop  # Windows
cd ~/Library/Application Support/snapko-desktop  # macOS
sqlite3 snapko.db
.tables
SELECT * FROM local_ingredients;
```

---

## Web Landing Development

### Start Development

```bash
cd apps/web-landing

# Start Next.js dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm start
```

### Key Features to Test

#### 1. Landing Page

```bash
# Test flow:
1. Open http://localhost:3000
2. Verify hero section loads
3. Check pricing table displays correctly
4. Test responsive design (mobile/tablet/desktop)
5. Verify all links work
```

#### 2. Payment Flow (PayOS)

```bash
# Test flow:
1. Click "Nâng cấp ngay" on Pro tier
2. Verify redirect to payment page
3. Check QR code generates
4. Test webhook (use PayOS sandbox)
5. Verify subscription_expires_at updates
```

### Web Testing Commands

```bash
# TypeScript check
pnpm tsc --noEmit

# Lint
pnpm lint

# Build check
pnpm build

# Lighthouse audit
npx lighthouse http://localhost:3000 --view
```

---

## Backend Development

### Supabase Local Development

```bash
# Start local Supabase (requires Docker)
npx supabase start

# Stop
npx supabase stop

# Reset database
npx supabase db reset

# View logs
npx supabase logs
```

### Edge Functions Development

```bash
# Create new function
npx supabase functions new my-function

# Serve locally
npx supabase functions serve my-function

# Test with curl
curl -X POST http://localhost:54321/functions/v1/my-function \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Deploy to cloud
npx supabase functions deploy my-function
```

### Database Migrations

```bash
# Create new migration
npx supabase migration new add_new_table

# Edit: supabase/migrations/<timestamp>_add_new_table.sql

# Apply locally
npx supabase db reset

# Push to cloud
npx supabase db push

# Generate TypeScript types
npx supabase gen types typescript --local > packages/ts-types/database.types.ts
```

### Testing Edge Functions

**Test staff-generate-invite:**

```bash
# Local
curl -X POST http://localhost:54321/functions/v1/staff-generate-invite \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABC123", "expiresAt": "2025-12-25T00:00:00Z"}'

# Cloud
curl -X POST https://kxeervlkzyitlbksbfvp.supabase.co/functions/v1/staff-generate-invite \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "XYZ789", "expiresAt": "2025-12-25T00:00:00Z"}'
```

---

## Testing Strategy

### Unit Tests

```bash
# Mobile
cd apps/mobile
pnpm test

# Desktop
cd apps/desktop
pnpm test

# Shared packages
cd packages/shared
pnpm test
```

### E2E Tests

**Mobile E2E (Detox):**

```bash
cd apps/mobile

# Build app for testing
pnpm build:e2e:android

# Run E2E tests
pnpm test:e2e:android
```

**Desktop E2E (Playwright):**

```bash
cd apps/desktop

# Install Playwright
pnpm exec playwright install

# Run E2E tests
pnpm test:e2e
```

### Integration Tests

**Full Sync Flow Test:**

```bash
# 1. Start all services
cd SnapKO
npx supabase start
cd apps/desktop && pnpm dev &
cd apps/mobile && pnpm dev &

# 2. Test flow:
# Mobile: Capture → Confirm → Offline → Online → Sync
# Desktop: Verify realtime notification
# Supabase: Check inventory_logs table

# 3. Verify data consistency
# Mobile SQLite: pending_sync_logs (synced=1)
# Desktop SQLite: local_ingredients (updated)
# Supabase: inventory_logs (new row)
```

### Manual Testing Checklist

**Week 2 Features:**

- [ ] Dashboard charts render correctly
- [ ] COGS summary cards show accurate data
- [ ] Export Excel with Save As dialog works
- [ ] Excel filename format is Windows-safe
- [ ] Invite code generates and syncs to Supabase
- [ ] Staff can join using invite code
- [ ] Approve/Reject staff actions update Supabase
- [ ] Realtime sync from Mobile to Desktop works
- [ ] Toast notifications display correctly
- [ ] Thermal print CSS applies correctly

---

## Common Issues

### Mobile Issues

**Metro bundler won't start:**

```bash
# Clear cache
pnpm start --clear
rm -rf node_modules/.cache
```

**SQLite errors:**

```bash
# Reinstall expo-sqlite
pnpm remove expo-sqlite
pnpm add expo-sqlite
```

**Camera not working:**

```bash
# Check permissions in app.json
# Rebuild app: eas build --profile development
```

### Desktop Issues

**Electron won't start:**

```bash
# Rebuild native modules
pnpm rebuild

# Clear dist
rm -rf dist
pnpm dev
```

**SQLite errors:**

```bash
# Rebuild better-sqlite3
pnpm rebuild better-sqlite3
```

**IPC not working:**

```bash
# Check preload script is loaded
# Verify contextBridge.exposeInMainWorld
# Check main process console logs
```

### Supabase Issues

**Docker not running:**

```bash
# Start Docker Desktop
# Verify: docker --version
# Then: npx supabase start
```

**Migration conflicts:**

```bash
# Reset local DB
npx supabase db reset

# Or force push to cloud
npx supabase db push --force
```

**Edge Function errors:**

```bash
# Check function logs
npx supabase functions logs staff-generate-invite

# Re-deploy
npx supabase functions deploy staff-generate-invite
```

---

## Performance Testing

### Mobile Performance

```bash
# Check bundle size
npx expo export --platform android
du -sh dist/

# Profile with Flipper
# Install Flipper → Connect device → Profile

# Memory leaks
# Use React DevTools Profiler
```

### Desktop Performance

```bash
# Check bundle size
pnpm build
ls -lh dist/

# Profile with Chrome DevTools
# F12 → Performance tab → Record

# Memory usage
# Task Manager → Check Electron process
```

### Database Performance

```bash
# Analyze query performance
EXPLAIN ANALYZE SELECT * FROM ingredients WHERE business_id = '...';

# Check indexes
SELECT * FROM pg_indexes WHERE tablename = 'ingredients';

# Monitor connections
SELECT count(*) FROM pg_stat_activity;
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All TypeScript checks pass
- [ ] All tests pass
- [ ] Environment variables set correctly
- [ ] Database migrations applied
- [ ] Edge Functions deployed
- [ ] RLS policies verified

### Mobile Deployment

- [ ] Update version in app.json
- [ ] Build production APK/IPA
- [ ] Test on physical devices
- [ ] Submit to Play Store/App Store

### Desktop Deployment

- [ ] Update version in package.json
- [ ] Build installers for all platforms
- [ ] Code sign (Windows/macOS)
- [ ] Test installers
- [ ] Upload to release server

### Web Deployment

- [ ] Build production bundle
- [ ] Test production build locally
- [ ] Deploy to Vercel/Netlify
- [ ] Verify environment variables
- [ ] Test payment flow

---

## Useful Scripts

```bash
# Run all TypeScript checks
pnpm -r tsc --noEmit

# Run all tests
pnpm -r test

# Build all apps
pnpm -r build

# Clean all node_modules
pnpm -r clean

# Update all dependencies
pnpm -r update

# Generate types from Supabase
npx supabase gen types typescript > packages/ts-types/database.types.ts
```

---

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo](https://turbo.build/repo/docs)
