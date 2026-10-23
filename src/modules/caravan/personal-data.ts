import { eq, or } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { StoredEvent } from '@/platform/event-store/event-store'
import {
  ERASED_NAME,
  ERASED_VILLAGE,
  type PersonalDataContributor,
} from '@/platform/privacy/privacy'
import type { ProjectionRunner } from '@/platform/projection/projection'
import { CARAVAN_STREAM_PREFIX } from './contracts'
import { caravansProjection } from './infrastructure/caravans-projection'
import { caravans, recipients } from './infrastructure/schema'

/**
 * Données personnelles de la Caravane : le nom de l'expéditeur et celui du village du
 * destinataire, copiés dans l'événement d'envoi et dans les tables de lecture, ainsi que
 * l'historique des caravanes envoyées et reçues.
 */
export function createCaravanPersonalData(
  db: Db,
  projections: ProjectionRunner,
): PersonalDataContributor {
  return {
    name: 'caravan',

    async export(playerId) {
      await projections.catchUp(caravansProjection)
      const rows = await db
        .select()
        .from(caravans)
        .where(or(eq(caravans.senderId, playerId), eq(caravans.recipientId, playerId)))
      const [recipient] = await db
        .select()
        .from(recipients)
        .where(eq(recipients.playerId, playerId))
      return {
        // Le joueur figure parmi les destinataires possibles, sous le nom de son village.
        recipientVillage: recipient?.villageName ?? null,
        sent: rows
          .filter((row) => row.senderId === playerId)
          .map((row) => ({
            caravanId: row.caravanId,
            recipientVillage: row.recipientVillage,
            cargo: row.cargo,
            status: row.status,
            sentAt: row.sentAt,
            arrivesAt: row.arrivesAt,
            stolen: row.stolen,
            returned: row.returned,
          })),
        // Le nom de l'expéditeur est une donnée d'un autre joueur : il n'est pas exporté.
        received: rows
          .filter((row) => row.recipientId === playerId)
          .map((row) => ({
            caravanId: row.caravanId,
            cargo: row.cargo,
            status: row.status,
            sentAt: row.sentAt,
            arrivesAt: row.arrivesAt,
          })),
      }
    },

    // Seul l'événement d'envoi contient des noms : celui de l'expéditeur, et celui du village
    // du destinataire. Les identifiants, pseudonymes, restent intacts.
    redact(event: StoredEvent, playerId) {
      if (!event.stream.startsWith(CARAVAN_STREAM_PREFIX) || event.type !== 'CaravanSent') {
        return null
      }
      const data = { ...event.data }
      let changed = false
      if (data.senderId === playerId && data.senderName !== ERASED_NAME) {
        data.senderName = ERASED_NAME
        changed = true
      }
      if (data.recipientId === playerId && data.recipientVillage !== ERASED_VILLAGE) {
        data.recipientVillage = ERASED_VILLAGE
        changed = true
      }
      return changed ? data : null
    },

    // Les tables de lecture : noms remplacés dans l'historique, et retrait de la liste des
    // destinataires, afin que plus aucune caravane ne puisse être envoyée au joueur effacé.
    async erase(playerId) {
      await db
        .update(caravans)
        .set({ senderName: ERASED_NAME })
        .where(eq(caravans.senderId, playerId))
      await db
        .update(caravans)
        .set({ recipientVillage: ERASED_VILLAGE })
        .where(eq(caravans.recipientId, playerId))
      await db.delete(recipients).where(eq(recipients.playerId, playerId))
    },
  }
}
