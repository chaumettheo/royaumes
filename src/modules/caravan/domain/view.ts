/** Vue d'une caravane, telle que la voit son expéditeur. */
import { type Amounts, type CaravanState, type CaravanStatus, recallableUntil } from './caravan'

export interface CaravanView {
  caravanId: string
  recipientVillage: string
  cargo: Amounts
  status: CaravanStatus
  sentAt: number
  arrivesAt: number | null
  /** Instant jusqu'auquel la caravane peut être rappelée ; null si elle ne peut plus l'être. */
  recallableUntil: number | null
  missing: Amounts | null
  stolen: Amounts | null
  returned: Amounts | null
}

/**
 * Vue d'une caravane du flux. La graine du tirage n'y figure jamais : la connaître permettrait
 * de prévoir l'issue du trajet.
 */
export function toView(state: CaravanState, caravanId: string): CaravanView | null {
  const caravan = state.caravans[caravanId]
  if (!caravan) return null
  return {
    caravanId: caravan.caravanId,
    recipientVillage: caravan.recipientVillage,
    cargo: caravan.cargo,
    status: caravan.status,
    sentAt: caravan.sentAt,
    arrivesAt: caravan.arrivesAt,
    recallableUntil: recallableUntil(caravan),
    missing: caravan.missing,
    stolen: caravan.stolen,
    returned: caravan.returned,
  }
}
