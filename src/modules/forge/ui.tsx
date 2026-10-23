'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
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

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

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

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>
          <Entity kind="forge" /> Forge
        </h1>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      {message && (
        <p className={message.error ? 'error' : 'muted'} role="status">
          {message.text}
        </p>
      )}

      <section className="panel" aria-label="Fabrication en cours">
        <h2>Fabrication en cours</h2>
        {!view?.forging && <p className="muted">La forge est libre.</p>}
        {view?.forging && (
          <div className="row">
            <span>
              <Entity kind={view.forging.recipe} /> {look(view.forging.recipe).label}{' '}
              <span className="muted">
                {view.forging.status === 'loading'
                  ? '(en attente des ressources)'
                  : `(prête dans ${remaining ?? '?'} s)`}
              </span>
            </span>
            {view.forging.status === 'forging' && (
              <button type="button" onClick={cancel}>
                Annuler
              </button>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-label="Recettes">
        <h2>Recettes</h2>
        <ul className="offers">
          {recipes.map((entry) => (
            <li key={entry.recipe}>
              <span>
                <Entity kind={entry.recipe} /> {look(entry.recipe).label} :{' '}
                <AmountsText amounts={entry.cost} />{' '}
                <span className="muted">({entry.durationMs / 1000} s)</span>
              </span>
              <button
                type="button"
                disabled={Boolean(view?.forging)}
                onClick={() => craft(entry.recipe)}
              >
                Forger
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Inventaire">
        <h2>Inventaire</h2>
        {view?.inventory.length === 0 && <p className="muted">Aucun objet forgé.</p>}
        <ul className="offers">
          {view?.inventory.map((item) => (
            <li key={item.itemId}>
              <span>
                <Entity kind={item.recipe} /> {look(item.recipe).label}
              </span>
              <button type="button" onClick={() => smelt(item.itemId)}>
                Fondre
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
