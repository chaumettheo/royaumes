/**
 * Entrée publique « partagée » du module Forge : utilisable par le serveur
 * comme par l'interface.
 */
import { z } from 'zod'
import { RECIPE_IDS } from './domain/recipes'

export type { Amounts, ForgeError, RecipeId } from './domain/forge'
export { MAX_PER_RECIPE, RECIPE_IDS } from './domain/recipes'
export type { ForgeView } from './domain/view'

/** Corps attendu pour lancer une fabrication : une recette connue. */
export const CraftInput = z.object({ recipe: z.enum(RECIPE_IDS) })

/** Préfixe commun aux noms des flux de la Forge : un flux par joueur. */
export const FORGE_STREAM_PREFIX = 'forge-'

/** Nom du flux, et du canal temps réel, de la forge d'un joueur. */
export const forgeStream = (playerId: string) => `${FORGE_STREAM_PREFIX}${playerId}`

/** Sujets des messages adressés à la Forge. */
export const FORGE_TOPICS = {
  /** Réponse du Village au prélèvement des ressources d'une recette. */
  transferResult: 'forge.transfer-result',
} as const
