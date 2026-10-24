'use client'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

/** Durée pendant laquelle le nom du lieu reste affiché sur le noir, en millisecondes. */
const HOLD_MS = 450

/**
 * Entrée dans un lieu, comme dans un jeu de rôle : la scène part du noir et s'éclaircit, tandis
 * que le nom du lieu apparaît puis s'efface. `scope` vaut « screen » pour tout l'écran, ou
 * « area » pour le seul bloc qui contient le composant (une salle du Donjon, par exemple).
 * Le fondu rejoue à chaque montage : changer la clé du composant le relance.
 * Il est masqué en CSS lorsque le système demande de réduire les animations : le rendu du
 * serveur et celui du navigateur restent identiques.
 */
export function ZoneFade({
  title,
  subtitle,
  icon,
  scope = 'screen',
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  scope?: 'screen' | 'area'
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), HOLD_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`zone-fade ${scope}`}
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <motion.div
            className="zone-title"
            initial={{ opacity: 0, y: 10, letterSpacing: '0.35em' }}
            animate={{ opacity: 1, y: 0, letterSpacing: '0.08em' }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {icon}
            <span>{title}</span>
          </motion.div>
          {subtitle && (
            <motion.div
              className="zone-subtitle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12, duration: 0.3 }}
            >
              {subtitle}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
