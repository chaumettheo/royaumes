import type { EventStore } from '@/platform/event-store/event-store'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { forgeStream } from './contracts'
import { type ForgeEvent, replay } from './domain/forge'

/**
 * Données personnelles de la Forge : l'inventaire et l'historique des fabrications du joueur,
 * dans son propre flux. Aucun nom n'est recopié dans les événements : il n'y a rien à réécrire,
 * et le module ne tient aucune table. L'identifiant du joueur, pseudonyme, reste dans le nom
 * du flux, comme dans les autres modules (ADR 0008).
 */
export function createForgePersonalData(store: EventStore): PersonalDataContributor {
  return {
    name: 'forge',

    async export(playerId) {
      const stored = await store.read(forgeStream(playerId))
      const state = replay(stored.map((e) => ({ type: e.type, data: e.data }) as ForgeEvent))
      return {
        inventory: Object.values(state.inventory),
        history: stored.map((e) => ({ type: e.type, ...e.data })),
      }
    },
  }
}
