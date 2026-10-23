/**
 * Entrée publique « serveur » du module Forge.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { EventStore } from '@/platform/event-store/event-store'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createForgeApi } from './api'
import { createForgeService } from './application/forge-service'
import { FORGE_STREAM_PREFIX, forgeStream } from './contracts'
import { createEventStoreForgeRepository } from './infrastructure/event-store-forge-repository'
import { createForgeHandlers } from './messages'
import { createForgePersonalData } from './personal-data'

export interface ForgeModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Distribution de la boîte d'envoi, déclenchée après les commandes. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble le dépôt, le service, l'API, la règle du canal
 * et le gestionnaire de messages.
 */
export function createForgeModule({ store, dispatch, clock }: ForgeModuleDeps) {
  const repo = createEventStoreForgeRepository(store)
  const service = createForgeService(repo, { dispatch, clock })

  // Canal personnel, comme celui du Village : la forge d'un joueur n'est écoutée que par
  // lui-même, et ses événements lui sont transmis en entier.
  const channelPolicy: ChannelPolicy = {
    prefix: FORGE_STREAM_PREFIX,
    canSubscribe: (channel, userId) => channel === forgeStream(userId),
  }

  return {
    api: createForgeApi(service),
    channelPolicy,
    handlers: createForgeHandlers(service),
    personalData: createForgePersonalData(store),
  }
}

export type { ForgeApi } from './api'
