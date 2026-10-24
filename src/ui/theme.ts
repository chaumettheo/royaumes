/**
 * Couche de thème : l'apparence de chaque entité du jeu est définie ici, et nulle part ailleurs.
 * Les composants n'affichent jamais une image ou un symbole en dur : ils demandent l'apparence
 * d'une entité par son identifiant. La direction artistique, en pixel art, provient du pack
 * Ninja Adventure (CC0, public/assets) ; une entité sans image garde son symbole.
 */
export interface Look {
  /** Symbole affiché lorsque l'entité n'a pas d'image. */
  glyph: string
  /** Libellé en français, lu par les lecteurs d'écran et affiché au survol. */
  label: string
  /** Image de l'entité, en pixel art, servie depuis public/assets. */
  icon?: string
}

/** Dossier des ressources graphiques. */
const A = '/assets'

export const theme: Record<string, Look> = {
  village: { glyph: '🏰', label: 'Village', icon: `${A}/map/townhall.png` },
  wood: { glyph: '🪵', label: 'Bois', icon: `${A}/icons/wood.png` },
  stone: { glyph: '🪨', label: 'Pierre', icon: `${A}/icons/stone.png` },
  gold: { glyph: '🪙', label: 'Or', icon: `${A}/icons/gold.png` },
  sawmill: { glyph: '🪚', label: 'Scierie', icon: `${A}/map/stump.png` },
  quarry: { glyph: '⛏️', label: 'Carrière', icon: `${A}/map/rocks.png` },
  mine: { glyph: '⚒️', label: 'Mine', icon: `${A}/map/hut.png` },
  dungeon: { glyph: '⚔️', label: 'Donjon', icon: `${A}/map/arch.png` },
  hero: { glyph: '🛡️', label: 'Héros', icon: `${A}/actors/hero-face.png` },
  companion: { glyph: '🤖', label: 'Compagnon', icon: `${A}/actors/companion-face.png` },
  goblin: { glyph: '👺', label: 'Gobelin', icon: `${A}/actors/goblin-face.png` },
  skeleton: { glyph: '💀', label: 'Squelette', icon: `${A}/actors/skeleton-face.png` },
  troll: { glyph: '👹', label: 'Troll', icon: `${A}/actors/troll-face.png` },
  door: { glyph: '🚪', label: 'Porte', icon: `${A}/icons/chest.png` },
  ranking: { glyph: '🏆', label: 'Classement', icon: `${A}/icons/cup.png` },
  market: { glyph: '⚖️', label: 'Marché', icon: `${A}/icons/money-bag.png` },
  tavern: { glyph: '🍺', label: 'Taverne', icon: `${A}/map/inn.png` },
  caravan: { glyph: '🐫', label: 'Caravane', icon: `${A}/icons/donkey.png` },
  brigands: { glyph: '🗡️', label: 'Brigands', icon: `${A}/actors/noble-face.png` },
  forge: { glyph: '🔥', label: 'Forge', icon: `${A}/icons/anvil.png` },
  axe: { glyph: '🪓', label: 'Hache', icon: `${A}/icons/axe.png` },
  hammer: { glyph: '🔨', label: 'Marteau', icon: `${A}/icons/hammer.png` },
  ring: { glyph: '💍', label: 'Anneau', icon: `${A}/icons/ring.png` },
  crown: { glyph: '👑', label: 'Couronne', icon: `${A}/icons/crown.png` },
  account: { glyph: '📜', label: 'Mes données', icon: `${A}/icons/scroll.png` },
  player: { glyph: '🙂', label: 'Joueur', icon: `${A}/actors/villager-face.png` },
}

/** Apparence d'une entité ; une apparence neutre si l'entité n'est pas décrite. */
export const look = (kind: string): Look => theme[kind] ?? { glyph: '?', label: kind }

/**
 * Visage attribué à un joueur, choisi de façon stable à partir de son identifiant : un même
 * joueur garde toujours le même visage, sans qu'aucune donnée ne soit enregistrée.
 */
const FACES = [
  'villager',
  'villager-2',
  'woman',
  'old-man',
  'knight',
  'hunter',
  'master',
  'monk',
  'princess',
]
export function faceOf(playerId: string): string {
  let hash = 0
  for (const char of playerId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `${A}/actors/${FACES[hash % FACES.length]}-face.png`
}
