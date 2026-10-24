'use client'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { NAV } from '@/ui/app-shell'
import { Entity } from '@/ui/entity'
import { ZoneFade } from '@/ui/zone-fade'

/** Lieu correspondant à une adresse : une entrée de la barre des lieux, ou « Mes données ». */
function placeOf(pathname: string) {
  if (pathname.startsWith('/account')) return { kind: 'account', label: 'Mes données' }
  return NAV.find((item) => pathname.startsWith(item.href)) ?? null
}

/**
 * Transition entre deux lieux du jeu : le gabarit est recréé à chaque navigation (convention
 * template de Next.js), et la scène sort du noir avec le nom du lieu, comme l'entrée dans une
 * zone d'un jeu de rôle. Le fondu est un calque posé au-dessus de la page : aucune transformation
 * n'est appliquée à la page, ce qui fausserait la position des fenêtres modales.
 */
export default function GameTemplate({ children }: { children: ReactNode }) {
  const place = placeOf(usePathname())
  return (
    <>
      {place && <ZoneFade title={place.label} icon={<Entity kind={place.kind} size="1.4em" />} />}
      {children}
    </>
  )
}
