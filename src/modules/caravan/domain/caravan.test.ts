import { describe, expect, it } from 'vitest'
import {
  BASE_TRAVEL_MS,
  type CaravanCommand,
  type CaravanState,
  decide,
  evolve,
  initialState,
  MAX_ACTIVE_CARAVANS,
  parseTransferId,
  transferIdOf,
  travelDuration,
} from './caravan'
import { requestsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

/** Graines dont le premier tirage est connu : attaque certaine, ou aucune attaque. */
const ATTACKED = 7
const SAFE = 1

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes. */
function play(state: CaravanState, command: CaravanCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    current = evolve(current, event)
    requests.push(...requestsFor(current, event))
  }
  return { state: current, events: decision.events, requests }
}

/** Envoi d'une caravane d'Alice à Bob. */
const send = (caravanId = 'c1', cargo: Record<string, number> = { wood: 60 }, seed = SAFE) =>
  ({
    type: 'SendCaravan',
    caravanId,
    senderId: 'alice',
    senderName: 'Alice',
    recipientId: 'bob',
    recipientVillage: 'Clairval',
    cargo,
    seed,
  }) as const satisfies CaravanCommand

/** Réponse du Village au prélèvement de la cargaison. */
const loaded = (caravanId = 'c1', outcome: 'withdrawn' | 'refused' = 'withdrawn') =>
  ({
    type: 'RecordWithdrawal',
    transferId: transferIdOf('alice', caravanId, 'load'),
    outcome,
    missing: outcome === 'refused' ? { wood: 20 } : undefined,
  }) as const satisfies CaravanCommand

/** Caravane envoyée puis partie à T0 ; elle arrive à T0 + durée du trajet. */
function travelling(seed = SAFE, cargo: Record<string, number> = { wood: 60 }) {
  const sent = play(initialState, send('c1', cargo, seed)).state
  return play(sent, loaded()).state
}

const arrival = T0 + travelDuration({ wood: 60 })

describe('Caravane - envoi (règles 1 à 3)', () => {
  it('envoie une caravane et demande le prélèvement de la cargaison', () => {
    const { state, requests } = play(initialState, send())
    expect(state.caravans.c1).toMatchObject({ status: 'loading', recipientId: 'bob' })
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'caravan:alice:c1:load',
        playerId: 'alice',
        resources: { wood: 60 },
      },
    ])
  })

  it("refuse une caravane adressée à l'expéditeur lui-même (règle 1)", () => {
    const decision = decide(initialState, { ...send(), recipientId: 'alice' }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'SAME_PLAYER' } })
  })

  it("refuse un destinataire qui n'a pas de village", () => {
    const decision = decide(initialState, { ...send(), recipientVillage: null }, T0)
    expect(decision).toEqual({ ok: false, error: { code: 'UNKNOWN_RECIPIENT' } })
  })

  it('refuse une cargaison vide, non entière ou de plus de 300 unités (règle 2)', () => {
    const codeOf = (cargo: Record<string, number>) => {
      const decision = decide(initialState, send('c1', cargo), T0)
      return decision.ok ? null : decision.error.code
    }
    expect(codeOf({})).toBe('INVALID_CARGO')
    expect(codeOf({ wood: 0 })).toBe('INVALID_CARGO')
    expect(codeOf({ wood: 2.5 })).toBe('INVALID_CARGO')
    expect(codeOf({ wood: 200, stone: 101 })).toBe('CARGO_TOO_HEAVY')
    expect(codeOf({ wood: 200, stone: 100 })).toBeNull()
  })

  it('refuse une quatrième caravane en cours, mais pas après une arrivée (règle 3)', () => {
    let state = initialState
    for (let n = 1; n <= MAX_ACTIVE_CARAVANS; n++) state = play(state, send(`c${n}`)).state
    state = play(state, loaded('c1')).state

    expect(decide(state, send('c4'), T0)).toEqual({
      ok: false,
      error: { code: 'TOO_MANY_CARAVANS', max: 3 },
    })
    // c1 arrive : elle ne compte plus parmi les caravanes en cours.
    expect(decide(state, send('c4'), arrival).ok).toBe(true)
  })
})

describe('Caravane - départ (règles 4 et 5)', () => {
  it('fait partir la caravane une fois la cargaison prélevée, et programme son arrivée', () => {
    const sent = play(initialState, send()).state
    const { state, requests } = play(sent, loaded())
    expect(state.caravans.c1).toMatchObject({ status: 'travelling', arrivesAt: arrival })
    expect(requests).toEqual([{ kind: 'arrive', senderId: 'alice', caravanId: 'c1', at: arrival }])
  })

  it("refuse la caravane si le stock de l'expéditeur ne suffit pas, sans rien compenser", () => {
    const sent = play(initialState, send()).state
    const { state, requests } = play(sent, loaded('c1', 'refused'))
    expect(state.caravans.c1).toMatchObject({ status: 'refused', missing: { wood: 20 } })
    expect(requests).toEqual([])
  })

  it('dure une minute, plus une seconde par tranche de deux unités (règle 5)', () => {
    expect(travelDuration({ wood: 1 })).toBe(BASE_TRAVEL_MS)
    expect(travelDuration({ wood: 60 })).toBe(BASE_TRAVEL_MS + 30_000)
    expect(travelDuration({ wood: 200, stone: 100 })).toBe(BASE_TRAVEL_MS + 150_000)
  })
})

describe('Caravane - arrivée (règles 6, 8 et 9)', () => {
  it("n'arrive pas avant son échéance", () => {
    const { events } = play(travelling(), { type: 'SettleArrivals' }, arrival - 1)
    expect(events).toEqual([])
  })

  it("livre toute la cargaison au destinataire lorsque les brigands n'attaquent pas", () => {
    const { state, events, requests } = play(travelling(SAFE), { type: 'SettleArrivals' }, arrival)
    expect(events).toEqual([{ type: 'CaravanArrived', data: { caravanId: 'c1', at: arrival } }])
    expect(state.caravans.c1.status).toBe('delivered')
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'caravan:alice:c1:deliver',
        playerId: 'bob',
        resources: { wood: 60 },
      },
    ])
  })

  it("rend à l'expéditeur la part épargnée par les brigands", () => {
    const { state, requests } = play(travelling(ATTACKED), { type: 'SettleArrivals' }, arrival)
    expect(state.caravans.c1).toMatchObject({
      status: 'attacked',
      stolen: { wood: 30 },
      returned: { wood: 30 },
    })
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'caravan:alice:c1:return',
        playerId: 'alice',
        resources: { wood: 30 },
      },
    ])
  })

  it("est constatée sans tâche de fond, datée de l'échéance, avec la même issue à chaque lecture", () => {
    const state = travelling(ATTACKED)
    // Constatée une heure plus tard, ou par une autre commande : même issue, même date.
    const late = play(state, { type: 'SettleArrivals' }, arrival + 3_600_000).events
    const byCommand = play(state, send('c2'), arrival + 10).events
    expect(late).toEqual([
      {
        type: 'CaravanAttacked',
        data: { caravanId: 'c1', stolen: { wood: 30 }, returned: { wood: 30 }, at: arrival },
      },
    ])
    expect(byCommand[0]).toEqual(late[0])
  })

  it("signale une caravane désignée qui n'est pas encore arrivée", () => {
    const decision = decide(travelling(), { type: 'SettleArrivals', caravanId: 'c1' }, arrival - 1)
    expect(decision).toEqual({ ok: false, error: { code: 'NOT_ARRIVED' } })
  })
})

describe('Caravane - rappel (règle 10)', () => {
  const halfway = T0 + travelDuration({ wood: 60 }) / 2

  it("rend toute la cargaison à l'expéditeur avant la moitié du trajet", () => {
    const { state, requests } = play(
      travelling(),
      { type: 'RecallCaravan', caravanId: 'c1' },
      halfway - 1,
    )
    expect(state.caravans.c1.status).toBe('recalled')
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'caravan:alice:c1:refund',
        playerId: 'alice',
        resources: { wood: 60 },
      },
    ])
  })

  it('refuse le rappel à partir de la moitié du trajet, ou après l’arrivée', () => {
    const state = travelling()
    const recall = { type: 'RecallCaravan', caravanId: 'c1' } as const
    expect(decide(state, recall, halfway)).toEqual({ ok: false, error: { code: 'TOO_LATE' } })
    expect(decide(state, recall, arrival)).toEqual({
      ok: false,
      error: { code: 'NOT_TRAVELLING', status: 'delivered' },
    })
  })

  it("refuse le rappel d'une caravane qui n'existe pas, ou pas encore partie", () => {
    const sent = play(initialState, send()).state
    expect(decide(sent, { type: 'RecallCaravan', caravanId: 'x' }, T0)).toEqual({
      ok: false,
      error: { code: 'CARAVAN_NOT_FOUND' },
    })
    expect(decide(sent, { type: 'RecallCaravan', caravanId: 'c1' }, T0)).toEqual({
      ok: false,
      error: { code: 'NOT_TRAVELLING', status: 'loading' },
    })
  })
})

describe('Caravane - idempotence (règle 11)', () => {
  it('ignore une réponse du Village reçue deux fois', () => {
    const state = travelling()
    expect(play(state, loaded()).events).toEqual([])
    expect(play(state, loaded('c1', 'refused')).events).toEqual([])
  })

  it('ignore une réponse étrangère à la caravane', () => {
    const sent = play(initialState, send()).state
    const foreign = { ...loaded(), transferId: 'o1:reserve' }
    expect(play(sent, foreign).events).toEqual([])
  })

  it('désigne chaque mouvement par un identifiant stable, propre à la caravane et à l’étape', () => {
    expect(transferIdOf('alice', 'c1', 'deliver')).toBe('caravan:alice:c1:deliver')
    expect(parseTransferId('caravan:alice:c1:deliver')).toEqual({
      senderId: 'alice',
      caravanId: 'c1',
      step: 'deliver',
    })
    expect(parseTransferId('o1:reserve')).toBeNull()
  })

  it("ne présente jamais la graine du tirage dans la vue de l'expéditeur", () => {
    const view = toView(travelling(ATTACKED), 'c1')
    expect(view).toMatchObject({ status: 'travelling', recallableUntil: T0 + 45_000 })
    expect(JSON.stringify(view)).not.toContain('seed')
  })
})
