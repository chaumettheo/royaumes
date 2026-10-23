/**
 * Entrée publique « serveur » du module Caravane.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createCaravanApi } from './api'
import { createCaravanService } from './application/caravan-service'
import { CARAVAN_CHANNEL } from './contracts'
import { CARAVAN_EVENT_TYPES } from './domain/caravan'
import { createDrizzleCaravansReader } from './infrastructure/drizzle-caravans-reader'
import { createEventStoreCaravanRepository } from './infrastructure/event-store-caravan-repository'
import { createCaravanHandlers } from './messages'
import { createCaravanPersonalData } from './personal-data'

export interface CaravanModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données, dans laquelle le module tient ses tables de lecture. */
  db: Db
  /** Moteur des projections de la plateforme. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi, déclenchée après les commandes et les consultations. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/**
 * Fabrique du module : assemble les adaptateurs, le service, l'API, la règle du canal
 * et les gestionnaires de messages.
 */
export function createCaravanModule({
  store,
  db,
  projections,
  dispatch,
  clock,
}: CaravanModuleDeps) {
  const repo = createEventStoreCaravanRepository(store)
  const reader = createDrizzleCaravansReader(db, projections)
  const service = createCaravanService(repo, reader, { dispatch, clock })

  // Canal global et discret, sur le modèle de celui du Marché : il annonce l'évolution des
  // caravanes, sans jamais en transmettre les données ; chaque joueur relit sa propre liste.
  const channelPolicy: ChannelPolicy = {
    prefix: CARAVAN_CHANNEL,
    canSubscribe: (channel) => channel === CARAVAN_CHANNEL,
    redact: true,
    global: { types: CARAVAN_EVENT_TYPES },
  }

  return {
    api: createCaravanApi(service),
    channelPolicy,
    handlers: createCaravanHandlers(service),
    personalData: createCaravanPersonalData(db, projections),
  }
}

export type { CaravanApi } from './api'
