import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { CaravanRepository } from '../application/caravan-repository'
import { caravanStream } from '../contracts'
import { type CaravanEvent, replay } from '../domain/caravan'

/** Adaptateur du port CaravanRepository fondé sur le journal d'événements. */
export function createEventStoreCaravanRepository(store: EventStore): CaravanRepository {
  return {
    async load(senderId) {
      // DETTE TECHNIQUE DT-015 (docs/qualite/dette-technique.md) : tout l'historique des envois
      // du joueur est rejoué à chaque chargement, sans instantané de l'état.
      const stored = await store.read(caravanStream(senderId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as CaravanEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(senderId, expectedVersion, events, messages) {
      // Les événements des caravanes et les messages de la saga : une seule transaction.
      await store.append(
        caravanStream(senderId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
