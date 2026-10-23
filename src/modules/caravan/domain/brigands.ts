/**
 * Les brigands : des personnages pilotés par le jeu, qui guettent les caravanes en route.
 * Leur comportement est déterministe : il ne dépend que de la cargaison et de la graine tirée
 * au départ de la caravane. Rejouer le même départ donne toujours la même issue.
 */
import { seeded } from './random'

/** Quantités de ressources, par nom de ressource (« wood », « stone », « gold »). */
export type Amounts = Partial<Record<string, number>>

/** Probabilité d'attaque d'une caravane sans valeur, en pourcentage. */
export const BASE_ATTACK_PERCENT = 10

/** Hausse de la probabilité d'attaque, en points, par tranche de dix unités de valeur. */
export const PERCENT_PER_TEN_VALUE = 1

/** Probabilité d'attaque maximale, en pourcentage. */
export const MAX_ATTACK_PERCENT = 50

/** Valeur d'une unité de chaque ressource : l'or attire davantage les brigands. */
export const RESOURCE_VALUE: Record<string, number> = { wood: 1, stone: 1, gold: 5 }

/** Valeur d'une cargaison, telle que l'estiment les brigands. */
export function cargoValue(cargo: Amounts): number {
  let value = 0
  for (const [resource, amount] of Object.entries(cargo)) {
    value += (amount ?? 0) * (RESOURCE_VALUE[resource] ?? 1)
  }
  return value
}

/** Probabilité d'attaque d'une cargaison, en pourcentage entier (règle 7 de la fiche). */
export function attackPercent(cargo: Amounts): number {
  const percent = BASE_ATTACK_PERCENT + Math.floor(cargoValue(cargo) / 10) * PERCENT_PER_TEN_VALUE
  return Math.min(MAX_ATTACK_PERCENT, percent)
}

/**
 * Décision des brigands : attaquent-ils cette caravane ? Le tirage dépend de la seule graine,
 * fixée au départ : il est le même à chaque lecture, et ne peut pas être relancé.
 */
export function brigandsAttack(seed: number, cargo: Amounts): boolean {
  return seeded(seed)() * 100 < attackPercent(cargo)
}

/**
 * Butin des brigands : la moitié de chaque ressource, arrondie à l'unité inférieure.
 * Le reste est rendu à l'expéditeur (règle 8 de la fiche).
 */
export function plunder(cargo: Amounts): { stolen: Amounts; returned: Amounts } {
  const stolen: Amounts = {}
  const returned: Amounts = {}
  for (const [resource, amount] of Object.entries(cargo)) {
    if (!amount) continue
    const taken = Math.floor(amount / 2)
    if (taken > 0) stolen[resource] = taken
    returned[resource] = amount - taken
  }
  return { stolen, returned }
}
