import { and, asc, desc, eq, inArray, lte, ne } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { CaravansReader } from '../application/caravans-reader'
import type { CaravanSummary } from '../contracts'
import { type Amounts, type CaravanStatus, halfway } from '../domain/caravan'
import { caravansProjection } from './caravans-projection'
import { caravans, recipients } from './schema'

/** Nombre maximal de caravanes présentées dans chaque liste, et de destinataires proposés. */
const LIST_SIZE = 20
const RECIPIENTS_SIZE = 100

/** États dans lesquels une caravane est présentée à son destinataire : elle a quitté son village. */
const VISIBLE_TO_RECIPIENT: CaravanStatus[] = ['travelling', 'delivered', 'attacked', 'recalled']

type Row = typeof caravans.$inferSelect

/** Instant jusqu'auquel une caravane en route peut être rappelée, selon la règle du domaine. */
function recallableUntil(row: Row): number | null {
  if (row.status !== 'travelling' || row.departedAt === null || row.arrivesAt === null) return null
  return halfway(row.departedAt, row.arrivesAt)
}

/** Ligne de la table présentée à un joueur ; counterpart désigne l'autre partie. */
const toSummary = (row: Row, counterpart: string, sender: boolean): CaravanSummary => ({
  caravanId: row.caravanId,
  counterpart,
  cargo: row.cargo as Amounts,
  status: row.status as CaravanStatus,
  sentAt: row.sentAt,
  arrivesAt: row.arrivesAt,
  recallableUntil: sender ? recallableUntil(row) : null,
  stolen: row.stolen as Amounts | null,
  returned: row.returned as Amounts | null,
})

/** Adaptateur du port CaravansReader, fondé sur les tables de la projection. */
export function createDrizzleCaravansReader(db: Db, projections: ProjectionRunner): CaravansReader {
  return {
    async list(viewerId) {
      await projections.catchUp(caravansProjection)
      // Comme au TD8 : la position est lue avant la table, qui reflète au moins cette position.
      const position = await projections.positionOf(caravansProjection.name)

      const sent = await db
        .select()
        .from(caravans)
        .where(eq(caravans.senderId, viewerId))
        .orderBy(desc(caravans.sentAt))
        .limit(LIST_SIZE)
      const received = await db
        .select()
        .from(caravans)
        .where(
          and(eq(caravans.recipientId, viewerId), inArray(caravans.status, VISIBLE_TO_RECIPIENT)),
        )
        .orderBy(desc(caravans.sentAt))
        .limit(LIST_SIZE)

      return {
        position,
        sent: sent.map((row) => toSummary(row, row.recipientVillage, true)),
        received: received.map((row) => toSummary(row, row.senderName, false)),
      }
    },

    async recipients(viewerId) {
      await projections.catchUp(caravansProjection)
      return db
        .select()
        .from(recipients)
        .where(ne(recipients.playerId, viewerId))
        .orderBy(asc(recipients.villageName))
        .limit(RECIPIENTS_SIZE)
    },

    async villageOf(playerId) {
      await projections.catchUp(caravansProjection)
      const [row] = await db.select().from(recipients).where(eq(recipients.playerId, playerId))
      return row?.villageName ?? null
    },

    async dueSendersFor(recipientId, now) {
      await projections.catchUp(caravansProjection)
      const rows = await db
        .selectDistinct({ senderId: caravans.senderId })
        .from(caravans)
        .where(
          and(
            eq(caravans.recipientId, recipientId),
            eq(caravans.status, 'travelling'),
            lte(caravans.arrivesAt, now),
          ),
        )
      return rows.map((row) => row.senderId)
    },
  }
}
