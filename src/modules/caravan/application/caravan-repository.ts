import type { NewMessage } from '@/platform/outbox/outbox'
import type { CaravanEvent, CaravanState } from '../domain/caravan'

/** Port de persistance des caravanes d'un expéditeur, défini par la couche application. */
export interface CaravanRepository {
  /** Charge l'état des caravanes d'un expéditeur, reconstruit à partir de son flux, et sa version. */
  load(senderId: string): Promise<{ state: CaravanState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    senderId: string,
    expectedVersion: number,
    events: CaravanEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
