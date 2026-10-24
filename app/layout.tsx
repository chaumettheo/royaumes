import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import './globals.css'

// Police en pixel art monogram, de datagoblin (CC0), exposée par la variable --font-pixel.
const pixel = localFont({
  src: '../public/assets/fonts/monogram-extended.ttf',
  variable: '--font-pixel',
  display: 'swap',
})

// Métadonnées par défaut de toutes les pages : titre de l'onglet et description.
export const metadata: Metadata = {
  title: 'Royaumes',
  description: 'Jeu multijoueur - monolithe modulaire',
}

/**
 * Mise en page racine, partagée par toutes les pages de l'application.
 * Le type des propriétés est déclaré explicitement plutôt qu'au moyen du type
 * global LayoutProps généré par Next.js : ce dernier n'existe qu'après une
 * première construction, ce qui ferait échouer la vérification des types
 * sur un dépôt fraîchement cloné.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={pixel.variable}>
      <body>{children}</body>
    </html>
  )
}
