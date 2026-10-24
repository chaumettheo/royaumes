# Ressources graphiques

Toutes les ressources de ce répertoire sont dans le domaine public (licence CC0 1.0) : elles
peuvent être utilisées, modifiées et redistribuées sans condition. Leurs auteurs ne demandent
aucune attribution ; elle leur est rendue ici.

| Ressource | Auteur | Source | Licence |
| --- | --- | --- | --- |
| Bâtiments, décors, personnages, monstres, objets, cadres et boutons (`map/`, `actors/`, `icons/`, `ui/`), effets des combats (`fx/`) | Pixel-boy et AAA | [Ninja Adventure Asset Pack](https://pixel-boy.itch.io/ninja-adventure-asset-pack) (itch.io) | CC0 1.0, voir `LICENSE-ninja-adventure.txt` |
| Couronne `icons/crown.png` | Bonsaiheldin | [Gold treasure icons 16x16](https://opengameart.org/content/gold-treasure-icons-16x16) (OpenGameArt) | CC0 1.0, voir `CREDITS-gold-treasure-icons.txt` |
| Police `fonts/monogram-extended.ttf` | Vinícius Menézio (datagoblin) | [monogram](https://datagoblin.itch.io/monogram) (itch.io) | CC0 1.0, voir `fonts/CREDITS-monogram.txt` |

La couronne est reprise sans retouche de l'archive de Bonsaiheldin (fichier `9.png`). Les autres
images ont été découpées dans les planches du pack Ninja Adventure, sans retouche, à deux
exceptions :

- `ui/panel-parchment.png` : le cadre `nine_path_panel_3` dont le centre blanc est remplacé par
  la couleur du parchemin ;
- `map/dirt.png`, `map/cave-floor.png`, `icons/gold.png` et `icons/donkey.png` : une seule case
  d'une planche plus grande.

Les planches animées (`map/smoke.png`, `map/watermill.png`, `map/flag-*.png`,
`map/ripples.png`, `actors/*.png`, `fx/*.png`) sont utilisées entières : le composant `Sprite`
(`src/ui/sprite.tsx`) en fait défiler les images. Le choix de l'image de chaque entité du jeu est
fait dans la couche de thème, `src/ui/theme.ts`.
