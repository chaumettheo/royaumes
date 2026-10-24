'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Modal } from './modal'
import { Actor, Sprite } from './sprite'

/**
 * Carte du village : une scène en pixel art, dessinée sur une grille de 480 x 272 pixels
 * d'origine (30 x 17 cases de 16 pixels), puis agrandie sans lissage pour occuper l'écran.
 * Chaque lieu du jeu y est un bâtiment : un clic mène à son module, ou ouvre le panneau du
 * village pour l'hôtel de ville et les bâtiments de production.
 */
const W = 480
const H = 272
const A = '/assets/map'

/** Lieu cliquable : un bâtiment, ou un groupe d'images, et le panneau qui le nomme. */
interface Place {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  /** Images du lieu, placées relativement à son coin. */
  parts: { src: string; dx: number; dy: number }[]
  /** Module du lieu ; sans adresse, le lieu ouvre le panneau du village. */
  href?: string
}

const PLACES: Place[] = [
  {
    id: 'townhall',
    label: 'Hôtel de ville',
    x: 208,
    y: 38,
    w: 64,
    h: 48,
    parts: [{ src: `${A}/townhall.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'forge',
    label: 'Forge',
    href: '/forge',
    x: 96,
    y: 34,
    w: 48,
    h: 64,
    parts: [{ src: `${A}/furnace.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'tavern',
    label: 'Taverne',
    href: '/tavern',
    x: 320,
    y: 44,
    w: 64,
    h: 48,
    parts: [{ src: `${A}/inn.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'market',
    label: 'Marché',
    href: '/market',
    x: 40,
    y: 190,
    w: 100,
    h: 64,
    parts: [
      { src: `${A}/stall-a.png`, dx: 0, dy: 0 },
      { src: `${A}/stall-b.png`, dx: 52, dy: 0 },
      { src: `${A}/goods.png`, dx: 26, dy: 32 },
    ],
  },
  {
    id: 'caravan',
    label: 'Caravanes',
    href: '/caravan',
    x: 408,
    y: 96,
    w: 48,
    h: 32,
    parts: [{ src: `${A}/hay-hut.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'dungeon',
    label: 'Donjon',
    href: '/dungeon',
    x: 420,
    y: 206,
    w: 48,
    h: 48,
    parts: [{ src: `${A}/arch.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'ranking',
    label: 'Classement',
    href: '/ranking',
    x: 204,
    y: 174,
    w: 72,
    h: 34,
    parts: [
      { src: `${A}/banner-red.png`, dx: 0, dy: 2 },
      { src: `${A}/statue.png`, dx: 20, dy: 0 },
      { src: `${A}/banner-blue.png`, dx: 56, dy: 2 },
    ],
  },
  {
    // Le moulin à eau est animé : le lieu n'a pas d'image propre, il couvre la mare et le moulin.
    id: 'sawmill',
    label: 'Scierie',
    x: 6,
    y: 92,
    w: 80,
    h: 48,
    parts: [],
  },
  {
    id: 'quarry',
    label: 'Carrière',
    x: 352,
    y: 212,
    w: 64,
    h: 48,
    parts: [{ src: `${A}/rocks.png`, dx: 0, dy: 0 }],
  },
  {
    id: 'mine',
    label: 'Mine',
    x: 294,
    y: 198,
    w: 48,
    h: 48,
    parts: [{ src: `${A}/hut.png`, dx: 0, dy: 0 }],
  },
]

/** Chemins de terre battue : rectangles réunis, entourés d'un liseré d'herbe sombre. */
const PATHS: [number, number, number, number][] = [
  [0, 148, 480, 24],
  [228, 84, 24, 66],
  [110, 96, 20, 54],
  [342, 90, 22, 60],
  [196, 168, 88, 44],
  [80, 170, 20, 24],
  [308, 170, 20, 32],
  [400, 126, 56, 24],
  [436, 170, 18, 40],
]

/** Décors immobiles : maisons, arbres, buissons, tonneaux. */
const DECOR: { src: string; x: number; y: number }[] = [
  { src: `${A}/house-orange.png`, x: 14, y: 30 },
  { src: `${A}/pond.png`, x: 6, y: 92 },
  { src: `${A}/barrels.png`, x: 288, y: 96 },
  { src: `${A}/tree-big.png`, x: 152, y: 0 },
  { src: `${A}/tree-round.png`, x: 282, y: 2 },
  { src: `${A}/trees-cluster.png`, x: 410, y: -2 },
  { src: `${A}/tree-pine.png`, x: 452, y: 50 },
  { src: `${A}/tree-big-pink.png`, x: -4, y: 226 },
  { src: `${A}/tree-big-orange.png`, x: 150, y: 226 },
  { src: `${A}/tree-round-2.png`, x: 258, y: 242 },
  { src: `${A}/tree-round.png`, x: 72, y: 2 },
  { src: `${A}/logs.png`, x: 90, y: 128 },
  { src: `${A}/stump.png`, x: 176, y: 108 },
  { src: `${A}/bush.png`, x: 190, y: 92 },
  { src: `${A}/bush-2.png`, x: 300, y: 130 },
  { src: `${A}/bush.png`, x: 384, y: 186 },
  { src: `${A}/flowers.png`, x: 22, y: 176 },
  { src: `${A}/flowers-2.png`, x: 272, y: 122 },
  { src: `${A}/flowers.png`, x: 158, y: 186 },
  { src: `${A}/bush-2.png`, x: 466, y: 182 },
]

/** Échelle minimale sur un petit écran : la carte se parcourt alors en la faisant défiler. */
const MIN_SCALE = 1.6

/**
 * Échelle d'affichage : la scène tient dans la place disponible, sans déborder. Sur un petit
 * écran, elle garde une taille lisible, et la carte défile, centrée au départ sur la place.
 */
function useScale(frame: React.RefObject<HTMLDivElement | null>, cover: boolean) {
  const [scale, setScale] = useState(2)
  useEffect(() => {
    const parent = frame.current?.parentElement
    if (!parent) return
    const update = () => {
      const width = Math.min(parent.clientWidth, window.innerWidth)
      const height = cover
        ? parent.clientHeight
        : window.innerHeight - parent.getBoundingClientRect().top - 48
      const fit = cover
        ? Math.max(width / W, height / H)
        : Math.min(width / W, Math.max(height, 200) / H)
      // Au-delà de deux fois la taille d'origine, l'échelle progresse par demi-pas : les pixels
      // restent réguliers.
      // Petit écran : la carte occupe toute la hauteur disponible, et défile en largeur.
      const narrow = Math.max(MIN_SCALE, Math.min(Math.max(height, 200) / H, 3))
      const next = cover ? fit : fit >= 2 ? Math.floor(fit * 2) / 2 : fit < MIN_SCALE ? narrow : fit
      setScale(next)
      // La carte déborde : elle est centrée horizontalement sur l'hôtel de ville.
      const viewport = frame.current?.closest('.map-viewport')
      if (!cover && viewport && W * next > width) viewport.scrollLeft = (W * next - width) / 2
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(parent)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [frame, cover])
  return scale
}

/** Habitant qui va et vient sur une ligne, en regardant dans le sens de sa marche. */
function Walker({
  name,
  y,
  from,
  to,
  speed = 14,
}: {
  name: string
  y: number
  from: number
  to: number
  speed?: number
}) {
  const [forward, setForward] = useState(true)
  return (
    <motion.div
      className="npc"
      style={{ top: y, left: 0 }}
      initial={{ x: from }}
      animate={{ x: forward ? to : from }}
      transition={{ duration: Math.abs(to - from) / speed, ease: 'linear' }}
      onAnimationComplete={() => setForward((value) => !value)}
    >
      <Actor name={name} direction={forward === to > from ? 'right' : 'left'} />
    </motion.div>
  )
}

/** Habitant immobile, qui respire doucement. */
function Idler({
  name,
  x,
  y,
  monster = false,
  delay = 0,
}: {
  name: string
  x: number
  y: number
  monster?: boolean
  delay?: number
}) {
  return (
    <motion.div
      className="npc"
      style={{ left: x, top: y }}
      animate={{ y: [0, -1, 0] }}
      transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, delay }}
    >
      <Actor name={name} monster={monster} walking={false} />
    </motion.div>
  )
}

/** Un lieu de la carte : ses images, son panneau, et son effet au survol. */
function PlaceView({
  place,
  onVillage,
  interactive,
}: {
  place: Place
  onVillage: () => void
  interactive: boolean
}) {
  const body = (
    <>
      <span style={{ position: 'relative', display: 'block', width: place.w, height: place.h }}>
        {place.parts.map((part) => (
          // biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation
          <img
            key={part.src + part.dx}
            className="pixel"
            src={part.src}
            alt=""
            style={{ position: 'absolute', left: part.dx, top: part.dy }}
          />
        ))}
      </span>
      {interactive && <span className="plate">{place.label}</span>}
    </>
  )
  return (
    <motion.div
      className="place-wrap"
      style={{ position: 'absolute', left: place.x, top: place.y, zIndex: place.y + place.h }}
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.96 } : undefined}
    >
      {!interactive ? (
        body
      ) : place.href ? (
        <Link className="place" href={place.href} aria-label={place.label}>
          {body}
        </Link>
      ) : (
        <button className="place" type="button" onClick={onVillage} aria-label={place.label}>
          {body}
        </button>
      )}
    </motion.div>
  )
}

/**
 * Carte du village. `villagePanel` est le panneau ouvert par l'hôtel de ville et les bâtiments
 * de production ; il est fourni par la page, qui l'obtient du module Village. Sans interaction,
 * la carte sert de décor animé, par exemple derrière l'écran de connexion.
 */
export function WorldMap({
  villagePanel,
  interactive = true,
  cover = false,
}: {
  villagePanel?: ReactNode
  interactive?: boolean
  cover?: boolean
}) {
  const frame = useRef<HTMLDivElement>(null)
  const scale = useScale(frame, cover)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div
        ref={frame}
        className="map-frame"
        style={
          cover
            ? { position: 'absolute', inset: 0, width: '100%', height: '100%' }
            : { width: W * scale, height: H * scale }
        }
      >
        <div
          className="map"
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            ...(cover
              ? {
                  left: '50%',
                  top: '50%',
                  translate: `${(-W * scale) / 2}px ${(-H * scale) / 2}px`,
                }
              : {}),
          }}
        >
          <div className="paths">
            {PATHS.map(([x, y, w, h]) => (
              <span
                key={`${x}-${y}`}
                className="path"
                style={{ left: x, top: y, width: w, height: h }}
              />
            ))}
          </div>

          {DECOR.map((item) => (
            // biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation
            <img
              key={`${item.src}-${item.x}-${item.y}`}
              className="decor pixel"
              src={item.src}
              alt=""
              style={{ left: item.x, top: item.y, zIndex: item.y + 16 }}
            />
          ))}

          {/* Décors animés : ondes de la mare, moulin, fumée de la forge, drapeaux. */}
          <span className="decor" style={{ left: 22, top: 108, zIndex: 120 }}>
            <Sprite src={`${A}/ripples.png`} w={16} h={16} sheet={[64, 16]} frames={4} fps={4} />
          </span>
          <span className="decor" style={{ left: 50, top: 98, zIndex: 134 }}>
            <Sprite src={`${A}/watermill.png`} w={34} h={36} sheet={[102, 36]} frames={3} fps={5} />
          </span>
          <span className="decor" style={{ left: 104, top: 8, zIndex: 200 }}>
            <Sprite src={`${A}/smoke.png`} w={32} h={32} sheet={[192, 32]} frames={6} fps={6} />
          </span>
          <span className="decor" style={{ left: 192, top: 64, zIndex: 90 }}>
            <Sprite src={`${A}/flag-red.png`} w={16} h={16} sheet={[64, 16]} frames={4} fps={6} />
          </span>
          <span className="decor" style={{ left: 272, top: 64, zIndex: 90 }}>
            <Sprite src={`${A}/flag-blue.png`} w={16} h={16} sheet={[64, 16]} frames={4} fps={6} />
          </span>
          <span className="decor" style={{ left: 386, top: 108, zIndex: 150 }}>
            <Sprite
              src="/assets/actors/donkey.png"
              w={16}
              h={16}
              sheet={[32, 16]}
              frames={2}
              fps={2}
            />
          </span>
          <span className="decor" style={{ left: 458, top: 108, zIndex: 150 }}>
            <Sprite
              src="/assets/actors/horse.png"
              w={16}
              h={16}
              sheet={[32, 16]}
              frames={2}
              fps={2}
            />
          </span>
          <span className="decor" style={{ left: 182, top: 128, zIndex: 150 }}>
            <Sprite
              src="/assets/actors/chicken.png"
              w={16}
              h={16}
              sheet={[32, 16]}
              frames={2}
              fps={3}
            />
          </span>

          {PLACES.map((place) => (
            <PlaceView
              key={place.id}
              place={place}
              interactive={interactive}
              onVillage={() => setOpen(true)}
            />
          ))}

          {/* Habitants du village. */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 160, pointerEvents: 'none' }}>
            <Walker name="villager" y={150} from={10} to={190} />
            <Walker name="woman" y={154} from={400} to={262} speed={12} />
            <Walker name="villager-2" y={150} from={300} to={330} speed={8} />
            <Idler name="knight" x={190} y={82} />
            <Idler name="hunter" x={136} y={90} delay={0.4} />
            <Idler name="old-man" x={366} y={98} delay={0.8} />
            <Idler name="noble" x={142} y={206} delay={0.2} />
            <Idler name="skull" x={448} y={190} monster delay={0.6} />
          </div>
        </div>
      </div>
      {villagePanel && (
        <Modal open={open} onClose={() => setOpen(false)} title="Village">
          {villagePanel}
        </Modal>
      )}
    </>
  )
}
