import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { CaravanService } from './application/caravan-service'
import { type CaravanError, SendCaravanInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<CaravanError['code'], 404 | 409 | 422> = {
  SAME_PLAYER: 422,
  UNKNOWN_RECIPIENT: 404,
  INVALID_CARGO: 422,
  CARGO_TOO_HEAVY: 422,
  TOO_MANY_CARAVANS: 409,
  ALREADY_EXISTS: 409,
  CARAVAN_NOT_FOUND: 404,
  NOT_TRAVELLING: 409,
  TOO_LATE: 409,
  NOT_ARRIVED: 409,
}

/**
 * Sous-application Hono du module Caravane, montée sur /api/caravan.
 * L'expéditeur est toujours le joueur que l'authentification a identifié : aucune route
 * n'accepte l'identifiant de l'expéditeur dans la requête.
 */
export function createCaravanApi(service: CaravanService) {
  return (
    new Hono<AppEnv>()
      // Caravanes envoyées et reçues par le joueur.
      .get('/caravans', async (c) => c.json(await service.list(c.var.userId)))

      // Destinataires possibles : les autres joueurs qui ont fondé un village.
      .get('/recipients', async (c) =>
        c.json({ recipients: await service.recipients(c.var.userId) }),
      )

      // Envoi d'une caravane.
      .post('/caravans', validateJson(SendCaravanInput), async (c) => {
        const { recipientId, cargo } = c.req.valid('json')
        const player = { id: c.var.userId, name: c.var.userName }
        const { caravanId, result } = await service.send(player, recipientId, cargo)
        return result.ok
          ? c.json({ caravanId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Rappel d'une caravane par son expéditeur.
      .post('/caravans/:id/recall', async (c) => {
        const result = await service.recall(c.var.userId, c.req.param('id'))
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

/** Type de la sous-application, utilisé par le client typé de l'interface. */
export type CaravanApi = ReturnType<typeof createCaravanApi>
