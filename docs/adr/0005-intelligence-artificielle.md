# ADR-0005 - Intelligence artificielle déterministe, exécutée dans le domaine, sans tâche de fond

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Donjon a besoin de personnages pilotés par l'ordinateur : des monstres dont le comportement
dépend d'un niveau de difficulté choisi par l'hôte, et des compagnons qui permettent à un
joueur seul de jouer une expédition comme à plusieurs.

L'hébergement ne permet aucun processus permanent : aucune boucle de jeu ne peut s'exécuter
entre deux requêtes (ADR-0004).

L'état d'une expédition est reconstruit à partir de ses événements (ADR-0002), et une manche
échue peut être calculée lors d'une lecture sans être enregistrée, puis enregistrée plus tard
par une commande (ADR-0004) : les deux calculs doivent produire exactement le même résultat.

## Décision

Les décisions de l'intelligence artificielle sont des fonctions pures du domaine
(`monster-strategies.ts`, `companion.ts`), appelées uniquement au moment de la résolution
d'une manche, dans `resolveRound`.

Elles ne tirent au sort qu'au moyen du générateur à graine de la manche (`random.ts`).

Leurs résultats, actions des compagnons comprises, sont enregistrés dans l'événement
`RoundResolved` : la relecture d'une expédition n'exécute jamais l'intelligence artificielle.

Le choix de la cible d'un monstre est isolé derrière un port de stratégie (`MonsterStrategy`),
dont chaque niveau de difficulté fournit une mise en œuvre (`MONSTER_STRATEGIES`).

Un compagnon n'agit que si au moins un joueur a choisi une action pour la manche ; sinon, il
se défend.

L'équilibre du jeu est mesuré par la simulation d'expéditions (`simulation.ts`,
`scripts/simulate-dungeon.ts`), et protégé par des tests statistiques (`simulation.test.ts`).

## Conséquences

### Positives

- Aucune boucle de jeu ni tâche de fond : l'intelligence artificielle fonctionne sans
  processus permanent, sur n'importe quelle instance.
- La même manche produit toujours les mêmes décisions, qu'elle soit calculée lors d'une
  lecture ou enregistrée par une commande.
- Une modification ultérieure de l'intelligence artificielle ne change pas les parties déjà
  jouées, puisque ses décisions sont enregistrées dans les événements.
- Les décisions se testent sans base de données ni serveur, de manière exacte, par
  invariants et statistiquement, toujours avec les mêmes graines : aucun test instable.
- Ajouter un niveau de difficulté consiste à écrire une stratégie, sans modifier les règles
  du combat ; la vérification des types signale toute stratégie manquante.

### Négatives

- Un personnage piloté par l'ordinateur ne peut agir qu'à la résolution d'une manche : il ne
  peut ni réagir entre deux échéances, ni agir de sa propre initiative.
- La qualité de l'équilibre mesuré dépend de la règle suivie par les joueurs simulés, qui
  peut s'écarter du comportement des joueurs réels.
- L'intelligence artificielle est exécutée lors de chaque calcul d'une manche échue, y compris
  lors des lectures : son coût de calcul doit rester faible.
- Les monstres du niveau difficile connaissent les actions choisies par les héros : c'est un
  avantage voulu par les règles, qui doit rester confiné au serveur.
- Les expéditions de quatre joueurs restent faciles, même au niveau difficile, tant que le
  nombre de monstres par salle est plafonné.

## Alternatives écartées

- **Boucle de jeu exécutée par un processus permanent** : incompatible avec des fonctions
  Vercel qui s'arrêtent après chaque requête, et sans intérêt dans un jeu dont les décisions
  ne surviennent qu'à la résolution d'une manche.
- **Décisions prises par le navigateur d'un joueur** : un joueur pourrait les falsifier, et
  aucune décision ne serait prise si aucun navigateur n'était ouvert.
- **Recalcul des décisions lors de la relecture, plutôt que leur enregistrement** : toute
  modification de l'intelligence artificielle changerait rétroactivement les parties déjà
  jouées, contrairement à la règle posée dans l'ADR-0002.

## Réexamen

Cette décision devra être réexaminée si un personnage doit agir en temps réel, entre deux
échéances, ou si l'intelligence artificielle devient trop coûteuse en calcul pour être exécutée
lors d'une lecture.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
