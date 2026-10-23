import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ForgeService } from './application/forge-service'
import { CraftInput, type ForgeError } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<ForgeError['code'], 404 | 409 | 422> = {
  UNKNOWN_RECIPE: 422,
  FORGE_BUSY: 409,
  TOO_MANY_ITEMS: 409,
  NOT_FORGING: 409,
  ITEM_NOT_FOUND: 404,
}

/**
 * Sous-application Hono du module Forge, montée sur /api/forge.
 * Le forgeron est toujours le joueur que l'authentification a identifié : aucune route
 * n'accepte un identifiant de joueur dans la requête.
 */
export function createForgeApi(service: ForgeService) {
  return (
    new Hono<AppEnv>()
      // Forge du joueur, inventaire et livre des recettes.
      .get('/', async (c) => c.json(await service.get(c.var.userId)))

      // Lancement d'une fabrication.
      .post('/craft', validateJson(CraftInput), async (c) => {
        const result = await service.craft(c.var.userId, c.req.valid('json').recipe)
        return result.ok
          ? c.json({ view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Annulation de la fabrication en cours.
      .post('/cancel', async (c) => {
        const result = await service.cancel(c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Fonte d'un objet de l'inventaire.
      .post('/items/:id/smelt', async (c) => {
        const result = await service.smelt(c.var.userId, c.req.param('id'))
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type ForgeApi = ReturnType<typeof createForgeApi>
