/**
 * E2E Test: COGS & Business Logic
 * Tests: Recipe COGS, Inventory value, Profit calculations
 */

import {
  calculateRecipeCOGS,
  calculateGrossProfit,
  calculateGrossProfitMargin,
  calculateInventoryValue,
  calculateInventoryValueByLocation,
} from "@snapko/shared";

// Mock data
const mockIngredients = [
  {
    id: "1",
    business_id: "biz1",
    name: "Cà phê",
    base_unit: "kg",
    unit_cost: 200000,
    warehouse_qty: 10,
    bar_qty: 2,
    aliases: [],
    archived: false,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: "2",
    business_id: "biz1",
    name: "Đường",
    base_unit: "kg",
    unit_cost: 25000,
    warehouse_qty: 5,
    bar_qty: 1,
    aliases: [],
    archived: false,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
  {
    id: "3",
    business_id: "biz1",
    name: "Sữa",
    base_unit: "lít",
    unit_cost: 35000,
    warehouse_qty: 20,
    bar_qty: 5,
    aliases: [],
    archived: false,
    conversion_rate: 1,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  },
];

const mockRecipe = {
  id: "r1",
  business_id: "biz1",
  name: "Cà phê sữa",
  selling_price: 35000,
  description: null,
  archived: false,
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

const mockRecipeIngredients = [
  { recipe_id: "r1", ingredient_id: "1", quantity_needed: 0.02 }, // 20g cà phê
  { recipe_id: "r1", ingredient_id: "2", quantity_needed: 0.01 }, // 10g đường
  { recipe_id: "r1", ingredient_id: "3", quantity_needed: 0.05 }, // 50ml sữa
];

describe("COGS & Business Logic", () => {
  describe("Recipe COGS Calculation", () => {
    it("should calculate COGS correctly", () => {
      const cogs = calculateRecipeCOGS(
        mockRecipe,
        mockRecipeIngredients,
        mockIngredients
      );

      // 20g cà phê = 200000 * 0.02 = 4000
      // 10g đường = 25000 * 0.01 = 250
      // 50ml sữa = 35000 * 0.05 = 1750
      // Total = 6000 VND
      expect(cogs).toBe(6000);
    });

    it("should handle missing ingredients gracefully", () => {
      const partialIngredients = mockRecipeIngredients.slice(0, 1);
      const cogs = calculateRecipeCOGS(
        mockRecipe,
        partialIngredients,
        mockIngredients
      );

      expect(cogs).toBe(4000); // Only coffee
    });

    it("should return 0 for empty recipe", () => {
      const cogs = calculateRecipeCOGS(mockRecipe, [], mockIngredients);
      expect(cogs).toBe(0);
    });
  });

  describe("Profit Calculations", () => {
    it("should calculate gross profit", () => {
      const profit = calculateGrossProfit(35000, 6000);
      expect(profit).toBe(29000);
    });

    it("should handle negative profit (loss)", () => {
      const profit = calculateGrossProfit(5000, 6000);
      expect(profit).toBe(-1000);
    });

    it("should calculate profit margin percentage", () => {
      const margin = calculateGrossProfitMargin(35000, 6000);
      // (35000 - 6000) / 35000 * 100 = 82.86%
      expect(margin).toBeCloseTo(82.86, 1);
    });

    it("should handle zero selling price", () => {
      const margin = calculateGrossProfitMargin(0, 6000);
      expect(margin).toBe(0);
    });
  });

  describe("Inventory Value", () => {
    it("should calculate total inventory value", () => {
      const value = calculateInventoryValue(mockIngredients);

      // Cà phê: (10 + 2) * 200000 = 2,400,000
      // Đường: (5 + 1) * 25000 = 150,000
      // Sữa: (20 + 5) * 35000 = 875,000
      // Total = 3,425,000 VND
      expect(value).toBe(3425000);
    });

    it("should calculate value by location", () => {
      const result = calculateInventoryValueByLocation(mockIngredients);

      // Warehouse: 10*200000 + 5*25000 + 20*35000 = 2,825,000
      expect(result.warehouse).toBe(2825000);

      // Bar: 2*200000 + 1*25000 + 5*35000 = 600,000
      expect(result.bar).toBe(600000);

      // Total should match
      expect(result.total).toBe(result.warehouse + result.bar);
    });

    it("should handle empty inventory", () => {
      const value = calculateInventoryValue([]);
      expect(value).toBe(0);
    });
  });
});
