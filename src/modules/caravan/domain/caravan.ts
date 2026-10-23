/**
 * Domaine de la Caravane : les caravanes d'un expéditeur et leur devenir, selon le modèle decider.
 * Toutes les caravanes d'un joueur forment un seul flux : la limite de caravanes en cours y est
 * vérifiée sous la protection de la concurrence optimiste.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import { type Amounts, brigandsAttack, plunder } from './brigands'

export type { Amounts } from './brigands'

/** Charge maximale d'une caravane, toutes ressources confondues (règle 2). */
export const MAX_CARGO = 300

/** Nombre maximal de caravanes en cours d'un même expéditeur (règle 3). */
export const MAX_ACTIVE_CARAVANS = 3

/** Durée de base d'un trajet, et durée ajoutée par tranche de deux unités (règle 5). */
export const BASE_TRAVEL_MS = 60_000
export const MS_PER_TWO_UNITS = 1_000

/**
 * États d'une caravane. Les quatre derniers sont finaux : une caravane refusée n'est jamais
 * partie ; une caravane livrée, attaquée ou rappelée a vu sa cargaison versée à un village.
 */
export type CaravanStatus =
  | 'loading'
  | 'travelling'
  | 'refused'
  | 'delivered'
  | 'attacked'
  | 'recalled'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

export interface Caravan {
  caravanId: string
  recipientId: string
  /** Nom du village du destinataire au moment de l'envoi. */
  recipientVillage: string
  cargo: Amounts
  /** Graine du tirage des brigands, fixée par le serveur à l'envoi. */
  seed: number
  status: CaravanStatus
  sentAt: number
  departedAt: number | null
  arrivesAt: number | null
  /** Ressources qui manquaient à l'expéditeur, si la caravane a été refusée. */
  missing: Amounts | null
  /** Butin des brigands et part rendue à l'expéditeur, si la caravane a été attaquée. */
  stolen: Amounts | null
  returned: Amounts | null
}

export interface CaravanState {
  /** Expéditeur du flux ; vide tant qu'aucune caravane n'a été envoyée. */
  senderId: string
  senderName: string
  caravans: Record<string, Caravan>
}

export const initialState: CaravanState = { senderId: '', senderName: '', caravans: {} }

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type CaravanEvent =
  | {
      type: 'CaravanSent'
      data: {
        caravanId: string
        senderId: string
        senderName: string
        recipientId: string
        recipientVillage: string
        cargo: Amounts
        seed: number
        at: number
      }
    }
  | { type: 'CaravanDeparted'; data: { caravanId: string; at: number; arrivesAt: number } }
  | { type: 'CaravanRefused'; data: { caravanId: string; missing: Amounts; at: number } }
  | { type: 'CaravanArrived'; data: { caravanId: string; at: number } }
  | {
      type: 'CaravanAttacked'
      data: { caravanId: string; stolen: Amounts; returned: Amounts; at: number }
    }
  | { type: 'CaravanRecalled'; data: { caravanId: string; at: number } }

/** Types des événements du module : son langage publié. */
export const CARAVAN_EVENT_TYPES: CaravanEvent['type'][] = [
  'CaravanSent',
  'CaravanDeparted',
  'CaravanRefused',
  'CaravanArrived',
  'CaravanAttacked',
  'CaravanRecalled',
]

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type CaravanCommand =
  // Commandes des joueurs.
  | {
      type: 'SendCaravan'
      caravanId: string
      senderId: string
      senderName: string
      recipientId: string
      /** Nom du village du destinataire ; null si le destinataire n'a pas de village. */
      recipientVillage: string | null
      cargo: Amounts
      seed: number
    }
  | { type: 'RecallCaravan'; caravanId: string }
  // Commandes de la saga, issues des messages de la boîte d'envoi.
  | {
      type: 'RecordWithdrawal'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }
  /** Constate les arrivées échues ; avec caravanId, exige que cette caravane soit arrivée. */
  | { type: 'SettleArrivals'; caravanId?: string }

export type CaravanError =
  | { code: 'SAME_PLAYER' }
  | { code: 'UNKNOWN_RECIPIENT' }
  | { code: 'INVALID_CARGO' }
  | { code: 'CARGO_TOO_HEAVY'; max: number }
  | { code: 'TOO_MANY_CARAVANS'; max: number }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'CARAVAN_NOT_FOUND' }
  | { code: 'NOT_TRAVELLING'; status: CaravanStatus }
  | { code: 'TOO_LATE' }
  | { code: 'NOT_ARRIVED' }

export type Decision = { ok: true; events: CaravanEvent[] } | { ok: false; error: CaravanError }

const fail = (error: CaravanError): Decision => ({ ok: false, error })
const accept = (...events: CaravanEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Règles de calcul
// ---------------------------------------------------------------------------

/** Nombre total d'unités d'une cargaison. */
export const cargoSize = (cargo: Amounts) =>
  Object.values(cargo).reduce<number>((sum, amount) => sum + (amount ?? 0), 0)

/** Durée du trajet d'une cargaison (règle 5). */
export const travelDuration = (cargo: Amounts) =>
  BASE_TRAVEL_MS + Math.floor(cargoSize(cargo) / 2) * MS_PER_TWO_UNITS

/** Moitié d'un trajet : la caravane ne peut plus être rappelée à partir de cet instant (règle 10). */
export const halfway = (departedAt: number, arrivesAt: number) =>
  departedAt + Math.floor((arrivesAt - departedAt) / 2)

/** Instant jusqu'auquel une caravane peut être rappelée ; null si elle n'est pas en route. */
export function recallableUntil(caravan: Caravan): number | null {
  if (caravan.status !== 'travelling') return null
  if (caravan.departedAt === null || caravan.arrivesAt === null) return null
  return halfway(caravan.departedAt, caravan.arrivesAt)
}

/** Une caravane est en cours tant qu'elle se charge ou qu'elle est en route (règle 3). */
export const isActive = (caravan: Caravan) =>
  caravan.status === 'loading' || caravan.status === 'travelling'

/**
 * Identifiant d'un mouvement de ressources. Il désigne l'expéditeur, dont le flux contient la
 * caravane, et l'étape de la saga ; il sert de clé d'idempotence au Village (règle 11).
 */
export const transferIdOf = (senderId: string, caravanId: string, step: string) =>
  `caravan:${senderId}:${caravanId}:${step}`

/** Expéditeur, caravane et étape désignés par un identifiant de mouvement ; null s'il est étranger. */
export function parseTransferId(transferId: string) {
  const parts = transferId.split(':')
  if (parts.length !== 4 || parts[0] !== 'caravan') return null
  return { senderId: parts[1], caravanId: parts[2], step: parts[3] }
}

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

/** Applique à une caravane du flux une modification, si elle existe. */
function update(state: CaravanState, caravanId: string, change: Partial<Caravan>): CaravanState {
  const caravan = state.caravans[caravanId]
  if (!caravan) return state
  return { ...state, caravans: { ...state.caravans, [caravanId]: { ...caravan, ...change } } }
}

export function evolve(state: CaravanState, event: CaravanEvent): CaravanState {
  switch (event.type) {
    case 'CaravanSent': {
      const { caravanId, senderId, senderName, recipientId, recipientVillage, cargo, seed, at } =
        event.data
      const caravan: Caravan = {
        caravanId,
        recipientId,
        recipientVillage,
        cargo,
        seed,
        status: 'loading',
        sentAt: at,
        departedAt: null,
        arrivesAt: null,
        missing: null,
        stolen: null,
        returned: null,
      }
      return { senderId, senderName, caravans: { ...state.caravans, [caravanId]: caravan } }
    }
    case 'CaravanDeparted':
      return update(state, event.data.caravanId, {
        status: 'travelling',
        departedAt: event.data.at,
        arrivesAt: event.data.arrivesAt,
      })
    case 'CaravanRefused':
      return update(state, event.data.caravanId, {
        status: 'refused',
        missing: event.data.missing,
      })
    case 'CaravanArrived':
      return update(state, event.data.caravanId, { status: 'delivered' })
    case 'CaravanAttacked':
      return update(state, event.data.caravanId, {
        status: 'attacked',
        stolen: event.data.stolen,
        returned: event.data.returned,
      })
    case 'CaravanRecalled':
      return update(state, event.data.caravanId, { status: 'recalled' })
  }
}

export const replay = (events: CaravanEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

/**
 * Arrivées échues : chaque caravane en route dont l'échéance est passée arrive, ou est
 * attaquée selon la décision des brigands (règles 6 à 9). L'arrivée est datée de son
 * échéance, et non de l'instant où elle est constatée.
 */
export function settle(state: CaravanState, now: number): CaravanEvent[] {
  const events: CaravanEvent[] = []
  for (const caravan of Object.values(state.caravans)) {
    if (caravan.status !== 'travelling' || caravan.arrivesAt === null) continue
    if (now < caravan.arrivesAt) continue
    const at = caravan.arrivesAt
    if (brigandsAttack(caravan.seed, caravan.cargo)) {
      const { stolen, returned } = plunder(caravan.cargo)
      events.push({
        type: 'CaravanAttacked',
        data: { caravanId: caravan.caravanId, stolen, returned, at },
      })
    } else {
      events.push({ type: 'CaravanArrived', data: { caravanId: caravan.caravanId, at } })
    }
  }
  return events
}

/**
 * Décision d'une commande. Les arrivées échues sont constatées d'abord, sans tâche de fond :
 * une caravane arrivée ne compte plus parmi les caravanes en cours, et ne peut plus être rappelée.
 */
export function decide(state: CaravanState, command: CaravanCommand, now: number): Decision {
  const arrivals = settle(state, now)
  const current = arrivals.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  if (!decision.ok) return decision
  return accept(...arrivals, ...decision.events)
}

function decideCommand(state: CaravanState, command: CaravanCommand, now: number): Decision {
  switch (command.type) {
    case 'SendCaravan':
      return send(state, command, now)

    case 'RecallCaravan': {
      const caravan = state.caravans[command.caravanId]
      if (!caravan) return fail({ code: 'CARAVAN_NOT_FOUND' })
      if (caravan.status !== 'travelling') {
        return fail({ code: 'NOT_TRAVELLING', status: caravan.status })
      }
      // Règle 10 : le rappel n'est possible qu'avant la moitié du trajet.
      const until = recallableUntil(caravan)
      if (until === null || now >= until) return fail({ code: 'TOO_LATE' })
      return accept({ type: 'CaravanRecalled', data: { caravanId: caravan.caravanId, at: now } })
    }

    case 'RecordWithdrawal':
      return recordWithdrawal(state, command, now)

    case 'SettleArrivals': {
      // Les arrivées ont déjà été constatées par decide. Une caravane désignée et encore
      // en route n'est pas arrivée : une erreur, pour que le rappel soit retenté plus tard.
      if (!command.caravanId) return accept()
      const caravan = state.caravans[command.caravanId]
      if (!caravan) return fail({ code: 'CARAVAN_NOT_FOUND' })
      return caravan.status === 'travelling' ? fail({ code: 'NOT_ARRIVED' }) : accept()
    }
  }
}

/** Envoi d'une caravane (règles 1 à 3). */
function send(
  state: CaravanState,
  command: Extract<CaravanCommand, { type: 'SendCaravan' }>,
  now: number,
): Decision {
  if (state.caravans[command.caravanId]) return fail({ code: 'ALREADY_EXISTS' })
  if (command.recipientId === command.senderId) return fail({ code: 'SAME_PLAYER' })
  if (command.recipientVillage === null) return fail({ code: 'UNKNOWN_RECIPIENT' })

  const amounts = Object.values(command.cargo)
  const valid = amounts.length > 0 && amounts.every((a) => Number.isInteger(a) && (a ?? 0) > 0)
  if (!valid) return fail({ code: 'INVALID_CARGO' })
  if (cargoSize(command.cargo) > MAX_CARGO) return fail({ code: 'CARGO_TOO_HEAVY', max: MAX_CARGO })

  const active = Object.values(state.caravans).filter(isActive).length
  if (active >= MAX_ACTIVE_CARAVANS) {
    return fail({ code: 'TOO_MANY_CARAVANS', max: MAX_ACTIVE_CARAVANS })
  }

  return accept({
    type: 'CaravanSent',
    data: {
      caravanId: command.caravanId,
      senderId: command.senderId,
      senderName: command.senderName,
      recipientId: command.recipientId,
      recipientVillage: command.recipientVillage,
      cargo: command.cargo,
      seed: command.seed,
      at: now,
    },
  })
}

/**
 * Réponse du Village au prélèvement de la cargaison (règle 4). Seule la réponse attendue
 * fait progresser la caravane ; une réponse en double ou tardive est ignorée (règle 11).
 */
function recordWithdrawal(
  state: CaravanState,
  result: Extract<CaravanCommand, { type: 'RecordWithdrawal' }>,
  now: number,
): Decision {
  const target = parseTransferId(result.transferId)
  if (target?.step !== 'load') return accept()
  const caravan = state.caravans[target.caravanId]
  if (caravan?.status !== 'loading') return accept()

  if (result.outcome === 'refused') {
    return accept({
      type: 'CaravanRefused',
      data: { caravanId: caravan.caravanId, missing: result.missing ?? {}, at: now },
    })
  }
  return accept({
    type: 'CaravanDeparted',
    data: { caravanId: caravan.caravanId, at: now, arrivesAt: now + travelDuration(caravan.cargo) },
  })
}
