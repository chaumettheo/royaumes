/**
 * Entrée publique « partagée » du module Caravane : utilisable par le serveur
 * comme par l'interface.
 */
import { z } from 'zod'
import { ResourceAmounts } from '@/modules/realm/contracts'
import type { Amounts, CaravanStatus } from './domain/caravan'

export type { Amounts, CaravanError, CaravanStatus } from './domain/caravan'
export { MAX_ACTIVE_CARAVANS, MAX_CARGO } from './domain/caravan'
export type { CaravanView } from './domain/view'

/** Corps attendu pour envoyer une caravane : le destinataire et la cargaison. */
export const SendCaravanInput = z.object({
  recipientId: z.string().min(1).max(100),
  cargo: ResourceAmounts,
})

/** Caravane telle que la présente la liste d'un joueur, qu'il l'ait envoyée ou reçue. */
export interface CaravanSummary {
  caravanId: string
  /** Village du destinataire pour une caravane envoyée ; nom de l'expéditeur pour une reçue. */
  counterpart: string
  cargo: Amounts
  status: CaravanStatus
  sentAt: number
  arrivesAt: number | null
  /** Instant jusqu'auquel l'expéditeur peut rappeler la caravane ; null sinon. */
  recallableUntil: number | null
  stolen: Amounts | null
  returned: Amounts | null
}

/** Caravanes d'un joueur, avec la position du journal jusqu'à laquelle la liste est à jour. */
export interface CaravanList {
  position: number
  sent: CaravanSummary[]
  received: CaravanSummary[]
}

/** Destinataire possible : un joueur qui a fondé un village. */
export interface Recipient {
  playerId: string
  villageName: string
}

/** Préfixe commun aux noms des flux de la Caravane : un flux par expéditeur. */
export const CARAVAN_STREAM_PREFIX = 'caravan-'

/** Nom du flux qui contient les caravanes d'un expéditeur. */
export const caravanStream = (senderId: string) => `${CARAVAN_STREAM_PREFIX}${senderId}`

/** Nom du canal temps réel global de la Caravane, qui annonce l'évolution des caravanes. */
export const CARAVAN_CHANNEL = 'caravans'

/** Sujets des messages adressés à la Caravane. */
export const CARAVAN_TOPICS = {
  /** Réponse du Village au prélèvement d'une cargaison. */
  transferResult: 'caravan.transfer-result',
  /** Rappel différé d'une caravane, à son échéance. */
  arrive: 'caravan.arrive',
} as const
