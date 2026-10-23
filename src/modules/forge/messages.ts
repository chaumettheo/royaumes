import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { ForgeService } from './application/forge-service'
import { FORGE_TOPICS } from './contracts'
import { parseTransferId } from './domain/forge'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/**
 * Gestionnaire des messages adressés à la Forge : la réponse du Village au prélèvement des
 * ressources, qui lance ou refuse la fabrication. Il ne fait que traduire le message en appel
 * au service.
 */
export function createForgeHandlers(service: ForgeService): Record<string, MessageHandler> {
  return {
    [FORGE_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par la Forge : il désigne le joueur.
      const target = parseTransferId(transferId)
      if (!target) throw new Error(`Mouvement étranger à la Forge : ${transferId}`)
      await service.step(target.playerId, {
        type: 'RecordWithdrawal',
        transferId,
        outcome,
        missing,
      })
    },
  }
}
