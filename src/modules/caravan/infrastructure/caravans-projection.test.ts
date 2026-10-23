import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { ERASED_VILLAGE } from '@/platform/privacy/privacy'
import { createProjectionRunner, type ProjectionRunner } from '@/platform/projection/projection'
import type { CaravansReader } from '../application/caravans-reader'
import { caravansProjection } from './caravans-projection'
import { createDrizzleCaravansReader } from './drizzle-caravans-reader'

// Chaque test dispose d'un journal neuf et de tables de lecture vides.
let store: EventStore
let projections: ProjectionRunner
let reader: CaravansReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  projections = createProjectionRunner(db)
  reader = createDrizzleCaravansReader(db, projections)
})

const T0 = Date.UTC(2026, 0, 1)

// Événements du Village et de la Caravane, réduits aux champs lus par la projection.
const founded = (name: string): NewEvent => ({ type: 'VillageFounded', data: { name, at: T0 } })
const sent: NewEvent = {
  type: 'CaravanSent',
  data: {
    caravanId: 'c1',
    senderId: 'alice',
    senderName: 'Alice',
    recipientId: 'bob',
    recipientVillage: 'Clairval',
    cargo: { wood: 60 },
    seed: 1,
    at: T0,
  },
}
const departed: NewEvent = {
  type: 'CaravanDeparted',
  data: { caravanId: 'c1', at: T0, arrivesAt: T0 + 90_000 },
}
const attacked: NewEvent = {
  type: 'CaravanAttacked',
  data: { caravanId: 'c1', stolen: { wood: 30 }, returned: { wood: 30 }, at: T0 + 90_000 },
}

describe('Projection des caravanes', () => {
  it('propose comme destinataires les autres joueurs qui ont fondé un village', async () => {
    await store.append('village-alice', 0, [founded('Valombre')])
    await store.append('village-bob', 0, [founded('Clairval')])

    expect(await reader.recipients('alice')).toEqual([{ playerId: 'bob', villageName: 'Clairval' }])
    expect(await reader.villageOf('alice')).toBe('Valombre')
    expect(await reader.villageOf('carol')).toBeNull()
  })

  it("présente la caravane à l'expéditeur et, une fois partie, au destinataire", async () => {
    await store.append('caravan-alice', 0, [sent])
    expect((await reader.list('alice')).sent).toHaveLength(1)
    // En chargement, la caravane n'a pas quitté le village : le destinataire ne la voit pas.
    expect((await reader.list('bob')).received).toEqual([])

    await store.append('caravan-alice', 1, [departed, attacked])
    const { received, position } = await reader.list('bob')
    expect(received).toEqual([
      expect.objectContaining({
        counterpart: 'Alice',
        status: 'attacked',
        stolen: { wood: 30 },
        recallableUntil: null,
      }),
    ])
    expect(position).toBe(await store.lastPosition())
  })

  it('désigne les expéditeurs des caravanes échues en route vers un joueur', async () => {
    await store.append('caravan-alice', 0, [sent, departed])
    expect(await reader.dueSendersFor('bob', T0 + 89_999)).toEqual([])
    expect(await reader.dueSendersFor('bob', T0 + 90_000)).toEqual(['alice'])
  })

  it('reconstruit les mêmes tables à partir du journal, sans les villages effacés', async () => {
    await store.append('village-bob', 0, [founded('Clairval')])
    await store.append('village-carol', 0, [founded(ERASED_VILLAGE)])
    await store.append('caravan-alice', 0, [sent, departed])
    const before = await reader.list('alice')

    await projections.rebuild(caravansProjection)
    expect((await reader.list('alice')).sent).toEqual(before.sent)
    expect(await reader.recipients('alice')).toEqual([{ playerId: 'bob', villageName: 'Clairval' }])
  })
})
