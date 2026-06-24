export function normalizeNullableJsonForSql(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export function normalizeJsonArrayForSql(value: unknown): string {
  if (value == null) return "[]";

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? JSON.stringify(parsed) : "[]";
    } catch {
      return "[]";
    }
  }

  return Array.isArray(value) ? JSON.stringify(value) : "[]";
}
