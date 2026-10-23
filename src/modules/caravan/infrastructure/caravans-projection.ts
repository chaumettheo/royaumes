import { eq } from 'drizzle-orm'
import { VILLAGE_CHANNEL_PREFIX } from '@/modules/realm/contracts'
import type { StoredEvent } from '@/platform/event-store/event-store'
import { ERASED_VILLAGE } from '@/platform/privacy/privacy'
import type { Projection } from '@/platform/projection/projection'
import { CARAVAN_STREAM_PREFIX } from '../contracts'
import { CARAVAN_EVENT_TYPES, type CaravanEvent } from '../domain/caravan'
import { caravans, recipients } from './schema'

/** Données de l'événement VillageFounded, lues dans le langage publié du Village. */
interface VillageFoundedData {
  name: string
}

/**
 * Projection de la Caravane : les caravanes envoyées, construites à partir des événements du
 * module, et les destinataires possibles, construits à partir des fondations de village.
 */
export const caravansProjection: Projection = {
  name: 'caravan-caravans',
  version: 1,
  eventTypes: [...CARAVAN_EVENT_TYPES, 'VillageFounded'],

  async apply(stored: StoredEvent, tx) {
    // Fondation d'un village : son propriétaire devient un destinataire possible. Un village
    // effacé (TD10) n'en est plus un, y compris lors d'une reconstruction de la projection.
    if (stored.type === 'VillageFounded') {
      if (!stored.stream.startsWith(VILLAGE_CHANNEL_PREFIX)) return
      const { name } = stored.data as unknown as VillageFoundedData
      if (name === ERASED_VILLAGE) return
      const playerId = stored.stream.slice(VILLAGE_CHANNEL_PREFIX.length)
      await tx
        .insert(recipients)
        .values({ playerId, villageName: name })
        .onConflictDoUpdate({ target: recipients.playerId, set: { villageName: name } })
      return
    }

    if (!stored.stream.startsWith(CARAVAN_STREAM_PREFIX)) return
    const event = { type: stored.type, data: stored.data } as CaravanEvent
    const { caravanId } = event.data
    /** Modifie la ligne de la caravane. */
    const set = (values: Partial<typeof caravans.$inferInsert>) =>
      tx.update(caravans).set(values).where(eq(caravans.caravanId, caravanId))

    switch (event.type) {
      case 'CaravanSent':
        await tx.insert(caravans).values({
          caravanId,
          senderId: event.data.senderId,
          senderName: event.data.senderName,
          recipientId: event.data.recipientId,
          recipientVillage: event.data.recipientVillage,
          cargo: event.data.cargo,
          status: 'loading',
          sentAt: event.data.at,
        })
        return
      case 'CaravanDeparted':
        await set({
          status: 'travelling',
          departedAt: event.data.at,
          arrivesAt: event.data.arrivesAt,
        })
        return
      case 'CaravanRefused':
        await set({ status: 'refused' })
        return
      case 'CaravanArrived':
        await set({ status: 'delivered' })
        return
      case 'CaravanAttacked':
        await set({ status: 'attacked', stolen: event.data.stolen, returned: event.data.returned })
        return
      case 'CaravanRecalled':
        await set({ status: 'recalled' })
        return
    }
  },

  async reset(tx) {
    await tx.delete(caravans)
    await tx.delete(recipients)
  },
}
