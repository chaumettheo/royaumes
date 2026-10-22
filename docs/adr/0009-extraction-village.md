# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-21

## Contexte

L'ADR-0001 a retenu un monolithe modulaire, en promettant des frontières entre modules assez
strictes pour qu'un module puisse un jour être extrait en service autonome, sans réécriture.
Cette promesse n'avait jamais été vérifiée.

Les raisons habituelles d'extraire un module sont une montée en charge indépendante,
l'autonomie de plusieurs équipes, une cadence de déploiement propre, l'isolation des pannes ou
des failles, et le besoin d'une technologie différente. Aucune ne s'applique aujourd'hui au jeu,
développé par une seule personne et joué par quelques dizaines de joueurs.

Le Village est le candidat désigné : son domaine ne dépend d'aucun autre module, il ne lit les
données d'aucun autre module, et sa relation avec le Marché passe déjà par les messages de la
saga (ADR-0007). L'inventaire de ses dépendances en compte toutefois deux qui ne passent pas par
le code : le Classement et le canal temps réel du village lisent ses événements directement dans
le journal commun, en s'appuyant sur son langage publié (ADR-0006).

## Décision

Le Village peut s'exécuter dans un service autonome (`src/services/village/`), doté de sa propre
base, de son propre journal et de sa propre boîte d'envoi.

L'application devient alors une passerelle : la racine de composition reçoit une version
distante du module Village (`src/modules/realm/remote.ts`), de même forme que la version
exécutée dans le processus (API, règle du canal, gestionnaires de messages, données
personnelles).

Les messages de la saga franchissent la frontière par une boîte de réception
(`src/platform/outbox/inbox-api.ts`) : un message n'est marqué comme traité qu'à la réception
d'une réponse de succès, et les garanties de la boîte d'envoi sont inchangées.

Un relais recopie le flux d'événements publié par le service (`GET /events`) dans le journal de
l'application, où le Classement et le canal temps réel continuent de le lire. Chaque copie garde
le flux et la version de l'original, ce qui rend le relais idempotent.

Les échanges entre les deux processus sont authentifiés par un secret partagé
(`SERVICE_SECRET`), qui n'est jamais versionné.

Le service n'est pas déployé : en production, le Village s'exécute dans l'application. Il n'est
utilisé que si `REALM_SERVICE_URL` et `SERVICE_SECRET` sont définies, en local.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : l'extraction n'a demandé
  aucune modification de son domaine, de son service ni des autres modules.
- Six tests de contrat (`src/bootstrap/village-service.test.ts`) vérifient ces frontières à
  chaque construction, panne du service et droits des joueurs compris.
- L'extraction est réversible sans migration de données : le relais dépose une copie complète
  des événements dans le journal de l'application, qui peut reprendre seule le Village.
- La boîte de réception et l'authentification entre services appartiennent à la plateforme, et
  serviraient telles quelles à l'extraction d'un autre module.
- Le coût réel d'une extraction est connu : un module distant, une racine de composition, un
  relais, et une panne partielle désormais possible.

### Négatives

- Deux chemins d'exécution du Village sont à maintenir : l'un dans le processus, l'autre distant.
- Le journal de l'application contient une copie des événements du Village, dont la cohérence
  est différée : un événement n'y apparaît qu'une fois relayé.
- Plusieurs raccourcis devront être traités avant tout déploiement du service (migrations
  propres, pagination du flux publié, distribution de sa boîte d'envoi) ; ils sont consignés au
  registre de la dette.
- En cas de fuite, le secret partagé permettrait de se faire passer pour n'importe quel joueur
  auprès du service.

## Alternatives écartées

- **Déployer le service** : aucune des raisons d'extraire ne s'applique aujourd'hui, et un second
  déploiement doublerait l'exploitation (base, secrets, journaux) sans aucun bénéfice.
- **Ne pas extraire** : les frontières seraient restées une hypothèse, que rien n'aurait
  vérifiée avant le jour où une extraction deviendrait nécessaire.
- **Lecture à distance du flux publié par le Classement et le canal temps réel** : elle aurait
  obligé à modifier le moteur des projections, le temps réel et le Classement, là où le relais
  ne change aucun consommateur.
- **Extraire le Marché** : sa saga lie son sort à celui du Village, et son extraction aurait
  laissé la dépendance la plus forte de part et d'autre de la frontière.
- **Jeton signé ou TLS mutuel** : plus robustes que le secret partagé, mais disproportionnés pour
  un service exécuté sur le poste de développement.

## Réexamen

Cette décision devra être réexaminée si le Village dépassait le budget de performance
(`perf/budget.json`) alors que les autres modules le respectent, si une seconde équipe était
chargée du Village, ou si le Village devait être déployé plus souvent que le reste du jeu. Un
déploiement du service exigerait alors le remboursement des dettes de l'extraction, et le
remplacement du secret partagé par un jeton signé.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
