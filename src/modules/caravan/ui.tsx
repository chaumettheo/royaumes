'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RESOURCES, type Resource } from '@/modules/realm/contracts'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { appear, ScreenTitle } from '@/ui/screen'
import { Select } from '@/ui/select'
import { Actor } from '@/ui/sprite'
import { faceOf, look } from '@/ui/theme'
import { useCountdown } from '@/ui/use-countdown'
import type { CaravanApi } from './api'
import {
  type Amounts,
  CARAVAN_CHANNEL,
  type CaravanError,
  type CaravanList,
  type CaravanStatus,
  type CaravanSummary,
  type CaravanView,
  MAX_CARGO,
  type Recipient,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<CaravanApi>('/api/caravan')

/** Libellé de chaque état d'une caravane. */
const CARAVAN_STATUS: Record<CaravanStatus, string> = {
  loading: 'Chargement en cours',
  travelling: 'En route',
  refused: 'Refusée : stock insuffisant',
  delivered: 'Livrée',
  attacked: 'Attaquée par des brigands',
  recalled: 'Rappelée',
}

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<CaravanError['code'] | 'INVALID_INPUT', string> = {
  INVALID_INPUT: 'Saisie invalide : choisissez un destinataire et une cargaison.',
  SAME_PLAYER: 'Vous ne pouvez pas vous envoyer une caravane.',
  UNKNOWN_RECIPIENT: "Ce joueur n'a pas fondé de village.",
  INVALID_CARGO: 'Cargaison invalide.',
  CARGO_TOO_HEAVY: `Une caravane transporte au plus ${MAX_CARGO} unités.`,
  TOO_MANY_CARAVANS: 'Vous avez déjà trois caravanes en cours.',
  ALREADY_EXISTS: 'Caravane déjà envoyée.',
  CARAVAN_NOT_FOUND: 'Caravane introuvable.',
  NOT_TRAVELLING: "La caravane n'est pas en route.",
  TOO_LATE: 'Trop tard : la caravane a dépassé la moitié du trajet.',
  NOT_ARRIVED: "La caravane n'est pas encore arrivée.",
}

/** Délai entre deux relectures, et nombre maximal de relectures, comme pour le Marché. */
const RETRY_MS = 1_000
const MAX_READS = 10

/** Affiche des quantités de ressources : « 60 bois, 30 pierre ». */
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

/** Compte rendu d'une commande, à partir de la vue de la caravane renvoyée par l'API. */
function outcomeOf(view: CaravanView): string {
  if (view.status === 'refused' && view.missing) {
    const missing = Object.entries(view.missing)
      .map(([resource, amount]) => `${amount} ${look(resource).label.toLowerCase()}`)
      .join(', ')
    return `Caravane refusée : il vous manque ${missing}.`
  }
  return CARAVAN_STATUS[view.status]
}

/**
 * Une caravane de la liste. Le compte à rebours de son arrivée relit la liste à l'échéance :
 * la consultation constate l'arrivée, sans tâche de fond.
 */
function CaravanRow({
  caravan,
  direction,
  onArrived,
  onRecall,
}: {
  caravan: CaravanSummary
  direction: 'sent' | 'received'
  onArrived: () => void
  onRecall: (id: string) => void
}) {
  const travelling = caravan.status === 'travelling'
  const remaining = useCountdown(travelling ? caravan.arrivesAt : null, onArrived)
  const recallable =
    caravan.recallableUntil !== null && remaining !== null && Date.now() < caravan.recallableUntil

  // Avancement du trajet, de 0 à 1 : l'âne avance sur la piste à mesure que le temps passe.
  const total = caravan.arrivesAt !== null ? caravan.arrivesAt - caravan.sentAt : 0
  const progress =
    travelling && remaining !== null && total > 0 ? Math.min(1, 1 - (remaining * 1000) / total) : 1

  return (
    <motion.li
      className="card"
      data-mine={direction === 'sent' ? 'true' : undefined}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="card-main">
        <AmountsText amounts={caravan.cargo} />{' '}
        {direction === 'sent' ? `vers ${caravan.counterpart}` : `de ${caravan.counterpart}`}{' '}
        <span className="muted">
          ({CARAVAN_STATUS[caravan.status]}
          {travelling && remaining !== null && `, arrivée dans ${remaining} s`})
        </span>
        {caravan.status === 'attacked' && caravan.stolen && (
          <motion.span className="error" initial={{ scale: 0.6 }} animate={{ scale: [1.2, 1] }}>
            <Entity kind="brigands" /> volé : <AmountsText amounts={caravan.stolen} />
          </motion.span>
        )}
      </span>
      {travelling && (
        <span className="route" aria-hidden="true">
          <motion.span
            className="walker"
            animate={{ left: `calc(${progress * 100}% - ${progress * 32}px)` }}
            transition={{ duration: 1, ease: 'linear' }}
          >
            <Actor name="villager" direction="right" scale={1.4} />
          </motion.span>
        </span>
      )}
      {direction === 'sent' && recallable && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.93 }}
          onClick={() => onRecall(caravan.caravanId)}
        >
          Rappeler
        </motion.button>
      )}
    </motion.li>
  )
}

/** Écran de la Caravane : envoi d'une caravane, caravanes envoyées et reçues. */
export function CaravanScreen() {
  const [list, setList] = useState<CaravanList | undefined>(undefined)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  // Formulaire d'envoi : un destinataire et une quantité de chaque ressource.
  const [recipientId, setRecipientId] = useState('')
  const [cargo, setCargo] = useState<Record<Resource, number>>({ wood: 20, stone: 0, gold: 0 })

  // REQUÊTE : la consultation constate les arrivées échues, puis rattrape la projection.
  const refresh = useCallback(async () => {
    const res = await client.caravans.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setList(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
    client.recipients.$get().then(async (res) => {
      if (res.ok) setRecipients((await res.json()).recipients)
    })
  }, [refresh])

  // TEMPS RÉEL : même mécanisme que le Marché (TD9), la liste est relue jusqu'à ce que
  // la projection ait atteint la position de l'événement annoncé.
  const wanted = useRef(0)
  const following = useRef(false)
  const status = useChannel(CARAVAN_CHANNEL, async (event) => {
    wanted.current = Math.max(wanted.current, event.position)
    if (following.current) return
    following.current = true
    try {
      for (let read = 0; read < MAX_READS; read++) {
        if ((await refresh()) >= wanted.current) return
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS))
      }
    } finally {
      following.current = false
    }
  })

  // COMMANDES : chaque réponse contient la vue de la caravane, ou une erreur.
  async function handle(res: Response) {
    const body = (await res.json()) as { view: CaravanView } | { error: { code: string } }
    if ('error' in body) {
      setMessage({ text: ERRORS[body.error.code as keyof typeof ERRORS] ?? 'Erreur.', error: true })
    } else {
      setMessage({ text: outcomeOf(body.view), error: body.view.status === 'refused' })
    }
    await refresh()
  }

  const send = async () => {
    // Seules les ressources effectivement chargées figurent dans la cargaison.
    const loaded = Object.fromEntries(Object.entries(cargo).filter(([, amount]) => amount > 0))
    handle(await client.caravans.$post({ json: { recipientId, cargo: loaded } }))
  }
  const recall = async (id: string) =>
    handle(await client.caravans[':id'].recall.$post({ param: { id } }))

  return (
    <>
      <ScreenTitle kind="caravan" status={status}>
        Relais des caravanes
      </ScreenTitle>

      <motion.div className="panel" {...appear}>
        <h2>Affréter une caravane</h2>
        <div className="trade">
          <Select
            label="Destinataire"
            placeholder="Choisir un village"
            value={recipientId}
            onChange={setRecipientId}
            options={recipients.map((recipient) => ({
              value: recipient.playerId,
              label: recipient.villageName,
              icon: (
                // biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation
                <img
                  className="pixel select-face"
                  src={faceOf(recipient.playerId)}
                  alt=""
                  aria-hidden="true"
                />
              ),
            }))}
          />
          {RESOURCES.map((resource) => (
            <span key={resource} className="picker">
              <label htmlFor={`cargo-${resource}`}>
                <Entity kind={resource} />
              </label>
              <input
                id={`cargo-${resource}`}
                className="amount"
                type="number"
                min={0}
                value={cargo[resource]}
                onChange={(e) => setCargo({ ...cargo, [resource]: Number(e.target.value) })}
              />
            </span>
          ))}
          <motion.button type="button" onClick={send} whileTap={{ scale: 0.93 }}>
            Envoyer la caravane
          </motion.button>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          <Entity kind="brigands" /> Au plus {MAX_CARGO} unités. Les brigands guettent : plus la
          cargaison a de valeur, plus le risque d'attaque est grand.
        </p>
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
      </motion.div>

      <section className="panel" aria-label="Vos caravanes">
        <h2>Vos caravanes</h2>
        {list?.sent.length === 0 && <p className="muted">Aucune caravane envoyée.</p>}
        <ul className="cards">
          {list?.sent.map((caravan) => (
            <CaravanRow
              key={caravan.caravanId}
              caravan={caravan}
              direction="sent"
              onArrived={refresh}
              onRecall={recall}
            />
          ))}
        </ul>
      </section>

      <section className="panel" aria-label="Caravanes reçues">
        <h2>Caravanes reçues</h2>
        {list?.received.length === 0 && <p className="muted">Aucune caravane reçue.</p>}
        <ul className="cards">
          {list?.received.map((caravan) => (
            <CaravanRow
              key={caravan.caravanId}
              caravan={caravan}
              direction="received"
              onArrived={refresh}
              onRecall={recall}
            />
          ))}
        </ul>
      </section>
    </>
  )
}
