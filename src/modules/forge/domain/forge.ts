/**
 * Domaine de la Forge : la fabrication en cours et l'inventaire d'un joueur, selon le modèle
 * decider. Toute la forge d'un joueur forme un seul flux : la règle d'une fabrication à la fois
 * et la limite d'exemplaires y sont vérifiées sous la protection de la concurrence optimiste.
 * Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */
import {
  type Amounts,
  isRecipe,
  MAX_PER_RECIPE,
  RECIPES,
  type RecipeId,
  smeltRefund,
} from './recipes'

export type { Amounts, RecipeId } from './recipes'

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------

/** Fabrication en cours : en attente de ses ressources, puis au feu. */
export interface Forging {
  jobId: string
  recipe: RecipeId
  status: 'loading' | 'forging'
  requestedAt: number
  startedAt: number | null
  readyAt: number | null
}

/** Objet de l'inventaire. */
export interface Item {
  itemId: string
  recipe: RecipeId
  forgedAt: number
}

export interface ForgeState {
  /** Propriétaire du flux ; vide tant qu'aucune fabrication n'a été demandée. */
  playerId: string
  forging: Forging | null
  inventory: Record<string, Item>
  /** Dernière fabrication refusée, et les ressources qui manquaient au joueur. */
  refusal: { jobId: string; missing: Amounts } | null
}

export const initialState: ForgeState = {
  playerId: '',
  forging: null,
  inventory: {},
  refusal: null,
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type ForgeEvent =
  | {
      type: 'ForgingRequested'
      data: { jobId: string; playerId: string; recipe: RecipeId; at: number }
    }
  | { type: 'ForgingStarted'; data: { jobId: string; at: number; readyAt: number } }
  | { type: 'ForgingRefused'; data: { jobId: string; missing: Amounts; at: number } }
  | { type: 'ForgingCancelled'; data: { jobId: string; at: number } }
  | { type: 'ItemForged'; data: { itemId: string; recipe: RecipeId; at: number } }
  | { type: 'ItemSmelted'; data: { itemId: string; refund: Amounts; at: number } }

/** Types des événements du module : son langage publié. */
export const FORGE_EVENT_TYPES: ForgeEvent['type'][] = [
  'ForgingRequested',
  'ForgingStarted',
  'ForgingRefused',
  'ForgingCancelled',
  'ItemForged',
  'ItemSmelted',
]

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type ForgeCommand =
  // Commandes du joueur.
  | { type: 'RequestForging'; jobId: string; playerId: string; recipe: string }
  | { type: 'CancelForging' }
  | { type: 'SmeltItem'; itemId: string }
  // Commande de la saga, issue de la réponse du Village.
  | {
      type: 'RecordWithdrawal'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }
  /** Lecture : constate seulement un achèvement échu. */
  | { type: 'Settle' }

export type ForgeError =
  | { code: 'UNKNOWN_RECIPE' }
  | { code: 'FORGE_BUSY' }
  | { code: 'TOO_MANY_ITEMS'; max: number }
  | { code: 'NOT_FORGING' }
  | { code: 'ITEM_NOT_FOUND' }

export type Decision = { ok: true; events: ForgeEvent[] } | { ok: false; error: ForgeError }

const fail = (error: ForgeError): Decision => ({ ok: false, error })
const accept = (...events: ForgeEvent[]): Decision => ({ ok: true, events })

// ---------------------------------------------------------------------------
// Identifiants des mouvements de ressources
// ---------------------------------------------------------------------------

/**
 * Identifiant d'un mouvement de ressources. Il désigne le joueur, dont le flux contient la
 * fabrication ou l'objet, et l'étape ; il sert de clé d'idempotence au Village (règle 9).
 */
export const transferIdOf = (playerId: string, id: string, step: string) =>
  `forge:${playerId}:${id}:${step}`

/** Joueur, fabrication et étape désignés par un identifiant de mouvement ; null s'il est étranger. */
export function parseTransferId(transferId: string) {
  const parts = transferId.split(':')
  if (parts.length !== 4 || parts[0] !== 'forge') return null
  return { playerId: parts[1], id: parts[2], step: parts[3] }
}

// ---------------------------------------------------------------------------
// evolve
// ---------------------------------------------------------------------------

export function evolve(state: ForgeState, event: ForgeEvent): ForgeState {
  switch (event.type) {
    case 'ForgingRequested':
      return {
        ...state,
        playerId: event.data.playerId,
        refusal: null,
        forging: {
          jobId: event.data.jobId,
          recipe: event.data.recipe,
          status: 'loading',
          requestedAt: event.data.at,
          startedAt: null,
          readyAt: null,
        },
      }
    case 'ForgingStarted':
      if (state.forging?.jobId !== event.data.jobId) return state
      return {
        ...state,
        forging: {
          ...state.forging,
          status: 'forging',
          startedAt: event.data.at,
          readyAt: event.data.readyAt,
        },
      }
    case 'ForgingRefused':
      return {
        ...state,
        forging: null,
        refusal: { jobId: event.data.jobId, missing: event.data.missing },
      }
    case 'ForgingCancelled':
      return { ...state, forging: null }
    case 'ItemForged':
      return {
        ...state,
        forging: null,
        inventory: {
          ...state.inventory,
          [event.data.itemId]: {
            itemId: event.data.itemId,
            recipe: event.data.recipe,
            forgedAt: event.data.at,
          },
        },
      }
    case 'ItemSmelted': {
      const { [event.data.itemId]: _smelted, ...inventory } = state.inventory
      return { ...state, inventory }
    }
  }
}

export const replay = (events: ForgeEvent[]) => events.reduce(evolve, initialState)

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

/** Nombre d'exemplaires d'une recette dans l'inventaire. */
const countOf = (state: ForgeState, recipe: RecipeId) =>
  Object.values(state.inventory).filter((item) => item.recipe === recipe).length

/**
 * Achèvement échu : une fabrication au feu dont l'échéance est passée produit son objet, daté
 * de l'échéance (règle 6). L'objet porte l'identifiant de la fabrication.
 */
export function settle(state: ForgeState, now: number): ForgeEvent[] {
  const job = state.forging
  if (job?.status !== 'forging' || job.readyAt === null || now < job.readyAt) return []
  return [{ type: 'ItemForged', data: { itemId: job.jobId, recipe: job.recipe, at: job.readyAt } }]
}

/**
 * Décision d'une commande. L'achèvement échu est constaté d'abord, sans tâche de fond : une
 * fabrication achevée libère la forge, et ne peut plus être annulée.
 */
export function decide(state: ForgeState, command: ForgeCommand, now: number): Decision {
  const completions = settle(state, now)
  const current = completions.reduce(evolve, state)
  const decision = decideCommand(current, command, now)
  if (!decision.ok) return decision
  return accept(...completions, ...decision.events)
}

function decideCommand(state: ForgeState, command: ForgeCommand, now: number): Decision {
  switch (command.type) {
    case 'RequestForging': {
      if (!isRecipe(command.recipe)) return fail({ code: 'UNKNOWN_RECIPE' })
      if (state.forging) return fail({ code: 'FORGE_BUSY' })
      if (countOf(state, command.recipe) >= MAX_PER_RECIPE) {
        return fail({ code: 'TOO_MANY_ITEMS', max: MAX_PER_RECIPE })
      }
      return accept({
        type: 'ForgingRequested',
        data: {
          jobId: command.jobId,
          playerId: command.playerId,
          recipe: command.recipe,
          at: now,
        },
      })
    }

    case 'CancelForging':
      // Règle 7 : seule une fabrication au feu peut être annulée ; ses ressources sont rendues.
      if (state.forging?.status !== 'forging') return fail({ code: 'NOT_FORGING' })
      return accept({ type: 'ForgingCancelled', data: { jobId: state.forging.jobId, at: now } })

    case 'SmeltItem': {
      const item = state.inventory[command.itemId]
      if (!item) return fail({ code: 'ITEM_NOT_FOUND' })
      return accept({
        type: 'ItemSmelted',
        data: { itemId: item.itemId, refund: smeltRefund(item.recipe), at: now },
      })
    }

    case 'RecordWithdrawal':
      return recordWithdrawal(state, command, now)

    case 'Settle':
      return accept()
  }
}

/**
 * Réponse du Village au prélèvement des ressources (règle 4). Seule la réponse attendue
 * fait progresser la fabrication ; une réponse en double ou tardive est ignorée (règle 9).
 */
function recordWithdrawal(
  state: ForgeState,
  result: Extract<ForgeCommand, { type: 'RecordWithdrawal' }>,
  now: number,
): Decision {
  const target = parseTransferId(result.transferId)
  if (target?.step !== 'load') return accept()
  const job = state.forging
  if (job?.jobId !== target.id || job.status !== 'loading') return accept()

  if (result.outcome === 'refused') {
    return accept({
      type: 'ForgingRefused',
      data: { jobId: job.jobId, missing: result.missing ?? {}, at: now },
    })
  }
  return accept({
    type: 'ForgingStarted',
    data: { jobId: job.jobId, at: now, readyAt: now + RECIPES[job.recipe].durationMs },
  })
}
