# ADR-0010 - Un module Caravane fondé sur le journal d'événements, avec un flux par expéditeur

- Statut : accepté
- Date : 2026-10-23

## Contexte

Le module Caravane permet à un joueur d'envoyer des ressources au village d'un autre joueur
(`docs/evaluation/fiche-cadrage.md`). Une caravane passe par plusieurs états : chargement, route,
puis livraison, attaque par des brigands, rappel, ou refus faute de stock. Son issue est
tirée au hasard à son arrivée, qui survient sans action d'aucun joueur.

Les données du module ont une valeur de jeu durable : l'historique des envois, des livraisons et
des attaques est présenté à l'expéditeur comme au destinataire. Rien n'y est destiné à disparaître,
à la différence des messages de la Taverne (ADR-0008).

Plusieurs règles portent sur l'ensemble des caravanes d'un joueur, et non sur une seule : au plus
trois caravanes en cours, y compris lors d'envois simultanés.

L'hébergement ne permet aucune tâche de fond (ADR-0004) : l'arrivée d'une caravane doit être
constatée sans processus permanent.

## Décision

Les caravanes sont conservées dans le journal d'événements, selon le modèle decider
(`src/modules/caravan/domain/caravan.ts`) : `decide` et `evolve` sont des fonctions pures,
et les six événements du module (`CaravanSent`, `CaravanDeparted`, `CaravanRefused`,
`CaravanArrived`, `CaravanAttacked`, `CaravanRecalled`) forment son langage publié.

Toutes les caravanes d'un expéditeur forment un seul flux, `caravan-<joueur>`. La limite de
trois caravanes en cours y est vérifiée par `decide`, sous la protection de la concurrence
optimiste (`withOptimisticRetry`).

L'arrivée est constatée sans tâche de fond, comme les échéances du Donjon (ADR-0004) : chaque
décision constate d'abord les arrivées échues, datées de leur échéance et non de l'instant où
elles sont constatées.

Le tirage des brigands est déterministe (`domain/brigands.ts`) : une graine est tirée par le
serveur à l'envoi et enregistrée dans l'événement ; la probabilité d'attaque ne dépend que de la
valeur de la cargaison (de 10 % à 50 %). Une même caravane a donc la même issue à chaque lecture,
et cette issue ne peut pas être relancée par une nouvelle consultation.

### Modèle de lecture

Les caravanes reçues par un joueur ne figurent pas dans son flux, mais dans celui de leur
expéditeur. Une projection, `caravan-caravans` (version 1), tient deux tables du schéma
`caravan` : `caravans`, l'historique des caravanes, et `recipients`, les joueurs qui ont fondé un
village. Elle est rattrapée à la lecture, avec son point de reprise (ADR-0006). Elle désigne aussi
au service les caravanes échues en route vers un joueur, dont il constate l'arrivée dans le flux de
leur expéditeur lorsque seul le destinataire consulte ses caravanes.

### Canal temps réel

Le module déclare un canal global et discret, `caravans`, sur le modèle de celui du Marché : il
annonce le type et la position des événements des caravanes, sans leurs données, et chaque
navigateur relit sa propre liste.

## Conséquences

### Positives

- Une seule source de vérité, dont l'historique est présenté sans table supplémentaire à
  maintenir : la projection peut être vidée et reconstruite à tout moment.
- La limite de caravanes en cours est garantie même lors d'envois simultanés, sans verrou
  explicite : l'un des envois échoue sur un conflit de version, puis est rejoué sur l'état à jour.
- L'issue d'un trajet est reproductible et testable : les tests fixent la graine, et vérifient
  l'attaque comme la livraison.
- Le domaine est entièrement testable sans base ni réseau.

### Négatives

- Chaque commande et chaque consultation rejouent tout le flux de l'expéditeur, dont la taille croît
  avec le nombre de caravanes envoyées depuis son inscription (dette DT-015).
- Le générateur pseudo-aléatoire du Donjon a dû être recopié : les règles de dépendance
  interdisent d'importer le domaine d'un autre module (dette DT-014).
- Le destinataire dépend d'un modèle de lecture pour voir ses caravanes : une caravane qui vient
  de partir peut ne lui apparaître qu'après le rattrapage de la projection.
- La graine, conservée dans le journal, permettrait à qui lit la base de prévoir les attaques ;
  elle n'est jamais transmise aux joueurs.

## Alternatives écartées

- **Tables classiques dans le schéma `caravan`** : l'historique devrait être maintenu à la main,
  et la limite de caravanes en cours demanderait un verrou de ligne ; l'Event Sourcing fournit
  les deux.
- **Un flux par caravane, comme une offre du Marché** : la limite de trois caravanes en cours
  porterait alors sur plusieurs flux, et ne pourrait plus être garantie par une seule vérification
  de version.
- **Tirage avec `Math.random` au moment de l'arrivée** : l'issue changerait d'une lecture à
  l'autre tant qu'elle n'est pas enregistrée, et ne serait pas testable.
- **Arrivée constatée par une tâche planifiée** : la tâche de Vercel ne s'exécute qu'une fois par
  jour, et ajouterait une journée de retard à chaque livraison.
- **Canal personnel au joueur** : il demanderait une source propre au module, comme la Taverne ;
  le canal discret suffit, au prix de l'annonce de l'activité des caravanes à tous les joueurs
  connectés (revue de sécurité, C11).

## Réexamen

Cette décision devra être réexaminée si un expéditeur dépassait mille caravanes envoyées, ce qui
imposerait un instantané de l'état ; si un troisième module avait besoin de tirages reproductibles,
ce qui justifierait de placer le générateur dans la plateforme ; ou si le rythme des envois devenait
une information sensible.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés par le
support ; analyse et conseil sur le choix de l'architecture ; développement réalisé étape par
étape, chaque étape étant validée pour en comprendre le fonctionnement. Le contenu a été relu et
validé.
