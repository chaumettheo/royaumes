import type { NewMessage } from '@/platform/outbox/outbox'
import type { ForgeEvent, ForgeState } from '../domain/forge'

/** Port de persistance de la forge d'un joueur, défini par la couche application. */
export interface ForgeRepository {
  /** Charge l'état de la forge d'un joueur, reconstruit à partir de son flux, et sa version. */
  load(playerId: string): Promise<{ state: ForgeState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction. Une ConcurrencyError est levée en cas de conflit de version.
   */
  save(
    playerId: string,
    expectedVersion: number,
    events: ForgeEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
