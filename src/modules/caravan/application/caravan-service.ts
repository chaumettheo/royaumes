import { REALM_TOPICS } from '@/modules/realm/contracts'
import { withOptimisticRetry } from '@/platform/event-store/retry'
import type { NewMessage } from '@/platform/outbox/outbox'
import { CARAVAN_TOPICS } from '../contracts'
import {
  type Amounts,
  type CaravanCommand,
  type CaravanError,
  type CaravanEvent,
  type CaravanState,
  decide,
  evolve,
} from '../domain/caravan'
import { requestsFor, type SagaRequest } from '../domain/saga'
import { type CaravanView, toView } from '../domain/view'
import type { CaravanRepository } from './caravan-repository'
import type { CaravansReader } from './caravans-reader'

/** Résultat d'une commande d'un joueur : la vue de la caravane, ou l'erreur métier. */
export type CommandResult = { ok: true; view: CaravanView } | { ok: false; error: CaravanError }

/** Joueur à l'origine d'une commande. */
export interface Player {
  id: string
  name: string
}

export interface CaravanServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque commande et chaque consultation. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
  /** Identifiant d'une nouvelle caravane ; un UUID aléatoire par défaut. */
  newId?: () => string
  /** Graine du tirage des brigands ; tirée par le serveur, jamais fournie par le joueur. */
  newSeed?: () => number
}

/** Traduit une demande de la saga en message de la boîte d'envoi. */
function toMessage(request: SagaRequest, now: number): NewMessage {
  switch (request.kind) {
    case 'withdraw':
      return {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
          // Adresse de retour : la réponse du Village fera partir la caravane, ou la refusera.
          replyTo: CARAVAN_TOPICS.transferResult,
        },
      }
    case 'deposit':
      return {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: request.transferId,
          playerId: request.playerId,
          resources: request.resources,
        },
      }
    case 'arrive':
      return {
        topic: CARAVAN_TOPICS.arrive,
        payload: { senderId: request.senderId, caravanId: request.caravanId },
        delayMs: Math.max(0, request.at - now),
      }
  }
}

/** Messages déclenchés par une suite d'événements, appliqués un à un à l'état du flux. */
function messagesFor(state: CaravanState, events: CaravanEvent[], now: number): NewMessage[] {
  const messages: NewMessage[] = []
  let current = state
  for (const event of events) {
    current = evolve(current, event)
    for (const request of requestsFor(current, event)) messages.push(toMessage(request, now))
  }
  return messages
}

/**
 * Service applicatif de la Caravane : orchestrateur de la saga d'une caravane.
 * Chaque décision est enregistrée avec les messages qu'elle déclenche, dans une même transaction.
 */
export function createCaravanService(
  repo: CaravanRepository,
  reader: CaravansReader,
  {
    dispatch,
    clock = () => Date.now(),
    newId = () => crypto.randomUUID(),
    newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0],
  }: CaravanServiceOptions,
) {
  /**
   * Décide et enregistre une commande sur le flux d'un expéditeur, avec les messages de la
   * saga. En cas de conflit de version, l'ensemble est rejoué sur l'état à jour. Une décision
   * sans événement n'écrit rien.
   */
  function process(senderId: string, command: CaravanCommand) {
    return withOptimisticRetry(async () => {
      const { state, version } = await repo.load(senderId)
      const now = clock()
      const decision = decide(state, command, now)
      if (!decision.ok || decision.events.length === 0) return decision
      await repo.save(senderId, version, decision.events, messagesFor(state, decision.events, now))
      return decision
    })
  }

  /**
   * Commande d'un joueur sur ses propres caravanes : la décision est enregistrée, puis la boîte
   * d'envoi distribuée. Dans le cas ordinaire, la caravane est déjà partie, ou refusée, lorsque
   * sa vue est renvoyée.
   */
  async function execute(
    senderId: string,
    caravanId: string,
    command: CaravanCommand,
  ): Promise<CommandResult> {
    const decision = await process(senderId, command)
    if (!decision.ok) return decision
    await dispatch()
    const { state } = await repo.load(senderId)
    const view = toView(state, caravanId)
    return view ? { ok: true, view } : { ok: false, error: { code: 'CARAVAN_NOT_FOUND' } }
  }

  /** Envoie une caravane au nom d'un joueur. */
  async function send(player: Player, recipientId: string, cargo: Amounts) {
    const caravanId = newId()
    // Le destinataire doit avoir fondé un village : le Village refuserait sinon le versement.
    const recipientVillage = await reader.villageOf(recipientId)
    const result = await execute(player.id, caravanId, {
      type: 'SendCaravan',
      caravanId,
      senderId: player.id,
      senderName: player.name,
      recipientId,
      recipientVillage,
      cargo,
      seed: newSeed(),
    })
    return { caravanId, result }
  }

  /**
   * Rappelle une caravane. Le flux est toujours celui du joueur : il ne peut rappeler que
   * ses propres caravanes, celle d'un autre joueur y est introuvable.
   */
  const recall = (playerId: string, caravanId: string) =>
    execute(playerId, caravanId, { type: 'RecallCaravan', caravanId })

  /**
   * Caravanes envoyées et reçues par un joueur. Les arrivées échues sont d'abord constatées,
   * sans tâche de fond : celles du joueur, puis celles des caravanes qui lui sont destinées,
   * dans le flux de leur expéditeur. La boîte d'envoi est ensuite distribuée, pour que les
   * versements soient effectués avant la lecture.
   */
  async function list(viewerId: string) {
    const now = clock()
    const senders = new Set([viewerId, ...(await reader.dueSendersFor(viewerId, now))])
    for (const senderId of senders) await process(senderId, { type: 'SettleArrivals' })
    await dispatch()
    return reader.list(viewerId)
  }

  /** Destinataires possibles pour un joueur. */
  const recipients = (viewerId: string) => reader.recipients(viewerId)

  /**
   * Étape de la saga, déclenchée par un message. Une erreur métier y est une anomalie,
   * ou une échéance pas encore atteinte : elle est levée, et le message sera retenté.
   */
  async function step(senderId: string, command: CaravanCommand) {
    const decision = await process(senderId, command)
    if (!decision.ok) throw new Error(`Caravanes de ${senderId} : ${decision.error.code}`)
  }

  return { send, recall, list, recipients, step }
}

/** Type du service, déduit de sa fabrique. */
export type CaravanService = ReturnType<typeof createCaravanService>
