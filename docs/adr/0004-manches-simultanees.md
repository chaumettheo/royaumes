# ADR-0004 - Manches simultanées, aux échéances paresseuses, pour les combats du Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les combats du Donjon réunissent jusqu'à quatre joueurs humains. Aucun d'eux ne doit attendre
indéfiniment les autres, ni être avantagé par l'ordre dans lequel il joue : dans un tour par
tour classique, le dernier à jouer connaît les choix de ceux qui l'ont précédé.

L'hébergement sur Vercel ne permet ni minuteur en mémoire, ni tâche de fond : une fonction
s'arrête après avoir répondu, et deux requêtes successives peuvent être traitées par deux
instances différentes. Les tâches planifiées de l'offre gratuite ne s'exécutent qu'une fois
par jour.

L'état d'une expédition est reconstruit à partir de ses événements (ADR-0002) : tout calcul,
y compris un tirage au sort, doit pouvoir être reproduit à l'identique.

Les choix des joueurs doivent rester secrets jusqu'à la résolution de la manche, sans quoi
l'avantage du dernier à jouer réapparaît.

## Décision

Les héros choisissent leur action simultanément. Une manche est résolue dès que tous les
héros debout ont choisi, ou lorsque son échéance de trente secondes est atteinte ; un héros
qui n'a rien choisi se défend.

L'échéance est une donnée enregistrée dans les événements (`RoomEntered`, puis `nextDeadline`
de `RoundResolved`), et non un minuteur. Une manche échue est résolue à l'instant de son
échéance, et non à l'instant où la résolution est calculée (`settle`, dans
`src/modules/dungeon/domain/rules.ts`).

Une lecture calcule la résolution des manches échues sans rien enregistrer (`toView`) ; toute
commande commence par enregistrer cette résolution (`decide`) ; le navigateur envoie une
commande d'échéance (`CheckDeadline`) lorsque son compte à rebours atteint zéro.

Le hasard est tiré dans `decide`, avec un générateur à graine (`random.ts`) dont la graine est
dérivée de celle de l'expédition et du numéro de manche ; ses résultats (salles, dégâts) sont
enregistrés dans les événements, et `evolve` ne fait que les appliquer.

Une action porte le numéro de la manche qu'elle vise, et elle est refusée (`ROUND_OVER`) si
cette manche est déjà résolue.

## Conséquences

### Positives

- La durée d'une manche ne dépend plus du nombre de joueurs, et aucun joueur n'est avantagé
  par l'ordre de jeu.
- Aucun minuteur ni aucune tâche de fond : le fonctionnement est compatible avec l'exécution
  sans serveur, et n'importe quelle instance peut traiter n'importe quelle requête.
- Une manche est résolue de la même manière, quel que soit le moment du calcul : une lecture
  affiche exactement la résolution qu'une commande enregistrera plus tard.
- La commande d'échéance est idempotente, et les commandes simultanées de plusieurs joueurs
  sont départagées par la concurrence optimiste, sans coordination entre navigateurs.
- Avec une graine fixée, le contenu du donjon et l'issue des combats sont prévisibles, ce qui
  rend le domaine entièrement testable.

### Négatives

- Si plus aucun joueur ne se manifeste, la résolution d'une manche échue n'est jamais
  enregistrée : le journal peut être en retard sur ce qu'affichent les lectures, et une
  expédition abandonnée n'enregistre jamais sa fin (`GameEnded`).
- Les notifications des autres joueurs dépendent des navigateurs : c'est la commande
  d'échéance de l'un d'eux qui enregistre la résolution et déclenche la diffusion.
- Chaque lecture et chaque commande rejouent les manches échues, ce qui alourdit légèrement
  le calcul de la vue.
- La graine doit rester secrète : toute fuite permettrait de prévoir le contenu du donjon et
  l'issue des combats.
- L'horloge du navigateur peut différer de celle du serveur : la commande d'échéance peut
  arriver trop tôt et doit alors être renvoyée.

## Alternatives écartées

- **Tour par tour strict** : chaque héros agit à son tour, en connaissant les choix des
  précédents ; le dernier à jouer est avantagé, et la durée d'un tour croît avec le nombre
  de joueurs.
- **Minuteur en mémoire ou tâche planifiée** : un minuteur n'a nulle part où s'exécuter avec
  des fonctions qui s'arrêtent après chaque requête, et les tâches planifiées de l'offre
  gratuite ne s'exécutent qu'une fois par jour.
- **Lecture qui enregistre elle-même la résolution** : contraire à la sémantique d'une
  requête `GET`, elle provoquerait des écritures, des conflits de version et des
  notifications lors de simples consultations.
- **Tirage par `Math.random`, dont seul le résultat serait enregistré** : la résolution
  calculée lors d'une lecture, sans être enregistrée, ne pourrait pas être reproduite à
  l'identique par la commande qui l'enregistre ensuite.

## Réexamen

Cette décision devra être réexaminée si la fin d'une expédition abandonnée doit être
enregistrée (par exemple pour le classement du TD8), si un service de planification de tâches
compatible avec l'hébergement devient disponible, ou si des héros pilotés par l'ordinateur
doivent agir sans qu'aucun navigateur ne se manifeste (TD7).

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
