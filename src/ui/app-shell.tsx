'use client'
import { motion } from 'motion/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { authClient } from '@/platform/auth/client'
import { look } from './theme'

/** Lieux du jeu, présentés dans la barre d'icônes : chaque module ajouté au jeu y reçoit une entrée. */
export const NAV = [
  { href: '/village', kind: 'village', label: 'Village' },
  { href: '/dungeon', kind: 'dungeon', label: 'Donjon' },
  { href: '/ranking', kind: 'ranking', label: 'Classement' },
  { href: '/market', kind: 'market', label: 'Marché' },
  { href: '/caravan', kind: 'caravan', label: 'Caravanes' },
  { href: '/forge', kind: 'forge', label: 'Forge' },
  { href: '/tavern', kind: 'tavern', label: 'Taverne' },
]

/** Icône d'un lieu, dans une case de l'inventaire. */
function PlaceIcon({ kind }: { kind: string }) {
  const { icon, glyph } = look(kind)
  if (!icon) return <span>{glyph}</span>
  // biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation
  return <img className="pixel" src={icon} alt="" aria-hidden="true" />
}

/**
 * Cadre de l'espace de jeu, à la manière d'un jeu de rôle : en haut, le nom du royaume, les
 * ressources du village (fournies par la page, dans `hud`), la barre des lieux et le joueur.
 * La scène occupe le reste de l'écran ; la carte du village l'occupe en entier.
 */
export function AppShell({
  userName,
  hud,
  children,
}: {
  userName: string
  hud?: ReactNode
  children: ReactNode
}) {
  const pathname = usePathname()

  async function signOut() {
    // La session est supprimée côté serveur, puis la page est entièrement rechargée,
    // afin qu'aucun état de la session précédente ne subsiste dans le navigateur.
    await authClient.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="game">
      <header className="hud">
        <Link className="hud-title" href="/village">
          Royaumes
        </Link>
        <div className="hud-resources">{hud}</div>

        <nav className="hud-nav" aria-label="Lieux du royaume">
          {NAV.map((item) => (
            <motion.span key={item.href} whileHover={{ y: -3 }} whileTap={{ scale: 0.92 }}>
              <Link
                href={item.href}
                aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                aria-label={item.label}
              >
                <PlaceIcon kind={item.kind} />
                <span className="tip">{item.label}</span>
              </Link>
            </motion.span>
          ))}
        </nav>

        <div className="hud-player">
          <span className="portrait small">
            {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
            <img className="pixel" src={look('player').icon} alt="" aria-hidden="true" />
          </span>
          <span>{userName}</span>
          <Link
            href="/account"
            aria-current={pathname === '/account' ? 'page' : undefined}
            title="Mes données"
          >
            <PlaceIcon kind="account" />
            <span className="sr-only">Mes données</span>
          </Link>
          <button className="link" type="button" onClick={signOut} style={{ color: 'inherit' }}>
            Quitter
          </button>
        </div>
      </header>
      <main className={pathname === '/village' ? 'stage wide map-viewport' : 'stage'}>
        {children}
      </main>
    </div>
  )
}
