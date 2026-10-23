import { describe, expect, it } from 'vitest'
import type { ForgeView } from '@/modules/forge/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test où Alice a fondé son village : 100 bois, 50 pierre et aucun or. Sa scierie
 * produit 10 bois par minute, et sa carrière 6 pierre, dès que le test fait avancer l'horloge.
 */
async function forgeWithVillage() {
  const api = await createTestApi()
  await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
  return api
}

/** Stock du village d'Alice. */
async function stockOf(api: TestApi): Promise<Stock> {
  const res = await api.get('/api/realm/village')
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Lance une fabrication au nom d'Alice. */
async function craft(api: TestApi, recipe = 'axe') {
  const res = await api.post('/api/forge/craft', { recipe })
  return { status: res.status, body: (await res.json()) as { view: ForgeView } }
}

/** Vue de la forge d'Alice. */
async function viewOf(api: TestApi) {
  return ((await (await api.get('/api/forge')).json()) as { view: ForgeView }).view
}

/** Code d'erreur d'une réponse. */
const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('API du module Forge', () => {
  it('refuse une requête anonyme sur chaque route (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/forge', null)).status).toBe(401)
    expect((await api.post('/api/forge/craft', { recipe: 'axe' }, null)).status).toBe(401)
    expect((await api.post('/api/forge/cancel', {}, null)).status).toBe(401)
    expect((await api.post('/api/forge/items/x/smelt', {}, null)).status).toBe(401)
  })

  it('présente une forge libre et le livre des recettes', async () => {
    const api = await forgeWithVillage()
    const body = (await (await api.get('/api/forge')).json()) as {
      view: ForgeView
      recipes: { recipe: string }[]
    }
    expect(body.view).toEqual({ forging: null, inventory: [], missing: null })
    expect(body.recipes.map((entry) => entry.recipe)).toEqual(['axe', 'hammer', 'ring', 'crown'])
  })

  it('met la recette au feu après le prélèvement des ressources dans le village', async () => {
    const api = await forgeWithVillage()
    const { status, body } = await craft(api)

    // La saga a progressé jusqu'à la mise au feu pendant la requête.
    expect(status).toBe(201)
    expect(body.view.forging).toMatchObject({ recipe: 'axe', status: 'forging' })
    expect(await stockOf(api)).toMatchObject({ wood: 60, stone: 30 })
  })

  it('refuse la fabrication lorsque le stock ne suffit pas, sans rien prélever', async () => {
    const api = await forgeWithVillage()
    const { body } = await craft(api, 'ring')

    expect(body.view).toMatchObject({ forging: null, missing: { gold: 20 } })
    expect(await stockOf(api)).toMatchObject({ wood: 100, stone: 50 })
  })

  it('valide la recette, et refuse une seconde fabrication simultanée', async () => {
    const api = await forgeWithVillage()
    expect((await api.post('/api/forge/craft', { recipe: 'sword' })).status).toBe(400)
    expect((await api.post('/api/forge/craft', {})).status).toBe(400)

    const results = await Promise.all([craft(api), craft(api, 'hammer')])
    expect(results.map((result) => result.status).sort()).toEqual([201, 409])
  })

  it("ajoute l'objet à l'inventaire à son échéance, constatée à la consultation", async () => {
    const api = await forgeWithVillage()
    await craft(api)
    api.advance(1)

    const view = await viewOf(api)
    expect(view.forging).toBeNull()
    expect(view.inventory).toMatchObject([{ recipe: 'axe' }])
  })

  it('rend toutes les ressources à l’annulation, et refuse une annulation sans fabrication', async () => {
    const api = await forgeWithVillage()
    await craft(api)

    const res = await api.post('/api/forge/cancel', {})
    expect(((await res.json()) as { view: ForgeView }).view.forging).toBeNull()
    expect(await stockOf(api)).toMatchObject({ wood: 100, stone: 50 })

    const again = await api.post('/api/forge/cancel', {})
    expect([again.status, await codeOf(again)]).toEqual([409, 'NOT_FORGING'])
  })

  it("rend la moitié des ressources à la fonte d'un objet, et refuse un objet inconnu", async () => {
    const api = await forgeWithVillage()
    await craft(api)
    api.advance(1)
    const [item] = (await viewOf(api)).inventory

    // Après une minute : 60 + 10 bois, et 30 + 6 pierre ; la fonte rend 20 bois et 10 pierre.
    const res = await api.post(`/api/forge/items/${item.itemId}/smelt`, {})
    expect(((await res.json()) as { view: ForgeView }).view.inventory).toEqual([])
    expect(await stockOf(api)).toMatchObject({ wood: 90, stone: 46 })

    const unknown = await api.post('/api/forge/items/x/smelt', {})
    expect([unknown.status, await codeOf(unknown)]).toEqual([404, 'ITEM_NOT_FOUND'])
  })

  it('ne permet à un joueur ni de fondre ni de voir la forge d’un autre', async () => {
    const api = await forgeWithVillage()
    await craft(api)
    api.advance(1)
    const [item] = (await viewOf(api)).inventory

    // Bob n'agit que sur sa propre forge : l'objet d'Alice y est introuvable.
    const res = await api.post(`/api/forge/items/${item.itemId}/smelt`, {}, 'bob')
    expect(res.status).toBe(404)
    expect((await api.get('/api/stream/forge-alice', 'bob')).status).toBe(403)
  })

  it('transmet les événements de sa forge au seul joueur, sur son canal personnel', async () => {
    const api = await forgeWithVillage()
    await craft(api)

    const res = await api.get('/api/stream/forge-alice/events?after=0')
    const { events } = (await res.json()) as { events: { type: string }[] }
    expect(events.map((event) => event.type)).toEqual(['ForgingRequested', 'ForgingStarted'])
  })

  it("exporte l'inventaire et l'historique de la forge du joueur", async () => {
    const api = await forgeWithVillage()
    await craft(api)
    api.advance(1)
    await viewOf(api)

    const exported = (await (await api.get('/api/account/export')).json()) as {
      sections: { forge: { inventory: { recipe: string }[]; history: { type: string }[] } }
    }
    expect(exported.sections.forge.inventory).toMatchObject([{ recipe: 'axe' }])
    expect(exported.sections.forge.history.map((entry) => entry.type)).toEqual([
      'ForgingRequested',
      'ForgingStarted',
      'ItemForged',
    ])
  })
})
