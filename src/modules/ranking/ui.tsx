'use client'
import { hc } from 'hono/client'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type ChannelEvent, useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { appear, ScreenTitle } from '@/ui/screen'
import { faceOf } from '@/ui/theme'
import type { RankingApi } from './api'
import { RANKING_CHANNEL, type Ranking } from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<RankingApi>('/api/ranking')

/** Délai entre deux relectures, tant que la projection n'a pas atteint l'événement annoncé. */
const RETRY_MS = 1_000

/** Nombre maximal de relectures pour un même événement annoncé. */
const MAX_READS = 10

/** Écran du Classement : les meilleurs joueurs, le joueur connecté étant mis en évidence. */
export function RankingScreen({ userId }: { userId: string }) {
  // undefined : chargement en cours.
  const [ranking, setRanking] = useState<Ranking | undefined>(undefined)

  // REQUÊTE : la lecture déclenche, côté serveur, le rattrapage de la projection.
  // Renvoie la position jusqu'à laquelle le classement reçu est à jour ; 0 en cas d'échec.
  const refresh = useCallback(async () => {
    const res = await client.players.$get()
    if (!res.ok) return 0
    const body = await res.json()
    setRanking(body)
    return body.position
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Position du dernier événement annoncé, et indicateur d'une relecture en cours.
  const wanted = useRef(0)
  const following = useRef(false)

  // TEMPS RÉEL : le canal annonce un événement qui modifie le classement. Le classement est
  // relu jusqu'à ce que la projection ait atteint la position de cet événement : elle peut
  // s'être arrêtée, quelques secondes, devant une position manquante.
  const follow = useCallback(
    async (event: ChannelEvent) => {
      wanted.current = Math.max(wanted.current, event.position)
      // Une relecture est déjà en cours : elle tiendra compte de la nouvelle position.
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
    },
    [refresh],
  )

  const status = useChannel(RANKING_CHANNEL, follow)
  const entries = ranking?.entries

  const podium = entries?.slice(0, 3) ?? []
  // Ordre d'affichage du podium : deuxième, premier, troisième.
  const places = [
    { entry: podium[1], className: 'second' },
    { entry: podium[0], className: 'first' },
    { entry: podium[2], className: 'third' },
  ]

  return (
    <>
      <ScreenTitle kind="ranking" status={status}>
        Classement
      </ScreenTitle>

      {podium.length > 0 && (
        <motion.section className="panel" aria-label="Podium" {...appear}>
          <h2>Hall des héros</h2>
          <div className="podium">
            {places.map(({ entry, className }, index) =>
              entry ? (
                <motion.div
                  key={entry.playerId}
                  className={className}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 * index, type: 'spring', stiffness: 200, damping: 16 }}
                >
                  <span className="portrait">
                    {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
                    <img className="pixel" src={faceOf(entry.playerId)} alt="" aria-hidden="true" />
                  </span>
                  <strong>{entry.label}</strong>
                  <span className="muted">
                    <Entity kind="gold" /> {entry.gold}
                  </span>
                  <span className="step">{entry.rank}</span>
                </motion.div>
              ) : (
                <div key={className} className={className} style={{ visibility: 'hidden' }} />
              ),
            )}
          </div>
        </motion.section>
      )}

      <section className="panel" aria-label="Classement des joueurs">
        {entries?.length === 0 && <p className="muted">Aucun joueur classé pour le moment.</p>}
        {entries && entries.length > 0 && (
          <div className="table-scroll">
            <table className="ranking">
              <thead>
                <tr>
                  <th>Rang</th>
                  <th>Joueur</th>
                  <th>Victoires</th>
                  <th>Expéditions</th>
                  <th>
                    <Entity kind="gold" />
                  </th>
                  <th>Meilleur butin</th>
                  <th>Améliorations</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <motion.tr
                    key={entry.playerId}
                    layout
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    aria-current={entry.playerId === userId ? 'true' : undefined}
                  >
                    <td>{entry.rank}</td>
                    <td>{entry.label}</td>
                    <td>{entry.gamesWon}</td>
                    <td>{entry.gamesPlayed}</td>
                    <td>{entry.gold}</td>
                    <td>{entry.bestLoot}</td>
                    <td>{entry.upgrades}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
