/**
 * Database Interface for Cross-Platform Abstraction
 *
 * IMPORTANT: This interface enables code sharing between:
 * - Mobile (expo-sqlite - async)
 * - Desktop (better-sqlite3 - wrapped in Promise)
 *
 * Per .antigravityrules: packages/shared must be "Pure Logic" only.
 */

/**
 * Platform-agnostic database interface
 * All methods return Promises for consistent async API
 */
export interface IDatabase {
  /**
   * Execute SELECT query and return all rows
   * @param sql SQL query string
   * @param params Bind parameters
   * @returns Array of rows
   */
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Execute INSERT/UPDATE/DELETE statement
   * @param sql SQL statement
   * @param params Bind parameters
   * @returns void (use query for returning data)
   */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /**
   * Get first row from query result
   * @param sql SQL query string
   * @param params Bind parameters
   * @returns First row or null
   */
  getFirst<T>(sql: string, params?: unknown[]): Promise<T | null>;

  /**
   * Execute multiple queries in a transaction
   * Rolls back on any error
   * @param queries Array of { sql, args } objects
   */
  transaction(queries: { sql: string; args?: unknown[] }[]): Promise<void>;
}

/**
 * Factory function type for creating database instances
 */
export type DatabaseFactory = () => Promise<IDatabase>;

/**
 * Sync status for local-first architecture
 */
export interface SyncStatus {
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
  error: string | null;
}

/**
 * Sync result from pull/push operations
 */
export interface SyncResult {
  success: boolean;
  synced: number;
  errors: string[];
}
