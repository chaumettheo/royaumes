import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { FORGE_TOPICS } from '../contracts'
import {
  decide,
  evolve,
  type ForgeCommand,
  type ForgeError,
  type ForgeEvent,
  type ForgeState,
} from '../domain/forge'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type ForgeView, recipeBook, toView } from '../domain/view'
import type { ForgeRepository } from './forge-repository'

/** Résultat d'une commande du joueur : la vue de sa forge, ou l'erreur métier. */
export type CommandResult = { ok: true; view: ForgeView } | { ok: false; error: ForgeError }

export interface ForgeServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle fabrication ; un UUID aléatoire par défaut. */
  newId?: () => string
}

/** Traduit une demande de la saga en message de la boîte d'envoi adressé au Village. */
function toMessage(request: SagaRequest): NewMessage {
  return {
    topic: request.kind === 'withdraw' ? REALM_TOPICS.withdraw : REALM_TOPICS.deposit,
    payload: {
      transferId: request.transferId,
      playerId: request.playerId,
      resources: request.resources,
      // Seul un prélèvement attend une réponse : elle lancera, ou refusera, la fabrication.
      ...(request.kind === 'withdraw' ? { replyTo: FORGE_TOPICS.transferResult } : {}),
    },
  }
}

/**
 * Messages déclenchés par une suite d'événements. Chaque demande est calculée sur l'état qui
 * précède son événement, puis l'événement est appliqué.
 */
function messagesFor(state: ForgeState, events: ForgeEvent[]): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    for (const request of requestsFor(current, event)) messages.push(toMessage(request))
    current = evolve(current, event)
  }
  return messages
}

/**
 * Service applicatif de la Forge : orchestrateur de la saga d'une fabrication.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createForgeService(
  repo: ForgeRepository,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: ForgeServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur la forge d'un joueur. En cas de conflit de version,
   * l'ensemble est rejoué sur l'état à jour. Une décision sans événement n'écrit rien.
   */
  function process(playerId: string, command: ForgeCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(playerId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok || decision.events.length === 0) return decision
      await repo.save(playerId, version, decision.events, messagesFor(state, decision.events))
      return decision
    })
  }

  /** Vue de la forge d'un joueur, à l'instant présent. */
  async function view(playerId: string) {
    const { state } = await repo.load(playerId)
    return toView(state, clock())
  }

  /**
   * Commande du joueur : la décision est enregistrée, puis la boîte d'envoi distribuée. Dans le
   * cas ordinaire, la fabrication est déjà au feu, ou refusée, lorsque la vue est renvoyée.
   */
  async function execute(playerId: string, command: ForgeCommand): Promise<CommandResult> {
    const decision = await process(playerId, command)
    if (!decision.ok) return decision
    await dispatch()
    return { ok: true, view: await view(playerId) }
  }

  /** Lance une fabrication. Le joueur est toujours celui de la session. */
  const craft = (playerId: string, recipe: string) =>
    execute(playerId, { type: 'RequestForging', jobId: newId(), playerId, recipe })

  /** Annule la fabrication en cours. */
  const cancel = (playerId: string) => execute(playerId, { type: 'CancelForging' })

  /** Fond un objet de l'inventaire. */
  const smelt = (playerId: string, itemId: string) =>
    execute(playerId, { type: 'SmeltItem', itemId })

  /**
   * Forge du joueur et livre des recettes. Un achèvement échu est enregistré à la lecture,
   * sans tâche de fond ; la vue le présentait déjà comme achevé.
   */
  async function get(playerId: string) {
    await process(playerId, { type: 'Settle' })
    return { view: await view(playerId), recipes: recipeBook() }
  }

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie :
   * elle est levée, et le message sera retenté.
   */
  async function step(playerId: string, command: ForgeCommand) {
    const decision = await process(playerId, command)
    if (!decision.ok) throw new Error(`Forge de ${playerId} : ${decision.error.code}`)
  }

  return { craft, cancel, smelt, get, step }
}

/** Type du service, déduit de sa fabrique. */
export type ForgeService = ReturnType<typeof createForgeService>
