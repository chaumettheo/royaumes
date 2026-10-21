# ADR-0008 - Un stockage classique pour la Taverne, et la réécriture ciblée du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

La Taverne introduit des données personnelles destinées à disparaître : des messages conservés
trente jours, et une présence qui ne vaut que le temps d'une visite. Le RGPD accorde par ailleurs
aux joueurs des droits d'accès, de portabilité et d'effacement qui portent sur le jeu entier, et
non sur un seul module.

Le jeu conserve déjà des données personnelles dans des emplacements où leur effacement est
difficile : les noms des joueurs ont été copiés dans les événements du Donjon et du Marché, et le
nom de leur village dans ceux du Village, dans des flux parfois partagés avec d'autres joueurs
(une expédition commune, une offre acceptée).

Le journal d'événements est en ajout seul (ADR-0002) : aucun événement n'est jamais modifié ni
supprimé, et les projections en dépendent pour reconstruire leurs tables (ADR-0006).

## Décision

La Taverne utilise des tables ordinaires (`tavern.messages`, `tavern.presence`), dont les lignes
sont supprimées à l'expiration de leur durée de conservation ; elle n'enregistre aucun événement.

Son canal temps réel est alimenté par une source fournie par le module (`ChannelSource`), et non
par le journal.

La présence repose sur un signal périodique du navigateur : une ligne par joueur présent,
supprimée à son départ, ou deux minutes après son dernier signal.

Les durées de conservation sont appliquées à la lecture, et chaque jour par la route des tâches
quotidiennes (`/api/cron/daily`).

Chaque module déclare ses données personnelles par un contributeur (`personal-data.ts`) : export,
réécriture de ses événements, effacement de ses tables (`src/platform/privacy/`).

L'effacement réécrit les seuls champs de nom des événements du joueur, par une fonction unique de
la plateforme (`rewriteJournal`), et le consigne dans un registre (`platform.erasures`) qui ne
contient aucune donnée sur le joueur.

L'identité est effacée en dernier, et chaque étape de l'effacement est idempotente.

## Conséquences

### Positives

- Les joueurs exercent eux-mêmes leurs droits, depuis la page « Mes données », sans intervention.
- L'effacement n'altère ni les états reconstruits, ni l'historique des autres joueurs : seuls les
  noms sont remplacés, les types, versions et autres données restent intacts.
- La durée de conservation est garantie même sans activité, grâce à la tâche quotidienne.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : ni `decide`,
  ni `evolve`, ni concurrence optimiste.
- Chaque module reste seul à connaître ses données personnelles : la plateforme n'en connaît
  aucune.

### Négatives

- La réécriture est une exception à la règle de l'ajout seul : toute modification future du
  journal devra respecter strictement ses limites (champs personnels seulement, fonction unique,
  traçabilité).
- L'export et l'effacement parcourent le journal : leur coût croît avec sa taille.
- Chaque événement futur impose une obligation nouvelle : déclarer ses champs personnels dans le
  contributeur de son module, faute de quoi ils échapperont à l'effacement.
- L'identifiant du joueur reste dans le journal : sa pseudonymisation dépend de la destruction
  effective de tout lien avec la personne, y compris hors du jeu (journaux de l'hébergeur).

## Alternatives écartées

- **Event Sourcing pour la Taverne** : un journal en ajout seul est contraire à des données
  destinées à disparaître ; l'historique des messages n'a aucune valeur pour le jeu.
- **Suppression des flux du joueur** : impossible pour les flux partagés, dont elle détruirait
  l'historique des autres joueurs.
- **Effacement cryptographique** : il exige un chiffrement dans chaque module et chaque
  projection, et ne s'applique pas aux événements déjà enregistrés en clair.
- **Références sans copie** : la meilleure conception pour l'avenir, mais elle ne règle pas le cas
  des événements déjà enregistrés avec les noms.
- **Service externe de présence (base clé-valeur en mémoire)** : une infrastructure supplémentaire,
  hors des offres gratuites retenues, pour une donnée qu'une table ordinaire gère simplement.

## Réexamen

Cette décision devra être réexaminée lors de la conception d'un nouveau module, pour lequel les
références sans copie devraient être préférées dès l'origine, si la taille du journal rendait
l'effacement trop long pour une requête, ou si la doctrine sur l'anonymisation des identifiants
pseudonymes évoluait.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
