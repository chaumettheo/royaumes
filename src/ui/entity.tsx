import { look } from './theme'

/**
 * Affiche une entité du jeu (ressource, bâtiment, monstre...) à partir du thème : son image en
 * pixel art, ou à défaut son symbole. L'image est masquée aux lecteurs d'écran, qui lisent le
 * libellé à la place.
 */
export function Entity({
  kind,
  showLabel = false,
  size,
}: {
  kind: string
  showLabel?: boolean
  /** Hauteur de l'image, en unités CSS ; 1.4em par défaut, pour suivre le texte. */
  size?: string
}) {
  const { glyph, label, icon } = look(kind)
  return (
    <span className="entity" title={label}>
      {icon ? (
        // biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation
        <img className="pixel" src={icon} alt="" aria-hidden="true" style={{ height: size }} />
      ) : (
        <span aria-hidden="true" style={{ fontSize: size }}>
          {glyph}
        </span>
      )}
      {showLabel ? <span>{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}
