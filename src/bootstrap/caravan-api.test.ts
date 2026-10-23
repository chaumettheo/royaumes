import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { CaravanList, CaravanView, Recipient } from '@/modules/caravan/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi, TEST_CRON_SECRET } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/**
 * Application de test où Alice et Bob ont fondé leur village : chacun dispose de 100 bois et
 * 50 pierre. Carol est inscrite, mais n'a pas de village. L'horloge reste figée tant que le test
 * ne la fait pas avancer : les stocks ne varient que par les caravanes.
 */
async function caravanWithVillages() {
  const api = await createTestApi()
  await api.post('/api/realm/village', { name: 'Valombre' }, 'alice')
  await api.post('/api/realm/village', { name: 'Clairval' }, 'bob')
  return api
}

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

/** Envoie au nom d'Alice une caravane de 60 bois à Bob, ou une autre caravane. */
async function send(api: TestApi, cargo: Record<string, number> = { wood: 60 }, to = 'bob') {
  const res = await api.post('/api/caravan/caravans', { recipientId: to, cargo }, 'alice')
  return {
    status: res.status,
    body: (await res.json()) as { caravanId: string; view: CaravanView },
  }
}

/** Caravanes d'un joueur. */
async function listOf(api: TestApi, player: string) {
  return (await (await api.get('/api/caravan/caravans', player)).json()) as CaravanList
}

/** Code d'erreur d'une réponse. */
const codeOf = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('API du module Caravane', () => {
  it('refuse une requête anonyme sur chaque route (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/caravan/caravans', null)).status).toBe(401)
    expect((await api.get('/api/caravan/recipients', null)).status).toBe(401)
    expect((await api.post('/api/caravan/caravans', {}, null)).status).toBe(401)
    expect((await api.post('/api/caravan/caravans/c1/recall', {}, null)).status).toBe(401)
  })

  it('propose comme destinataires les autres joueurs qui ont fondé un village', async () => {
    const api = await caravanWithVillages()
    const res = await api.get('/api/caravan/recipients')
    const { recipients } = (await res.json()) as { recipients: Recipient[] }
    expect(recipients).toEqual([{ playerId: 'bob', villageName: 'Clairval' }])
  })

  it("fait partir la caravane, après le prélèvement de la cargaison dans le village de l'expéditeur", async () => {
    const api = await caravanWithVillages()
    const { status, body } = await send(api)

    // La saga a progressé jusqu'au départ pendant la requête d'envoi.
    expect(status).toBe(201)
    expect(body.view).toMatchObject({ status: 'travelling', recipientVillage: 'Clairval' })
    expect((await stockOf(api, 'alice')).wood).toBe(40)
  })

  it("refuse la caravane lorsque le stock de l'expéditeur ne suffit pas", async () => {
    const api = await caravanWithVillages()
    const { body } = await send(api, { wood: 150 })

    expect(body.view).toMatchObject({ status: 'refused', missing: { wood: 50 } })
    expect((await stockOf(api, 'alice')).wood).toBe(100)
  })

  it('valide le destinataire et la cargaison', async () => {
    const api = await caravanWithVillages()
    const post = (body: unknown) => api.post('/api/caravan/caravans', body, 'alice')

    expect((await post({ recipientId: 'bob', cargo: {} })).status).toBe(400)
    expect((await post({ recipientId: 'bob', cargo: { wood: -5 } })).status).toBe(400)
    expect((await post({ recipientId: 'bob', cargo: { iron: 5 } })).status).toBe(400)
    expect((await post({ cargo: { wood: 5 } })).status).toBe(400)

    const self = await post({ recipientId: 'alice', cargo: { wood: 5 } })
    expect([self.status, await codeOf(self)]).toEqual([422, 'SAME_PLAYER'])
    const noVillage = await post({ recipientId: 'carol', cargo: { wood: 5 } })
    expect([noVillage.status, await codeOf(noVillage)]).toEqual([404, 'UNKNOWN_RECIPIENT'])
    const heavy = await post({ recipientId: 'bob', cargo: { wood: 200, stone: 101 } })
    expect([heavy.status, await codeOf(heavy)]).toEqual([422, 'CARGO_TOO_HEAVY'])
  })

  it('refuse une quatrième caravane en cours (409)', async () => {
    const api = await caravanWithVillages()
    for (let n = 0; n < 3; n++) expect((await send(api, { wood: 10 })).status).toBe(201)
    const fourth = await api.post(
      '/api/caravan/caravans',
      { recipientId: 'bob', cargo: { wood: 10 } },
      'alice',
    )
    expect([fourth.status, await codeOf(fourth)]).toEqual([409, 'TOO_MANY_CARAVANS'])
  })

  it("n'accepte qu'une caravane lors de deux envois simultanés à la limite", async () => {
    const api = await caravanWithVillages()
    await send(api, { wood: 10 })
    await send(api, { wood: 10 })
    const results = await Promise.all([send(api, { wood: 10 }), send(api, { wood: 10 })])

    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect((await stockOf(api, 'alice')).wood).toBe(70)
  })

  it('livre la caravane à son arrivée, constatée par le seul destinataire, sans créer ni perdre de ressource', async () => {
    const api = await caravanWithVillages()
    await send(api)
    api.advance(2)

    // Seul Bob consulte ses caravanes : l'arrivée est constatée dans le flux d'Alice.
    const [caravan] = (await listOf(api, 'bob')).received
    expect(['delivered', 'attacked']).toContain(caravan.status)

    // L'issue dépend de la graine tirée par le serveur ; les deux issues sont vérifiées.
    // En deux minutes, chaque scierie a produit 20 bois : chaque village en a donc reçu 120.
    const alice = (await stockOf(api, 'alice')).wood
    const bob = (await stockOf(api, 'bob')).wood
    const stolen = caravan.stolen?.wood ?? 0
    expect(alice + bob + stolen).toBe(240)
    if (caravan.status === 'delivered') {
      expect([alice, bob]).toEqual([60, 180])
    } else {
      expect([alice, bob, stolen]).toEqual([90, 120, 30])
    }
  })

  it("constate l'arrivée par la tâche quotidienne, même si personne ne consulte les caravanes", async () => {
    const api = await caravanWithVillages()
    await send(api)
    api.advance(2)

    await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    const result = await api.db.execute(
      sql`SELECT type FROM platform.events WHERE stream = 'caravan-alice' ORDER BY version`,
    )
    const types = (result as unknown as { rows: { type: string }[] }).rows.map((r) => r.type)
    expect(types.slice(0, 2)).toEqual(['CaravanSent', 'CaravanDeparted'])
    expect(['CaravanArrived', 'CaravanAttacked']).toContain(types[2])
  })

  it("rend toute la cargaison à l'expéditeur qui rappelle sa caravane avant la moitié du trajet", async () => {
    const api = await caravanWithVillages()
    const { body } = await send(api)
    api.advance(0.5)

    const res = await api.post(`/api/caravan/caravans/${body.caravanId}/recall`, {}, 'alice')
    expect(((await res.json()) as { view: CaravanView }).view.status).toBe('recalled')
    // 100 bois au départ, plus 5 produits par la scierie pendant la demi-minute écoulée.
    expect((await stockOf(api, 'alice')).wood).toBe(105)
  })

  it('refuse le rappel par un autre joueur (404), ou après la moitié du trajet (409)', async () => {
    const api = await caravanWithVillages()
    const { body } = await send(api)
    const path = `/api/caravan/caravans/${body.caravanId}/recall`

    const byBob = await api.post(path, {}, 'bob')
    expect([byBob.status, await codeOf(byBob)]).toEqual([404, 'CARAVAN_NOT_FOUND'])
    api.advance(1)
    const late = await api.post(path, {}, 'alice')
    expect([late.status, await codeOf(late)]).toEqual([409, 'TOO_LATE'])
  })

  it("annonce l'évolution des caravanes sur un canal discret, sans leur contenu", async () => {
    const api = await caravanWithVillages()
    await send(api)

    const res = await api.get('/api/stream/caravans/events?after=0', 'bob')
    const { events } = (await res.json()) as { events: { type: string }[] }
    expect(events.map((event) => event.type)).toEqual(['CaravanSent', 'CaravanDeparted'])
    expect(JSON.stringify(events)).not.toContain('seed')
    expect(JSON.stringify(events)).not.toContain('wood')
    // Le flux d'un expéditeur n'est pas un canal : il est fermé par défaut.
    expect((await api.get('/api/stream/caravan-alice', 'alice')).status).toBe(403)
  })

  it('exporte les caravanes du joueur, et efface son nom avec son compte', async () => {
    const api = await caravanWithVillages()
    await send(api)

    const exported = (await (await api.get('/api/account/export')).json()) as {
      sections: { caravan: { sent: unknown[]; recipientVillage: string } }
    }
    expect(exported.sections.caravan.sent).toHaveLength(1)
    expect(exported.sections.caravan.recipientVillage).toBe('Valombre')

    await api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': 'alice' } })
    const [caravan] = (await listOf(api, 'bob')).received
    expect(caravan.counterpart).toBe('Joueur effacé')
    const res = await api.get('/api/caravan/recipients', 'bob')
    expect(((await res.json()) as { recipients: Recipient[] }).recipients).toEqual([])
    const rows = await api.db.execute(
      sql`SELECT data FROM platform.events WHERE stream = 'caravan-alice' AND type = 'CaravanSent'`,
    )
    const data = (rows as unknown as { rows: { data: { senderName: string } }[] }).rows[0].data
    expect(data.senderName).toBe('Joueur effacé')
  })
})
