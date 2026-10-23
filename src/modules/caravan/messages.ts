import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { CaravanService } from './application/caravan-service'
import { CARAVAN_TOPICS } from './contracts'
import { parseTransferId } from './domain/caravan'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused', 'deposited']),
  missing: z.record(z.string(), z.number()).optional(),
})

/** Rappel différé d'une caravane, à son échéance. */
const ArriveMessage = z.object({ senderId: z.string().min(1), caravanId: z.string().min(1) })

/**
 * Gestionnaires des messages adressés à la Caravane : les réponses du Village, qui font partir
 * ou refusent une caravane, et les rappels d'échéance. Comme ceux du Marché, ils ne font que
 * traduire un message en appel au service.
 */
export function createCaravanHandlers(service: CaravanService): Record<string, MessageHandler> {
  return {
    [CARAVAN_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome, missing } = TransferResultMessage.parse(message.payload)
      // L'identifiant du mouvement a été construit par la Caravane : il désigne l'expéditeur.
      const target = parseTransferId(transferId)
      if (!target) throw new Error(`Mouvement étranger à la Caravane : ${transferId}`)
      await service.step(target.senderId, {
        type: 'RecordWithdrawal',
        transferId,
        outcome,
        missing,
      })
    },

    [CARAVAN_TOPICS.arrive]: async (message) => {
      const { senderId, caravanId } = ArriveMessage.parse(message.payload)
      await service.step(senderId, { type: 'SettleArrivals', caravanId })
    },
  }
}
