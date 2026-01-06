---
description: Debugging SQLite Native Crash (NPE)
---

# Analysis of SQLite Native Crash (NullPointerException)

## 1. Error Description

**Error Message:**

```
WARN [DB] Init attempt 1/3 failed: [Error: Call to function 'NativeDatabase.execAsync' has been rejected.
→ Caused by: java.lang.NullPointerException: java.lang.NullPointerException]
```

**Context:**

- Occurs on app launch (splash screen).
- Occurs after reverting `SafeAreaProvider` changes.
- Persistent across reloads (user reports "đứng ở màn khởi tạo").

## 2. Predictions & Analysis

| Prediction                       | Analysis                                                                                                                                                                                                                             | Likelihood               |
| :------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------- |
| **P1: Database Conflict**        | `App.tsx` opens "snapko.db" (Instance A) while `src/db/index.ts` opens "snapko.db" (Instance B). `expo-sqlite` (Android) might crash when `execAsync` runs on a connection influenced by another open connection (WAL mode locking). | **High**                 |
| **P2: Corrupted Native State**   | The previous hot-reload with `SafeAreaProvider` messed up the dev client runtime state. Requires full rebuild/restart of dev client.                                                                                                 | **Medium**               |
| **P3: Schema Migration Failure** | The SQL in `src/db/index.ts` (e.g., `PRAGMA journal_mode = WAL`) triggers NPE if executed on an invalid handle.                                                                                                                      | **High**                 |
| **P4: Dependency Mismatch**      | `expo-sqlite` version `^16.0.10` has a known bug with concurrent opens.                                                                                                                                                              | **Low** (Stable version) |
| **P5: Missing SafeAreaProvider** | Unlikely to cause SQLite NPE, but caused the previous crash.                                                                                                                                                                         | **Dismissed**            |

### SCRATCHPAD Analysis

- **App.tsx (Current):**
  - Defines local `initLocalDb` function.
  - Calls `SQLite.openDatabaseAsync("snapko.db")`.
  - Calls `initSyncEngine(db)`.
  - **PROBLEM:** It does NOT update the singleton in `src/db/index.ts` (`db` variable there remains null).
- **src/db/index.ts:**
  - Has singleton `let db: SQLiteDatabase | null`.
  - `getDB()` checks if `db` is null. If so, it calls `initLocalDb` (LOCAL to `src/db/index.ts`).
  - Calls `SQLite.openDatabaseAsync("snapko.db")` AGAIN.
- **Race Condition:**
  - `App.tsx` finishes init -> `dbReady = true`.
  - `Dashboard` mounts -> calls `useLowStock` -> calls `getDB()`.
  - `getDB()` sees `db` is null (because `App.tsx` opened its OWN db).
  - `getDB()` calls `initLocalDb` (internal) -> `openDatabaseAsync`.
  - **Crash Point:** `execAsync` in `src/db/index.ts`.
  - NPE suggests the native object returned by the second `openDatabaseAsync` might be invalid or the first connection's WAL mode lock is interfering in a way that crashes the native module.

## 3. Solution Plan

**Goal:** Unify Database Access. Ensure exactly **ONE** call to `openDatabaseAsync`.

1.  **Refactor `App.tsx`**:
    - Remove local `initLocalDb`.
    - Import `getDB` from `src/db/index.ts`.
    - Use `await getDB()` to initialize and get the singleton.
2.  **Verify `src/db/index.ts`**:
    - Ensure `getDB()` is robust (it is).
3.  **Clean State**:
    - Ask user to Reload (already done, but might need full client restart if native module is stuck).

## 4. Debug Instructions

### Step 1: Modify `App.tsx`

Replace the local `initLocalDb` with the singleton import.

```typescript
// App.tsx
import { getDB } from "./src/db"; // Import correctly

// ... inside useEffect ...
// Replace: const db = await initLocalDb();
// With:    const db = await getDB();
```

### Step 2: Delete `initLocalDb` definition in `App.tsx`

Remove the function block to clear confusion.

### Step 3: Test

Run app. `getDB()` will run once. Access by `useLowStock` will return the _same_ initialized instance.
