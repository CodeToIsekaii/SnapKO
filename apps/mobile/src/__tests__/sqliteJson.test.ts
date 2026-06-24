import {
  normalizeJsonArrayForSql,
  normalizeNullableJsonForSql,
} from "../sync/sqliteJson";

describe("SQLite JSON bind normalizers", () => {
  it("serializes object ai_parsed_json values before SQLite binding", () => {
    expect(normalizeNullableJsonForSql({ items: [{ name: "Robusta" }] })).toBe(
      '{"items":[{"name":"Robusta"}]}'
    );
  });

  it("preserves string and null ai_parsed_json values", () => {
    expect(normalizeNullableJsonForSql('{"ok":true}')).toBe('{"ok":true}');
    expect(normalizeNullableJsonForSql(null)).toBeNull();
  });

  it("stores source_photo_urls as a JSON array string", () => {
    expect(normalizeJsonArrayForSql(["https://cdn.test/photo.jpg"])).toBe(
      '["https://cdn.test/photo.jpg"]'
    );
    expect(normalizeJsonArrayForSql('["file:///local/photo.jpg"]')).toBe(
      '["file:///local/photo.jpg"]'
    );
    expect(normalizeJsonArrayForSql({ url: "https://cdn.test/photo.jpg" })).toBe(
      "[]"
    );
  });
});
