import type { CaravanList, Recipient } from '../contracts'

/** Port de lecture du modèle de lecture de la Caravane, défini par la couche application. */
export interface CaravansReader {
  /** Caravanes envoyées et reçues par un joueur, avec la position jusqu'à laquelle elles sont à jour. */
  list(viewerId: string): Promise<CaravanList>

  /** Destinataires possibles pour un joueur : les autres joueurs qui ont fondé un village. */
  recipients(viewerId: string): Promise<Recipient[]>

  /** Nom du village d'un joueur ; null s'il n'en a fondé aucun. */
  villageOf(playerId: string): Promise<string | null>

  /** Expéditeurs des caravanes en route vers un joueur, dont l'échéance est passée à l'instant now. */
  dueSendersFor(recipientId: string, now: number): Promise<string[]>
}
