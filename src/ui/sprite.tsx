import type { CSSProperties } from 'react'

/**
 * Image extraite d'une planche de pixel art, éventuellement animée.
 * Les planches des personnages et des monstres rangent les directions en colonnes et les étapes
 * de l'animation en lignes (axe vertical) ; celles des décors rangent les étapes en ligne
 * (axe horizontal). L'animation est réalisée en CSS, image par image (steps).
 */
export interface SpriteProps {
  /** Adresse de la planche. */
  src: string
  /** Taille d'une image de la planche, en pixels d'origine. */
  w: number
  h: number
  /** Taille de toute la planche, en pixels d'origine. */
  sheet: [number, number]
  /** Image de départ : colonne et ligne. */
  col?: number
  row?: number
  /** Nombre d'images de l'animation, et sa vitesse ; une seule image : aucune animation. */
  frames?: number
  fps?: number
  axis?: 'x' | 'y'
  /** Agrandissement : un pixel d'origine vaut `scale` pixels CSS. */
  scale?: number
  className?: string
  style?: CSSProperties
}

export function Sprite({
  src,
  w,
  h,
  sheet,
  col = 0,
  row = 0,
  frames = 1,
  fps = 6,
  axis = 'x',
  scale = 1,
  className,
  style,
}: SpriteProps) {
  const x0 = -col * w * scale
  const y0 = -row * h * scale
  const animated = frames > 1
  return (
    <span
      aria-hidden="true"
      className={`sprite${className ? ` ${className}` : ''}`}
      data-anim={animated ? axis : undefined}
      style={
        {
          width: w * scale,
          height: h * scale,
          backgroundImage: `url(${src})`,
          backgroundSize: `${sheet[0] * scale}px ${sheet[1] * scale}px`,
          backgroundPosition: `${x0}px ${y0}px`,
          '--x0': `${x0}px`,
          '--y0': `${y0}px`,
          '--dist': `${frames * (axis === 'x' ? w : h) * scale}px`,
          '--steps': frames,
          '--dur': `${frames / fps}s`,
          ...style,
        } as CSSProperties
      }
    />
  )
}

/** Planches des personnages (64x112, images de 16 px) et des monstres (64x64). */
const CHARACTER: Pick<SpriteProps, 'w' | 'h' | 'sheet'> = { w: 16, h: 16, sheet: [64, 112] }
const MONSTER: Pick<SpriteProps, 'w' | 'h' | 'sheet'> = { w: 16, h: 16, sheet: [64, 64] }

/** Direction d'un personnage : la colonne correspondante de sa planche. */
export const DIRECTIONS = { down: 0, up: 1, left: 2, right: 3 } as const

/**
 * Personnage ou monstre animé. `walking` fait défiler les quatre étapes de la marche ; sinon,
 * le personnage reste sur sa première image.
 */
export function Actor({
  name,
  monster = false,
  direction = 'down',
  walking = true,
  scale = 1,
  fps = 6,
  className,
  style,
}: {
  name: string
  monster?: boolean
  direction?: keyof typeof DIRECTIONS
  walking?: boolean
  scale?: number
  fps?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <Sprite
      src={`/assets/actors/${name}.png`}
      {...(monster ? MONSTER : CHARACTER)}
      col={DIRECTIONS[direction]}
      frames={walking ? 4 : 1}
      fps={fps}
      axis="y"
      scale={scale}
      className={className}
      style={style}
    />
  )
}
