import { describe, expect, it } from 'vitest'
import {
  decide,
  evolve,
  type ForgeCommand,
  type ForgeState,
  initialState,
  parseTransferId,
  transferIdOf,
} from './forge'
import { MAX_PER_RECIPE, RECIPES, smeltRefund } from './recipes'
import { requestsFor } from './saga'
import { toView } from './view'

const T0 = Date.UTC(2026, 0, 1)

/** Applique une commande acceptée ; renvoie le nouvel état, les événements et les demandes. */
function play(state: ForgeState, command: ForgeCommand, now = T0) {
  const decision = decide(state, command, now)
  if (!decision.ok) throw new Error(decision.error.code)
  let current = state
  const requests = []
  for (const event of decision.events) {
    requests.push(...requestsFor(current, event))
    current = evolve(current, event)
  }
  return { state: current, events: decision.events, requests }
}

/** Demande de fabrication d'Alice. */
const request = (recipe = 'axe', jobId = 'j1'): ForgeCommand => ({
  type: 'RequestForging',
  jobId,
  playerId: 'alice',
  recipe,
})

/** Réponse du Village au prélèvement des ressources. */
/** Commande issue de la réponse du Village. */
type Withdrawal = Extract<ForgeCommand, { type: 'RecordWithdrawal' }>

const loaded = (jobId = 'j1', outcome: 'withdrawn' | 'refused' = 'withdrawn'): Withdrawal => ({
  type: 'RecordWithdrawal',
  transferId: transferIdOf('alice', jobId, 'load'),
  outcome,
  missing: outcome === 'refused' ? { stone: 5 } : undefined,
})

/** Hache au feu depuis T0 : elle est prête à T0 + une minute. */
const forging = () => play(play(initialState, request()).state, loaded()).state
const ready = T0 + RECIPES.axe.durationMs

/** Forge dont l'inventaire contient un objet de la recette, pour chaque identifiant. */
function withItems(recipe: string, ids: string[]) {
  let state = initialState
  for (const id of ids) {
    state = play(state, request(recipe, id)).state
    state = play(state, loaded(id)).state
    state = play(state, { type: 'Settle' }, T0 + 10 * 60_000).state
  }
  return state
}

describe('Forge - lancement (règles 1 à 4)', () => {
  it('demande le prélèvement des ressources de la recette', () => {
    const { state, requests } = play(initialState, request())
    expect(state.forging).toMatchObject({ recipe: 'axe', status: 'loading' })
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: 'forge:alice:j1:load',
        playerId: 'alice',
        resources: { wood: 40, stone: 20 },
      },
    ])
  })

  it('refuse une recette inconnue (règle 1)', () => {
    expect(decide(initialState, request('sword'), T0)).toEqual({
      ok: false,
      error: { code: 'UNKNOWN_RECIPE' },
    })
  })

  it('refuse une seconde fabrication tant que la forge est occupée (règle 2)', () => {
    const waiting = play(initialState, request()).state
    expect(decide(waiting, request('ring', 'j2'), T0)).toEqual({
      ok: false,
      error: { code: 'FORGE_BUSY' },
    })
    expect(decide(forging(), request('ring', 'j2'), T0).ok).toBe(false)
    // Une fois l'objet achevé, la forge est libre.
    expect(decide(forging(), request('ring', 'j2'), ready).ok).toBe(true)
  })

  it("refuse un quatrième exemplaire d'une même recette, mais pas une autre recette (règle 3)", () => {
    const state = withItems('axe', ['a1', 'a2', 'a3'])
    expect(Object.keys(state.inventory)).toHaveLength(MAX_PER_RECIPE)
    expect(decide(state, request('axe', 'a4'), T0)).toEqual({
      ok: false,
      error: { code: 'TOO_MANY_ITEMS', max: 3 },
    })
    expect(decide(state, request('ring', 'r1'), T0).ok).toBe(true)
  })

  it('met la recette au feu une fois les ressources prélevées, ou la refuse sans rien prélever (règle 4)', () => {
    expect(forging().forging).toMatchObject({ status: 'forging', readyAt: ready })

    const waiting = play(initialState, request()).state
    const { state, requests } = play(waiting, loaded('j1', 'refused'))
    expect(state.forging).toBeNull()
    expect(state.refusal).toEqual({ jobId: 'j1', missing: { stone: 5 } })
    expect(requests).toEqual([])
  })
})

describe('Forge - fabrication (règles 5 et 6)', () => {
  it("donne à chaque recette sa durée, d'une à cinq minutes (règle 5)", () => {
    expect(RECIPES.axe.durationMs).toBe(60_000)
    expect(RECIPES.crown.durationMs).toBe(300_000)
    const crown = play(play(initialState, request('crown')).state, loaded()).state
    expect(crown.forging?.readyAt).toBe(T0 + 300_000)
  })

  it("n'achève pas l'objet avant son échéance", () => {
    expect(play(forging(), { type: 'Settle' }, ready - 1).events).toEqual([])
  })

  it("achève l'objet sans tâche de fond, daté de son échéance, et l'ajoute à l'inventaire (règle 6)", () => {
    const { state, events } = play(forging(), { type: 'Settle' }, ready + 3_600_000)
    expect(events).toEqual([
      { type: 'ItemForged', data: { itemId: 'j1', recipe: 'axe', at: ready } },
    ])
    expect(state.forging).toBeNull()
    expect(state.inventory.j1).toEqual({ itemId: 'j1', recipe: 'axe', forgedAt: ready })
  })

  it("présente déjà l'objet achevé dans la vue, avant même son enregistrement", () => {
    const view = toView(forging(), ready)
    expect(view.forging).toBeNull()
    expect(view.inventory).toEqual([{ itemId: 'j1', recipe: 'axe', forgedAt: ready }])
  })
})

describe('Forge - annulation et fonte (règles 7 et 8)', () => {
  it('rend toutes les ressources prélevées à l’annulation (règle 7)', () => {
    const { state, requests } = play(forging(), { type: 'CancelForging' }, T0 + 1_000)
    expect(state.forging).toBeNull()
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'forge:alice:j1:refund',
        playerId: 'alice',
        resources: { wood: 40, stone: 20 },
      },
    ])
  })

  it("refuse l'annulation sans fabrication au feu, ou après l'achèvement", () => {
    const waiting = play(initialState, request()).state
    const error = { ok: false, error: { code: 'NOT_FORGING' } }
    expect(decide(initialState, { type: 'CancelForging' }, T0)).toEqual(error)
    expect(decide(waiting, { type: 'CancelForging' }, T0)).toEqual(error)
    expect(decide(forging(), { type: 'CancelForging' }, ready)).toEqual(error)
  })

  it("rend la moitié des ressources de la recette à la fonte d'un objet (règle 8)", () => {
    const state = withItems('ring', ['r1'])
    const { state: after, requests } = play(state, { type: 'SmeltItem', itemId: 'r1' })
    expect(after.inventory).toEqual({})
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: 'forge:alice:r1:smelt',
        playerId: 'alice',
        resources: { stone: 5, gold: 10 },
      },
    ])
    expect(smeltRefund('hammer')).toEqual({ wood: 15, stone: 20 })
  })

  it("refuse la fonte d'un objet absent de l'inventaire", () => {
    expect(decide(initialState, { type: 'SmeltItem', itemId: 'x' }, T0)).toEqual({
      ok: false,
      error: { code: 'ITEM_NOT_FOUND' },
    })
  })
})

describe('Forge - idempotence (règle 9)', () => {
  it('ignore une réponse du Village reçue deux fois, ou étrangère à la fabrication', () => {
    expect(play(forging(), loaded()).events).toEqual([])
    const waiting = play(initialState, request()).state
    expect(play(waiting, loaded('autre')).events).toEqual([])
    expect(play(waiting, { ...loaded(), transferId: 'caravan:alice:c1:load' }).events).toEqual([])
  })

  it('désigne chaque mouvement par un identifiant stable, propre à la fabrication et à l’étape', () => {
    expect(parseTransferId('forge:alice:j1:refund')).toEqual({
      playerId: 'alice',
      id: 'j1',
      step: 'refund',
    })
    expect(parseTransferId('caravan:alice:c1:load')).toBeNull()
  })

  it("ne fond qu'une fois un objet, même si la commande est répétée", () => {
    const state = play(withItems('axe', ['a1']), { type: 'SmeltItem', itemId: 'a1' }).state
    expect(decide(state, { type: 'SmeltItem', itemId: 'a1' }, T0).ok).toBe(false)
  })
})
