'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { Modal } from '@/ui/modal'
import { appear, LiveBadge, type LiveStatus } from '@/ui/screen'
import { look } from '@/ui/theme'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
  villageChannel,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RealmApi>('/api/realm')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}

/** Indique si le stock couvre un coût ; faux si le coût est absent (niveau maximal). */
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

// ---------------------------------------------------------------------------
// Village partagé par le HUD et le panneau du village
// ---------------------------------------------------------------------------

interface VillageState {
  /** undefined : chargement en cours ; null : aucun village fondé. */
  view: VillageView | null | undefined
  /** Stock extrapolé à l'instant présent. */
  stock: Stock | null
  status: LiveStatus
  error: string | null
  found(name: string): Promise<void>
  upgrade(building: Building): Promise<void>
}

const VillageContext = createContext<VillageState | null>(null)

/**
 * Fournit le village du joueur à tout l'espace de jeu : une seule lecture, un seul canal temps
 * réel, et un stock extrapolé deux fois par seconde, sans interroger le serveur.
 */
export function VillageProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : lecture de la vue du village.
  const refresh = useCallback(async () => {
    const res = await client.village.$get()
    if (res.ok) setView((await res.json()).view)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : chaque événement du village, y compris s'il provient d'un autre onglet, d'un
  // autre appareil ou d'un autre module (échange, caravane, forge), provoque une relecture.
  const status = useChannel(villageChannel(userId), refresh)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  const handle = useCallback((body: { view: VillageView } | { error: ApiError }) => {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
    } else {
      setError(null)
      setView(body.view)
    }
  }, [])
  const found = useCallback(
    async (name: string) => handle(await (await client.village.$post({ json: { name } })).json()),
    [handle],
  )
  const upgrade = useCallback(
    async (building: Building) =>
      handle(await (await client.village.upgrade.$post({ json: { building } })).json()),
    [handle],
  )

  const value = useMemo<VillageState>(
    () => ({ view, stock: view ? stockAt(view, now) : null, status, error, found, upgrade }),
    [view, now, status, error, found, upgrade],
  )
  return <VillageContext.Provider value={value}>{children}</VillageContext.Provider>
}

function useVillage(): VillageState {
  const state = useContext(VillageContext)
  if (!state) throw new Error('VillageProvider manquant')
  return state
}

// ---------------------------------------------------------------------------
// Barre de ressources du HUD
// ---------------------------------------------------------------------------

/** Quantité d'une ressource : elle rebondit lorsqu'elle change d'une unité. */
function Amount({ value }: { value: number }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        {value}
      </motion.span>
    </AnimatePresence>
  )
}

/**
 * Ressources du village, toujours visibles en haut de l'écran. Sans village, le joueur est
 * invité à le fonder, dans une fenêtre qui s'ouvre d'elle-même.
 */
export function VillageHud() {
  const { view, stock } = useVillage()
  const [founding, setFounding] = useState(true)

  if (view === undefined) return <span className="muted">Chargement...</span>
  if (view === null || !stock) {
    return (
      <>
        <button type="button" onClick={() => setFounding(true)}>
          Fonder mon village
        </button>
        <Modal open={founding} onClose={() => setFounding(false)} title="Fonder votre village">
          <FoundVillage />
        </Modal>
      </>
    )
  }
  return (
    <>
      {RESOURCES.map((r) => (
        <span
          key={r}
          className="resource"
          title={`${look(r).label} : +${view.ratesPerMinute[r]} par minute`}
        >
          <Entity kind={r} />
          <Amount value={Math.floor(stock[r])} />
          <small>+{view.ratesPerMinute[r]}</small>
        </span>
      ))}
    </>
  )
}

/** Formulaire de fondation du village. */
function FoundVillage() {
  const { found, error } = useVillage()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        found(String(new FormData(e.currentTarget).get('name')))
      }}
    >
      <h2>
        <Entity kind="village" size="2em" /> Fondez votre village
      </h2>
      <p className="muted">Choisissez son nom : il sera connu de tout le royaume.</p>
      <label htmlFor="name">Nom du village</label>
      <input id="name" name="name" required minLength={2} maxLength={30} />
      <button type="submit">Fonder</button>
      {error && <p className="error">{error}</p>}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Panneau du village : production et bâtiments
// ---------------------------------------------------------------------------

/** Image de chaque bâtiment, telle qu'elle figure sur la carte du village. */
const BUILDING_ART: Record<Building, string> = {
  sawmill: '/assets/map/stump.png',
  quarry: '/assets/map/rocks.png',
  mine: '/assets/map/hut.png',
}

/** Panneau du village : stock, production, et amélioration des bâtiments. */
export function VillageScreen() {
  const { view, stock, status, error, upgrade } = useVillage()

  if (view === undefined) return <p className="muted">Chargement...</p>
  if (view === null || !stock) return <FoundVillage />

  return (
    <>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>
          <Entity kind="village" size="2em" /> {view.name}
        </h2>
        <LiveBadge status={status} />
      </div>

      <section className="stock" aria-label="Ressources" style={{ marginTop: 10 }}>
        {RESOURCES.map((r) => (
          <div key={r}>
            <Entity kind={r} size="1.6em" />
            <Amount value={Math.floor(stock[r])} />
            <small>+{view.ratesPerMinute[r]} / min</small>
          </div>
        ))}
      </section>

      <section className="buildings" aria-label="Bâtiments" style={{ marginTop: 10 }}>
        {BUILDINGS.map((b, index) => {
          const cost = view.nextCosts[b]
          return (
            <motion.div
              key={b}
              className="building"
              {...appear}
              transition={{ ...appear.transition, delay: index * 0.06 }}
            >
              <span className="art">
                {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
                <img className="pixel" src={BUILDING_ART[b]} alt="" aria-hidden="true" />
              </span>
              <span>
                {look(b).label}{' '}
                <motion.span
                  key={view.levels[b]}
                  className="level"
                  initial={{ scale: 1.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12 }}
                >
                  niv. {view.levels[b]}
                </motion.span>
                <br />
                <span className="row" style={{ gap: 8 }}>
                  {cost ? (
                    Object.entries(cost).map(([r, n]) => (
                      <span key={r} className="muted">
                        <Entity kind={r} /> {n}
                      </span>
                    ))
                  ) : (
                    <span className="muted">Niveau maximal</span>
                  )}
                </span>
              </span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                disabled={!canAfford(stock, cost)}
                onClick={() => upgrade(b)}
              >
                {view.levels[b] === 0 ? 'Construire' : 'Améliorer'}
              </motion.button>
            </motion.div>
          )
        })}
      </section>
      {error && <p className="toast error">{error}</p>}
    </>
  )
}
