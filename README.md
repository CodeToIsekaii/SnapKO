# SnapKO (Monorepo)

Local-first, Low-cost, and Compliance-focused F&B Inventory App.

## Workspace structure

- `apps/mobile` — Expo (React Native) + TypeScript (offline-first)
- `apps/web-landing` — Next.js (App Router) + Tailwind (Marketing + Payment portal)
- `apps/desktop` — Electron + Vite (React) + TypeScript (Heavy-lifting workstation app)
- `supabase/` — Supabase local dev + Edge Functions + migrations

## Commands (pnpm required)

From `SnapKO/`:

- `pnpm mobile:start` — start Expo
- `pnpm web:dev` — start Next.js
- `pnpm desktop:dev` — start Electron + Vite
- `pnpm db:start` — start Supabase (Docker)
 - `pnpm db:reset` — apply migrations + seed (local)

## Environment variables

This repo follows strict env var prefixes:

- **Mobile (Expo)**: `EXPO_PUBLIC_*`
- **Web (Next.js)**: `NEXT_PUBLIC_*`
- **Desktop (Vite)**: `VITE_*`

Each app includes a committed `.env.example`. Copy it to `.env` (do not commit `.env`):

- `apps/mobile/.env.example` → `apps/mobile/.env`
- `apps/web-landing/.env.example` → `apps/web-landing/.env`
- `apps/desktop/.env.example` → `apps/desktop/.env`

## Local Supabase (Docker required)

- Start: `pnpm db:start` (if it fails, check Docker Desktop is running)
- Reset DB (applies migrations): `pnpm db:reset`
- Studio: `http://127.0.0.1:54323` (API: `http://127.0.0.1:54321`)

## Notes (compliance + product)

- Staff onboarding must be **invite-code + full name + phone number only** (data minimization).
- Mobile must not contain **direct “Pay Now”** actions (open web portal instead).
- After any DB schema change, run: `pnpm exec supabase db diff`
