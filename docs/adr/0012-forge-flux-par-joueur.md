# ADR-0012 - Une Forge fondée sur le flux du joueur, sans modèle de lecture, et une saga simple avec le Village

- Statut : accepté
- Date : 2026-10-23

## Contexte

La Forge permet à un joueur de fabriquer des objets à partir de recettes, en consommant des
ressources de son village, puis de fondre les objets dont il ne veut plus
(`docs/evaluation/fiche-cadrage-forge.md`).

Toutes ses données ne concernent qu'un joueur : sa fabrication en cours et son inventaire. Aucun
autre joueur n'a à les consulter, à la différence des caravanes, qui concernent un expéditeur et
un destinataire (ADR-0010).

Deux règles portent sur l'ensemble de la forge d'un joueur : une seule fabrication à la fois, et
trois exemplaires au plus d'une même recette. Les ressources appartiennent au Village, qui sait
déjà prélever et verser pour un autre module (ADR-0007, ADR-0011).

## Décision

La Forge est conservée dans le journal d'événements, selon le modèle decider
(`src/modules/forge/domain/forge.ts`), avec un flux par joueur, `forge-<joueur>`. Les deux règles
de la forge y sont vérifiées par `decide`, sous la protection de la concurrence optimiste.

La vue du joueur est reconstruite à partir de son seul flux : le module n'a ni projection, ni table,
ni schéma de base.

L'achèvement d'une fabrication est constaté sans tâche de fond : chaque décision enregistre d'abord
un achèvement échu, daté de son échéance, et la vue présente déjà l'objet comme achevé.

La communication avec le Village est une saga d'une étape compensable : la demande de
fabrication prélève les ressources de la recette (`realm.withdraw`, réponse sur
`forge.transfer-result`), l'annulation les rend toutes (`realm.deposit`), et la fonte d'un objet
en rend la moitié. Chaque mouvement porte un identifiant stable, `forge:<joueur>:<fabrication>:<étape>`.

Le module déclare un canal temps réel personnel, `forge-<joueur>`, réservé à son propriétaire,
sur le modèle de celui du Village : ses événements lui sont transmis en entier.

## Conséquences

### Positives

- Le module est plus simple que la Caravane : un seul flux suffit à la vue, sans projection à tenir
  ni cohérence différée pour le joueur lui-même.
- Les deux règles de la forge sont garanties même lors de commandes simultanées.
- Aucune donnée nominative n'est recopiée dans les événements : il n'y a rien à réécrire lors de
  la suppression d'un compte.
- Le Village n'a pas été modifié, pour la seconde fois : il sert désormais trois demandeurs.

### Négatives

- Chaque commande et chaque consultation rejouent tout l'historique de la forge du joueur
  (dette DT-016).
- Aucun autre joueur ne peut voir l'inventaire d'un joueur : un futur classement des objets
  demanderait une projection.
- Les objets n'ont encore aucun effet dans le jeu : la Forge consomme des ressources contre une
  collection.
- Les durées et les coûts des recettes ont été fixés sans mesure d'équilibrage.

## Alternatives écartées

- **Tables classiques dans un schéma `forge`** : la règle d'une fabrication à la fois demanderait un
  verrou de ligne, et l'historique des fabrications serait perdu.
- **Une projection de l'inventaire** : inutile tant que seul le joueur le consulte ; son flux suffit.
- **Un flux par fabrication** : la règle d'une seule fabrication à la fois porterait sur plusieurs
  flux, et ne pourrait plus être garantie par une seule vérification de version.
- **Un canal global et discret, comme celui de la Caravane** : il annoncerait l'activité de la forge
  à tous les joueurs, sans utilité pour eux.

## Réexamen

Cette décision devra être réexaminée si les objets devaient être visibles d'autres joueurs, ou
échangés au Marché, ce qui demanderait une projection, et si un joueur dépassait quelques centaines
de fabrications, ce qui imposerait un instantané de l'état.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés par le
support ; analyse et conseil sur le choix de l'architecture ; développement réalisé étape par
étape, chaque étape étant validée pour en comprendre le fonctionnement. Le contenu a été relu et
validé.
