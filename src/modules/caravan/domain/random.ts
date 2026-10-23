/**
 * Générateur pseudo-aléatoire à graine : la même graine produit toujours le même tirage.
 * Le tirage d'une attaque de brigands peut ainsi être recalculé à l'identique, à chaque lecture.
 * Ce générateur n'est pas cryptographique : connaître la graine permet de prévoir le tirage.
 *
 * DETTE TECHNIQUE DT-014 (docs/qualite/dette-technique.md) : copie du générateur du Donjon
 * (mulberry32), dont le domaine ne peut pas être importé par un autre module.
 */

/** Générateur : chaque appel renvoie un nombre de l'intervalle [0, 1[. */
export type Random = () => number

/**
 * Crée un générateur à partir d'une graine, selon l'algorithme mulberry32.
 * Les opérations « >>> 0 » ramènent chaque résultat à un entier positif sur 32 bits.
 */
export function seeded(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
