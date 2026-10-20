# Revue de sécurité du Donjon : dissimulation d'informations et intégrité du jeu

- Date : 2026-10-20
- Périmètre : API du module Donjon, canal temps réel des expéditions, tirages au sort.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| D1 | La vue d'une expédition ne contient ni la graine ni le contenu des salles non explorées | Test « ne transmet ni la graine ni le contenu des salles suivantes » | Le test réussit : la vue convertie en JSON, comme le fait l'API, ne contient ni la graine ni les salles suivantes. `toView` construit la vue champ par champ et n'y place que la salle courante. | Conforme |
| D2 | L'action choisie par un héros n'est connue que de son joueur jusqu'à la résolution de la manche | Tests « cache l'action choisie par les autres héros » et « ne révèle pas l'action d'un héros aux autres joueurs » ; outils de développement | Les deux tests réussissent. Vérifié en local avec deux comptes : Alice choisit un soin ; la réponse de `GET /api/dungeon/games/<id>` pour Bob indique Alice « prête » avec `action: null`, et ne contient pas le mot `heal` ; Alice voit sa propre action. La dissimulation repose sur trois protections : la vue filtrée du domaine, l'API qui ne renvoie que cette vue, et le canal réservé aux membres qui ne transmet aucune donnée. | Conforme |
| D3 | Le canal d'une expédition n'est accessible qu'à ses membres | Test « réserve le canal d'une expédition à ses membres (403) » | Le test réussit. Vérifié en local : un joueur connecté non membre reçoit 403 `FORBIDDEN` en ouvrant `/api/stream/dungeon-<id>`. La règle d'accès consulte la vue de l'expédition à l'ouverture du flux. | Conforme |
| D4 | Le canal d'une expédition ne transmet aucune donnée d'événement, ni par le flux, ni par la route de repli | Tests du bloc « Canal discret » et « signale l'action d'un héros sans la révéler » | Les tests réussissent, pour le flux comme pour la route de repli. Vérifié en local : le flux reçu par Bob ne contient que le nom du flux, la version et le type de chaque événement, avec `"data":{}`, y compris pour `ActionSubmitted` ; le mot `heal` n'y figure pas. | Conforme |
| D5 | Un joueur ne peut agir qu'en son propre nom | Lecture de `api.ts` : aucune route n'accepte d'identifiant de joueur | Dans `api.ts`, toutes les routes utilisent `c.var.userId` et `c.var.userName`, renseignés par `requireUser` à partir de la session. La requête ne fournit que l'identifiant de l'expédition (paramètre d'adresse) et, pour une action, le numéro de manche et l'action. | Conforme |
| D6 | Seul l'hôte lance l'expédition, et seul le héros dont c'est le tour ouvre une porte | Tests « ne laisse que l'hôte lancer l'expédition » et « fait ouvrir les portes à tour de rôle » | Les tests réussissent, dans le domaine (`NOT_HOST`, `NOT_YOUR_TURN`) comme à travers l'API (403). | Conforme |
| D7 | Un joueur ne peut ni choisir ni prévoir le résultat d'un tirage au sort | Lecture de `dungeon-service.ts` : graine tirée par le serveur ; exigence D1 | La graine est tirée par le serveur (`crypto.getRandomValues`) à l'ouverture de l'expédition ; aucune route ne l'accepte en entrée, et elle ne figure jamais dans la vue (D1). | Conforme |
| D8 | L'échéance d'une manche est appréciée par l'horloge du serveur | Commande d'échéance envoyée avant l'échéance | Vérifié en local : la commande d'échéance envoyée avant la fin du compte à rebours renvoie la vue avec un numéro de manche inchangé ; rien n'est enregistré. Envoyée après l'échéance, elle enregistre la résolution : le héros sans choix s'est défendu. | Conforme |
| D9 | Une action destinée à une manche déjà résolue est refusée | Test « refuse un choix pour une manche déjà résolue » | Le test réussit : l'action est refusée avec l'erreur `ROUND_OVER`, qui indique la manche en cours. | Conforme |
| D10 | Connaître l'adresse d'une expédition ne permet pas d'y agir sans en être membre | Action envoyée par un joueur qui n'est pas membre | Vérifié en local : un joueur connecté non membre qui envoie une action reçoit 403 `NOT_A_MEMBER`. Il peut en revanche consulter la vue de l'expédition : ce choix est volontaire, puisqu'il permet de rejoindre une expédition à partir de son adresse ; la vue ne contient que des informations publiques (aucune action, aucune graine, aucune salle suivante), et l'identifiant, un UUID tiré au hasard, ne peut pas être deviné. Ce risque résiduel est accepté. | Conforme |

## Synthèse

- 10 exigences conformes, 0 non conforme, 0 risque accepté en tant que tel.
- Risque résiduel accepté (D10) : un joueur qui connaît l'adresse d'une expédition peut en
  consulter la vue publique, sans pouvoir y agir ni écouter son canal.
- Action : tout nouvel événement ou champ de l'état d'une expédition doit être ajouté
  explicitement à la vue s'il est public ; la vue construite champ par champ et le canal
  discret garantissent qu'une information nouvelle reste cachée par défaut.
