import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { ForgeRepository } from '../application/forge-repository'
import { forgeStream } from '../contracts'
import { type ForgeEvent, replay } from '../domain/forge'

/** Adaptateur du port ForgeRepository fondé sur le journal d'événements. */
export function createEventStoreForgeRepository(store: EventStore): ForgeRepository {
  return {
    async load(playerId) {
      // DETTE TECHNIQUE DT-016 (docs/qualite/dette-technique.md) : toute l'histoire de la forge
      // du joueur est rejouée à chaque chargement, sans instantané de l'état.
      const stored = await store.read(forgeStream(playerId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as ForgeEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(playerId, expectedVersion, events, messages) {
      // Les événements de la forge et les messages de la saga : une seule transaction.
      await store.append(
        forgeStream(playerId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
