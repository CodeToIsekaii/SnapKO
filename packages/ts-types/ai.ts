/**
 * SnapKO AI Types
 * Types for AI parsing and ingredient mapping
 */

/**
 * Raw item returned from AI parse
 */
export interface AiRawItem {
  name: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost?: number | null;
}

/**
 * Item after user mapping (ready to save)
 */
export interface AiMappedItem {
  // Data từ AI
  rawName: string;
  quantity: number;
  unit: string;
  confidence: number;
  unitCost: number | null;

  // Data user đã map (link với DB)
  linkedIngredientId: string | null;
  linkedIngredientName: string | null;
  isNewIngredient: boolean;
}

/**
 * Ingredient from local DB for autocomplete
 */
export interface LocalIngredient {
  id: string;
  name: string;
  aliases: string[];
  baseUnit: string;
  unitCost: number;
}

/**
 * Match score for autocomplete suggestions
 */
export interface IngredientMatch {
  ingredient: LocalIngredient;
  score: number; // 0-100
  matchType: "exact" | "alias" | "fuzzy";
}

/**
 * Find best matching ingredients for AI parsed name
 */
export function findMatchingIngredients(
  aiName: string,
  ingredients: LocalIngredient[],
  limit = 5
): IngredientMatch[] {
  const normalized = aiName.toLowerCase().trim();
  const matches: IngredientMatch[] = [];

  for (const ing of ingredients) {
    const ingName = ing.name.toLowerCase();

    // Exact match
    if (ingName === normalized) {
      matches.push({ ingredient: ing, score: 100, matchType: "exact" });
      continue;
    }

    // Alias match
    const aliasMatch = ing.aliases.some((a) => a.toLowerCase() === normalized);
    if (aliasMatch) {
      matches.push({ ingredient: ing, score: 95, matchType: "alias" });
      continue;
    }

    // Fuzzy match: contains or is contained
    if (ingName.includes(normalized) || normalized.includes(ingName)) {
      const score = Math.round(
        (Math.min(ingName.length, normalized.length) /
          Math.max(ingName.length, normalized.length)) *
          80
      );
      matches.push({ ingredient: ing, score, matchType: "fuzzy" });
    }
  }

  // Sort by score descending, take top N
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Transform raw AI items to mapped items with auto-matching
 */
export function autoMapItems(
  rawItems: AiRawItem[],
  ingredients: LocalIngredient[]
): AiMappedItem[] {
  return rawItems.map((raw) => {
    const matches = findMatchingIngredients(raw.name, ingredients, 1);
    const bestMatch = matches[0];

    // Auto-link if high confidence match (≥80 score)
    if (bestMatch && bestMatch.score >= 80) {
      return {
        rawName: raw.name,
        quantity: raw.quantity,
        unit: raw.unit,
        confidence: raw.confidence,
        unitCost: raw.unitCost ?? bestMatch.ingredient.unitCost,
        linkedIngredientId: bestMatch.ingredient.id,
        linkedIngredientName: bestMatch.ingredient.name,
        isNewIngredient: false,
      };
    }

    // No good match - needs manual mapping
    return {
      rawName: raw.name,
      quantity: raw.quantity,
      unit: raw.unit,
      confidence: raw.confidence,
      unitCost: raw.unitCost ?? null,
      linkedIngredientId: null,
      linkedIngredientName: null,
      isNewIngredient: false,
    };
  });
}

/**
 * Check if all items are properly mapped
 */
export function allItemsMapped(items: AiMappedItem[]): boolean {
  return items.every(
    (item) => item.linkedIngredientId !== null || item.isNewIngredient
  );
}

/**
 * Count items needing mapping
 */
export function countUnmappedItems(items: AiMappedItem[]): number {
  return items.filter(
    (item) => item.linkedIngredientId === null && !item.isNewIngredient
  ).length;
}
