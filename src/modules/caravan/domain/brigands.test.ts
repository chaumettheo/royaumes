import { describe, expect, it } from 'vitest'
import { attackPercent, brigandsAttack, cargoValue, MAX_ATTACK_PERCENT, plunder } from './brigands'

// Graines dont le premier tirage est connu : 0,012 pour la graine 7, 0,156 pour la graine 8,
// 0,627 pour la graine 1.
const ALWAYS = 7
const AT_16_PERCENT = 8
const NEVER = 1

describe('Brigands - probabilité d’attaque (règle 7)', () => {
  it("compte cinq unités de valeur pour une unité d'or", () => {
    expect(cargoValue({ wood: 10, stone: 5, gold: 2 })).toBe(25)
  })

  it('part de 10 % et gagne un point par tranche de dix unités de valeur', () => {
    expect(attackPercent({ wood: 9 })).toBe(10)
    expect(attackPercent({ wood: 10 })).toBe(11)
    expect(attackPercent({ wood: 100, stone: 50 })).toBe(25)
    expect(attackPercent({ gold: 20 })).toBe(20)
  })

  it('ne dépasse jamais 50 %', () => {
    expect(attackPercent({ gold: 300 })).toBe(MAX_ATTACK_PERCENT)
  })

  it('attaque selon la valeur de la cargaison, pour une même graine', () => {
    // Le tirage de la graine 8 vaut 0,156 : 15 % ne suffit pas, 16 % suffit.
    expect(brigandsAttack(AT_16_PERCENT, { wood: 50 })).toBe(false)
    expect(brigandsAttack(AT_16_PERCENT, { wood: 60 })).toBe(true)
    expect(brigandsAttack(ALWAYS, { wood: 1 })).toBe(true)
    expect(brigandsAttack(NEVER, { gold: 300 })).toBe(false)
  })

  it('rend toujours la même décision pour la même graine et la même cargaison', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(brigandsAttack(seed, { wood: 120 })).toBe(brigandsAttack(seed, { wood: 120 }))
    }
  })

  it('attaque, sur un grand nombre de départs, dans la proportion annoncée', () => {
    // 10 000 graines successives : la fréquence observée approche la probabilité de 25 %.
    const cargo = { wood: 100, stone: 50 }
    let attacks = 0
    for (let seed = 1; seed <= 10_000; seed++) if (brigandsAttack(seed, cargo)) attacks++
    expect(attacks / 10_000).toBeGreaterThan(0.23)
    expect(attacks / 10_000).toBeLessThan(0.27)
  })
})

describe('Brigands - butin (règle 8)', () => {
  it("emporte la moitié de chaque ressource, arrondie à l'unité inférieure", () => {
    expect(plunder({ wood: 61, stone: 30, gold: 1 })).toEqual({
      stolen: { wood: 30, stone: 15 },
      returned: { wood: 31, stone: 15, gold: 1 },
    })
  })

  it('ne crée ni ne perd aucune ressource', () => {
    const cargo = { wood: 77, stone: 3, gold: 9 }
    const { stolen, returned } = plunder(cargo)
    for (const [resource, amount] of Object.entries(cargo)) {
      expect((stolen[resource] ?? 0) + (returned[resource] ?? 0)).toBe(amount)
    }
  })
})
