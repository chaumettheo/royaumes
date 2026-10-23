/**
 * Étapes de la saga de la Forge : pour chaque événement, les mouvements de ressources à demander
 * au Village. Le domaine décide de ces demandes ; le service les traduit en messages de la boîte
 * d'envoi.
 */
import { type Amounts, type ForgeEvent, type ForgeState, transferIdOf } from './forge'
import { RECIPES, type RecipeId } from './recipes'

/** Demande produite par une étape de la saga. */
export type SagaRequest =
  /** Prélever des ressources : le Village répond, et la réponse lance ou refuse la fabrication. */
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  /** Verser des ressources : le versement ne peut pas être refusé, aucune réponse n'est attendue. */
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Demandes déclenchées par un événement. L'état reçu est celui qui précède l'application de
 * l'événement : il contient encore la fabrication annulée.
 */
export function requestsFor(state: ForgeState, event: ForgeEvent): SagaRequest[] {
  const player = event.type === 'ForgingRequested' ? event.data.playerId : state.playerId
  const cost = (recipe: RecipeId) => RECIPES[recipe].cost

  switch (event.type) {
    // 1. Demande : prélèvement des ressources de la recette (étape compensable).
    case 'ForgingRequested':
      return [
        {
          kind: 'withdraw',
          transferId: transferIdOf(player, event.data.jobId, 'load'),
          playerId: player,
          resources: cost(event.data.recipe),
        },
      ]

    // Compensation : l'annulation rend toutes les ressources prélevées.
    case 'ForgingCancelled': {
      const job = state.forging
      if (job?.jobId !== event.data.jobId) return []
      return [
        {
          kind: 'deposit',
          transferId: transferIdOf(player, job.jobId, 'refund'),
          playerId: player,
          resources: cost(job.recipe),
        },
      ]
    }

    // Fonte : la moitié des ressources de la recette est rendue, s'il en reste.
    case 'ItemSmelted':
      if (Object.keys(event.data.refund).length === 0) return []
      return [
        {
          kind: 'deposit',
          transferId: transferIdOf(player, event.data.itemId, 'smelt'),
          playerId: player,
          resources: event.data.refund,
        },
      ]

    // Départ, refus et achèvement ne déplacent aucune ressource.
    case 'ForgingStarted':
    case 'ForgingRefused':
    case 'ItemForged':
      return []
  }
}
