/**
 * Étapes de la saga d'une caravane : pour chaque événement, les demandes à adresser au Village,
 * ou à la caravane elle-même. Le domaine décide de ces demandes ; le service les traduit
 * en messages de la boîte d'envoi.
 */
import { type Amounts, type CaravanEvent, type CaravanState, transferIdOf } from './caravan'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse fait progresser la caravane. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas être refusé, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }
  /** Rappel adressé à la caravane à son échéance, pour constater son arrivée. */
  | { kind: 'arrive'; senderId: string; caravanId: string; at: number }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui suit l'application
 * de l'événement : il contient l'expéditeur et la caravane concernée.
 */
export function requestsFor(state: CaravanState, event: CaravanEvent): SagaRequest[] {
  const caravan = state.caravans[event.data.caravanId]
  if (!caravan) return []
  const id = (step: string) => transferIdOf(state.senderId, caravan.caravanId, step)

  switch (event.type) {
    // 1. Envoi : prélèvement de la cargaison dans le village de l'expéditeur (étape compensable).
    case 'CaravanSent':
      return [
        {
          kind: 'withdraw',
          transferId: id('load'),
          playerId: state.senderId,
          resources: caravan.cargo,
        },
      ]

    // 2. Départ : la caravane se rappellera à son échéance, même si personne ne la consulte.
    case 'CaravanDeparted':
      return [
        {
          kind: 'arrive',
          senderId: state.senderId,
          caravanId: caravan.caravanId,
          at: event.data.arrivesAt,
        },
      ]

    // 3. Arrivée : livraison de toute la cargaison au destinataire.
    // DETTE TECHNIQUE DT-013 (docs/qualite/dette-technique.md) : si le destinataire a supprimé
    // son compte pendant le trajet, le Village refuse le versement, et la cargaison est perdue.
    case 'CaravanArrived':
      return [
        {
          kind: 'deposit',
          transferId: id('deliver'),
          playerId: caravan.recipientId,
          resources: caravan.cargo,
        },
      ]

    // Compensation après une attaque : la part épargnée par les brigands revient à l'expéditeur.
    case 'CaravanAttacked':
      return [
        {
          kind: 'deposit',
          transferId: id('return'),
          playerId: state.senderId,
          resources: event.data.returned,
        },
      ]

    // Compensation après un rappel : toute la cargaison revient à l'expéditeur.
    case 'CaravanRecalled':
      return [
        {
          kind: 'deposit',
          transferId: id('refund'),
          playerId: state.senderId,
          resources: caravan.cargo,
        },
      ]

    // Refus du prélèvement : rien n'a été prélevé, rien n'est à compenser.
    case 'CaravanRefused':
      return []
  }
}
