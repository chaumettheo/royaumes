'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { appear, ScreenTitle } from '@/ui/screen'
import { Sprite } from '@/ui/sprite'
import { look } from '@/ui/theme'
import { useCountdown } from '@/ui/use-countdown'
import type { ForgeApi } from './api'
import {
  type Amounts,
  type ForgeError,
  type ForgeView,
  forgeStream,
  MAX_PER_RECIPE,
  type RecipeId,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<ForgeApi>('/api/forge')

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ForgeError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Recette inconnue.',
  UNKNOWN_RECIPE: 'Recette inconnue.',
  FORGE_BUSY: 'La forge est déjà occupée.',
  TOO_MANY_ITEMS: `Vous possédez déjà ${MAX_PER_RECIPE} exemplaires de cet objet.`,
  NOT_FORGING: "Aucune fabrication en cours n'est à annuler.",
  ITEM_NOT_FOUND: 'Objet introuvable.',
}

/** Recette du livre, telle que la renvoie l'API. */
interface RecipeEntry {
  recipe: RecipeId
  cost: Amounts
  durationMs: number
}

/** Affiche des quantités de ressources : « 40 bois, 20 pierre ». */
function AmountsText({ amounts }: { amounts: Amounts }) {
  return (
    <>
      {Object.entries(amounts).map(([resource, amount], index) => (
        <span key={resource}>
          {index > 0 && ', '}
          {amount} <Entity kind={resource} />
        </span>
      ))}
    </>
  )
}

/** Écran de la Forge : livre des recettes, fabrication en cours et inventaire. */
export function ForgeScreen({ userId }: { userId: string }) {
  const [view, setView] = useState<ForgeView | undefined>(undefined)
  const [recipes, setRecipes] = useState<RecipeEntry[]>([])
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  // REQUÊTE : la consultation enregistre un achèvement échu, sans tâche de fond.
  const refresh = useCallback(async () => {
    const res = await client.index.$get()
    if (!res.ok) return
    const body = await res.json()
    setView(body.view)
    setRecipes(body.recipes)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : le canal personnel de la forge annonce chaque événement ; la vue est relue.
  const status = useChannel(forgeStream(userId), refresh)

  // Le compte à rebours relit la vue à l'échéance : l'objet apparaît dans l'inventaire.
  const remaining = useCountdown(view?.forging?.readyAt ?? null, refresh)

  // COMMANDES : chaque réponse contient la vue de la forge, ou une erreur.
  async function handle(res: Response, success: string) {
    const body = (await res.json()) as { view: ForgeView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
      return
    }
    setView(body.view)
    if (!body.view.forging && body.view.missing) {
      const missing = Object.entries(body.view.missing)
        .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
        .join(', ')
      setMessage({ text: `Fabrication refusée : il vous manque ${missing}.`, error: true })
    } else {
      setMessage({ text: success, error: false })
    }
  }

  const craft = async (recipe: RecipeId) =>
    handle(await client.craft.$post({ json: { recipe } }), `${look(recipe).label} au feu.`)
  const cancel = async () =>
    handle(await client.cancel.$post(), 'Fabrication annulée : ressources rendues.')
  const smelt = async (id: string) =>
    handle(
      await client.items[':id'].smelt.$post({ param: { id } }),
      'Objet fondu : la moitié des ressources est rendue.',
    )

  // Avancement de la fabrication en cours, de 0 à 1, d'après la durée de sa recette.
  const forging = view?.forging
  const duration = recipes.find((entry) => entry.recipe === forging?.recipe)?.durationMs ?? 0
  const progress =
    forging?.status === 'forging' && remaining !== null && duration > 0
      ? Math.min(1, 1 - (remaining * 1000) / duration)
      : 0

  return (
    <>
      <ScreenTitle kind="forge" status={status}>
        Forge
      </ScreenTitle>

      <AnimatePresence>
        {message && (
          <motion.p
            key={message.text}
            className={message.error ? 'toast error' : 'toast'}
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {message.text}
          </motion.p>
        )}
      </AnimatePresence>

      <motion.section className="panel" aria-label="Fabrication en cours" {...appear}>
        <h2>Le four</h2>
        <div className="forge-fire">
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
            <img
              className="pixel"
              src="/assets/map/furnace.png"
              alt=""
              aria-hidden="true"
              style={{ height: 128 }}
            />
            {forging && (
              <span style={{ position: 'absolute', left: 16, top: -40 }}>
                <Sprite
                  src="/assets/map/smoke.png"
                  w={32}
                  h={32}
                  sheet={[192, 32]}
                  frames={6}
                  fps={8}
                  scale={2}
                />
              </span>
            )}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            {!forging && <p className="muted">La forge est libre : choisissez une recette.</p>}
            {forging && (
              <>
                <p>
                  <Entity kind={forging.recipe} size="2em" /> {look(forging.recipe).label}{' '}
                  <span className="muted">
                    {forging.status === 'loading'
                      ? '(en attente des ressources)'
                      : `(prête dans ${remaining ?? '?'} s)`}
                  </span>
                </p>
                <div className="bar" aria-hidden="true">
                  <motion.span
                    animate={{ width: `${progress * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                  />
                </div>
                {forging.status === 'forging' && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.93 }}
                    onClick={cancel}
                    style={{ marginTop: 10 }}
                  >
                    Annuler
                  </motion.button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.section>

      <section className="panel" aria-label="Recettes">
        <h2>Recettes</h2>
        <div className="recipes">
          {recipes.map((entry, index) => (
            <motion.div
              key={entry.recipe}
              className="recipe"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -3 }}
            >
              <Entity kind={entry.recipe} size="48px" />
              <strong>{look(entry.recipe).label}</strong>
              <span>
                <AmountsText amounts={entry.cost} />
              </span>
              <span className="muted">{entry.durationMs / 1000} s</span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.93 }}
                disabled={Boolean(forging)}
                onClick={() => craft(entry.recipe)}
              >
                Forger
              </motion.button>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="panel dark" aria-label="Inventaire">
        <h2>Inventaire</h2>
        {view?.inventory.length === 0 && <p className="muted">Aucun objet forgé.</p>}
        <ul className="inventory">
          <AnimatePresence initial={false}>
            {view?.inventory.map((item) => (
              <motion.li
                key={item.itemId}
                className="slot"
                layout
                initial={{ opacity: 0, scale: 0.4, rotate: -20 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.3, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 18 }}
              >
                <Entity kind={item.recipe} size="36px" />
                <span>{look(item.recipe).label}</span>
                <button type="button" onClick={() => smelt(item.itemId)}>
                  Fondre
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </>
  )
}
