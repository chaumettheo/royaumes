import { VillageScreen } from '@/modules/realm/ui'
import { WorldMap } from '@/ui/world-map'

/**
 * Page du Village : la carte du royaume, sur laquelle le joueur arrive après sa connexion.
 * L'hôtel de ville et les bâtiments de production ouvrent le panneau du village ; les autres
 * bâtiments mènent à leur module. La mise en page du groupe (jeu) garantit qu'un joueur est
 * connecté, et fournit son village.
 */
export default function VillagePage() {
  return (
    <>
      <WorldMap villagePanel={<VillageScreen />} />
      <p className="map-hint">
        Cliquez sur un bâtiment pour vous y rendre : l'hôtel de ville, la scierie, la carrière et la
        mine gèrent votre village.
      </p>
    </>
  )
}
