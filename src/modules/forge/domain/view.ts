/** Vue de la forge d'un joueur : sa fabrication en cours et son inventaire. */
import type { Amounts, ForgeState, RecipeId } from './forge'
import { RECIPES } from './recipes'

export interface ForgeView {
  forging: {
    recipe: RecipeId
    status: 'loading' | 'forging'
    readyAt: number | null
  } | null
  /** Objets de l'inventaire, du plus récent au plus ancien. */
  inventory: { itemId: string; recipe: RecipeId; forgedAt: number }[]
  /** Ressources qui manquaient lors de la dernière fabrication refusée ; null sinon. */
  missing: Amounts | null
}

/**
 * Vue de la forge à l'instant now. Une fabrication dont l'échéance est passée est déjà présentée
 * comme un objet de l'inventaire, même si son achèvement n'est pas encore enregistré.
 */
export function toView(state: ForgeState, now: number): ForgeView {
  const job = state.forging
  const done = job?.status === 'forging' && job.readyAt !== null && now >= job.readyAt
  const inventory = Object.values(state.inventory)
  if (done && job.readyAt !== null) {
    inventory.push({ itemId: job.jobId, recipe: job.recipe, forgedAt: job.readyAt })
  }
  return {
    forging: job && !done ? { recipe: job.recipe, status: job.status, readyAt: job.readyAt } : null,
    inventory: inventory
      .sort((a, b) => b.forgedAt - a.forgedAt)
      .map(({ itemId, recipe, forgedAt }) => ({ itemId, recipe, forgedAt })),
    missing: state.refusal?.missing ?? null,
  }
}

/** Coût et durée de chaque recette, présentés au joueur. */
export const recipeBook = () =>
  Object.entries(RECIPES).map(([recipe, { cost, durationMs }]) => ({
    recipe: recipe as RecipeId,
    cost,
    durationMs,
  }))
