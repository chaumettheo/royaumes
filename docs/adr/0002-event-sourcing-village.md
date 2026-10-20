# ADR-0002 - Event Sourcing comme mode de persistance du Village

- Statut : accepté
- Date : 2026-10-20

## Contexte

L'état d'un village (nom, stock, niveau des bâtiments) n'évolue que par une suite d'actions
successives du joueur : la fondation, puis des améliorations de bâtiments. Le domaine du
Village est déjà modélisé selon le modèle decider (ADR-0001, TD2) : une commande produit des
événements, et l'état se déduit de ces événements.

La suite du projet prévoit d'exploiter ces changements au-delà du seul module : leur
diffusion en temps réel aux navigateurs (TD5), et la construction de vues de lecture à
partir de l'activité des joueurs, comme le classement (TD8).

L'hébergement sans serveur sur Vercel implique que plusieurs instances de l'application
peuvent traiter simultanément des requêtes pour un même village, sans partager de mémoire.
Un contrôle de concurrence réalisé dans le processus de l'application ne suffit donc pas.

## Décision

L'état du village n'est pas stocké : il est reconstruit à chaque chargement en rejouant ses
événements (`replay`).

Les événements sont enregistrés dans un journal générique de la plateforme, la table
`platform.events` (`src/platform/event-store/`), en ajout seul. Chaque village dispose de son
propre flux, nommé `village-<joueur>` (`event-store-village-repository.ts`).

Les écritures concurrentes sont détectées par la contrainte d'unicité sur le couple
(flux, version) de la table. Une écriture refusée lève une `ConcurrencyError`, et la commande
entière (chargement, décision, enregistrement) est rejouée au plus trois fois
(`withOptimisticRetry`).

Chaque événement porte toutes les informations nécessaires à son application, comme le coût
effectivement payé pour une amélioration : il ne dépend d'aucune règle susceptible d'évoluer.

## Conséquences

### Positives

- L'historique complet de chaque village est conservé, et permet d'expliquer comment il a
  atteint son état actuel.
- L'état peut être reconstruit à tout moment, y compris après la correction d'une règle.
- Les mêmes événements pourront alimenter le temps réel (TD5) et des vues de lecture (TD8)
  sans modifier le module Village.
- La concurrence est garantie par la base de données elle-même, quel que soit le nombre
  d'instances de l'application, sans verrou ni attente.
- Le domaine et la couche application sont restés inchangés lors du passage de l'adaptateur
  en mémoire au journal, conformément à l'architecture hexagonale.

### Négatives

- Un événement enregistré ne peut plus être modifié : toute évolution de sa structure exige
  que le code sache lire à la fois les anciennes et les nouvelles versions.
- Chaque lecture relit et rejoue tout le flux du village ; le coût croît avec le nombre
  d'événements.
- Les questions qui portent sur plusieurs villages (par exemple les joueurs les plus riches)
  ne peuvent pas être posées directement au journal : elles exigent des vues de lecture.
- La conversion entre événements génériques du journal et événements typés du domaine repose
  sur des assertions de type, non vérifiées à l'exécution.
- Un journal dont rien n'est supprimé entre en tension avec le droit à l'effacement (RGPD).

## Alternatives écartées

- **Stockage de l'état dans une table propre au module** (une ligne par village, mise à jour
  à chaque commande) : plus simple à interroger, mais l'historique est perdu, et la diffusion
  des changements comme la construction de vues de lecture exigeraient un mécanisme
  supplémentaire pour détecter ce qui a changé.
- **Verrouillage pessimiste** (verrouiller le village dès son chargement) : il évite les
  conflits, mais au prix d'attentes et d'un verrou maintenu pendant tout le traitement, ce
  qui s'accorde mal avec une exécution sans serveur. Les conflits étant rares, les détecter à
  l'écriture est suffisant.
- **Contrôle de version dans la mémoire du processus** (comme l'adaptateur en mémoire du
  TD2) : il n'est fiable qu'au sein d'une seule instance de l'application.

## Réexamen

Cette décision devra être réexaminée si le nombre d'événements par village devient tel que
la reconstruction de l'état ralentit sensiblement les requêtes (des instantanés devraient
alors être introduits), ou si les exigences d'effacement des données imposent de modifier
le journal.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
