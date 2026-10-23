/**
 * Contenu de la Forge : les recettes, leur coût et leur durée de fabrication.
 * Ce fichier ne contient que des données ; les règles sont dans forge.ts.
 */

/** Quantités de ressources, par nom de ressource (« wood », « stone », « gold »). */
export type Amounts = Partial<Record<string, number>>

/** Recettes connues de la forge. */
export const RECIPE_IDS = ['axe', 'hammer', 'ring', 'crown'] as const
export type RecipeId = (typeof RECIPE_IDS)[number]

export interface Recipe {
  /** Ressources consommées par la fabrication. */
  cost: Amounts
  /** Durée de fabrication, en millisecondes (règle 5). */
  durationMs: number
}

export const RECIPES: Record<RecipeId, Recipe> = {
  axe: { cost: { wood: 40, stone: 20 }, durationMs: 60_000 },
  hammer: { cost: { wood: 30, stone: 40 }, durationMs: 90_000 },
  ring: { cost: { stone: 10, gold: 20 }, durationMs: 120_000 },
  crown: { cost: { stone: 30, gold: 60 }, durationMs: 300_000 },
}

/** Nombre maximal d'exemplaires d'une même recette dans l'inventaire (règle 3). */
export const MAX_PER_RECIPE = 3

/** Indique si un nom désigne une recette connue (règle 1). */
export const isRecipe = (name: string): name is RecipeId =>
  (RECIPE_IDS as readonly string[]).includes(name)

/** Ressources rendues par la fonte d'un objet : la moitié du coût, arrondie (règle 8). */
export function smeltRefund(recipe: RecipeId): Amounts {
  const refund: Amounts = {}
  for (const [resource, amount] of Object.entries(RECIPES[recipe].cost)) {
    const half = Math.floor((amount ?? 0) / 2)
    if (half > 0) refund[resource] = half
  }
  return refund
}
