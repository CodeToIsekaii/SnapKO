/**
 * E2E Test: Ingredient Management
 * Tests: Create ingredient validation, Unit conversions
 */

import {
  createIngredientSchema,
  INGREDIENT_UNITS,
  parseAliases,
  formatVND,
} from "@snapko/shared";

describe("Ingredient Management", () => {
  describe("Create Ingredient Validation", () => {
    it("should validate correct ingredient data", () => {
      const validData = {
        name: "Trứng gà",
        baseUnit: "quả",
        unitCost: 5000,
        aliases: ["egg", "trứng"],
      };

      const result = createIngredientSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject negative unit cost", () => {
      const invalidData = {
        name: "Test",
        baseUnit: "kg",
        unitCost: -100,
      };

      const result = createIngredientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject too short name", () => {
      const invalidData = {
        name: "A",
        baseUnit: "kg",
        unitCost: 1000,
      };

      const result = createIngredientSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept zero unit cost", () => {
      const validData = {
        name: "Free Sample",
        baseUnit: "cái",
        unitCost: 0,
      };

      const result = createIngredientSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should trim whitespace from name", () => {
      const data = {
        name: "  Đường trắng  ",
        baseUnit: "kg",
        unitCost: 25000,
      };

      const result = createIngredientSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Đường trắng");
      }
    });
  });

  describe("Unit Constants", () => {
    it("should have all required units", () => {
      const requiredUnits = ["kg", "g", "lít", "ml", "chai", "lon"];

      requiredUnits.forEach((unit) => {
        expect(INGREDIENT_UNITS).toContain(unit);
      });
    });

    it("should have at least 10 unit types", () => {
      expect(INGREDIENT_UNITS.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe("Alias Parsing", () => {
    it("should parse comma-separated aliases", () => {
      const result = parseAliases("egg, trứng, trung ga");

      expect(result).toHaveLength(3);
      expect(result).toContain("egg");
      expect(result).toContain("trứng");
      expect(result).toContain("trung ga");
    });

    it("should handle empty string", () => {
      const result = parseAliases("");
      expect(result).toHaveLength(0);
    });

    it("should handle whitespace-only", () => {
      const result = parseAliases("   ");
      expect(result).toHaveLength(0);
    });

    it("should filter empty entries", () => {
      const result = parseAliases("egg,  , trứng, ");
      expect(result).toHaveLength(2);
    });
  });

  describe("VND Formatting", () => {
    it("should format currency correctly", () => {
      expect(formatVND(50000)).toContain("50");
      expect(formatVND(50000)).toContain("đ");
    });

    it("should handle large numbers", () => {
      const result = formatVND(1000000);
      expect(result).toContain("1");
      expect(result).toContain("000");
    });

    it("should handle zero", () => {
      const result = formatVND(0);
      expect(result).toContain("0");
      expect(result).toContain("đ");
    });
  });
});
