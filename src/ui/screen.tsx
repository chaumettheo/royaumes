'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Entity } from './entity'

/** État d'une connexion temps réel, tel que le renvoie useChannel. */
export type LiveStatus = 'connecting' | 'open' | 'reconnecting'

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS: Record<LiveStatus, string> = {
  connecting: 'Connexion...',
  open: 'Temps réel',
  reconnecting: 'Reconnexion...',
}

/** Voyant de la connexion temps réel : une lanterne allumée, clignotante ou éteinte. */
export function LiveBadge({ status }: { status: LiveStatus }) {
  return (
    <span className="status" data-status={status} title={STATUS_LABELS[status]}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}

/**
 * En-tête d'un écran du jeu : retour à la carte du village, enseigne du lieu, voyant du temps
 * réel. Chaque module l'utilise en haut de son écran.
 */
export function ScreenTitle({
  kind,
  children,
  status,
  back = '/village',
}: {
  kind: string
  children: ReactNode
  status?: LiveStatus
  /** Adresse du bouton de retour ; null pour ne pas en afficher. */
  back?: string | null
}) {
  return (
    <motion.header
      className="screen-title"
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {back && (
        <Link className="back" href={back} title="Retour">
          <span aria-hidden="true">◀</span> {back === '/village' ? 'Village' : 'Retour'}
        </Link>
      )}
      <h1 className="sign">
        <Entity kind={kind} size="1.6em" /> {children}
      </h1>
      {status && <LiveBadge status={status} />}
    </motion.header>
  )
}

/** Animation d'apparition commune aux panneaux et aux éléments de liste. */
export const appear = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 300, damping: 26 },
}
