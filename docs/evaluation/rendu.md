# Rendu de l'évaluation

- Auteur : Théo Chaumet
- Module : `caravan`
- Adresse du déploiement : https://royaumes-rose.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/caravan/` : `domain/` (domaine pur), `application/` (service et ports), `infrastructure/` (dépôt, projection, lecteur, schéma), `api.ts`, `messages.ts`, `personal-data.ts`, entrées publiques `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` (règles `module-encapsulation`, `outside-uses-public-entries`, `application-ignores-infrastructure`) |
| E2 | `src/bootstrap/create-api.ts` (module, gestionnaires, canal, contributeur, `requireUser`, route `/caravan`) ; `app/(jeu)/caravan/page.tsx` ; `src/ui/app-shell.tsx` (entrée « Caravanes ») ; `src/ui/theme.ts` | `src/bootstrap/caravan-api.test.ts` (toutes les routes) |
| E3 | `src/modules/caravan/domain/caravan.ts`, `brigands.ts`, `saga.ts`, `view.ts`, `random.ts` : fonctions pures, sans dépendance technique | `src/modules/caravan/domain/caravan.test.ts`, `brigands.test.ts` ; `pnpm lint:archi` (règle `pure-domain`) |
| E4 | Journal d'événements, modèle decider, flux `caravan-<joueur>` (`domain/caravan.ts`, `infrastructure/event-store-caravan-repository.ts`, `withOptimisticRetry` dans `application/caravan-service.ts`) ; tables de lecture dans le schéma `caravan` (`infrastructure/schema.ts`, migration `drizzle/0013_caravane.sql`) ; ADR 0010 | « n'accepte qu'une caravane lors de deux envois simultanés à la limite » ; fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » |
| E5 | `requireUser` sur `/caravan/*` ; `api.ts` (expéditeur pris dans la session, schéma `SendCaravanInput`) ; rappel limité au flux du joueur | « refuse une requête anonyme sur chaque route (401) », « valide le destinataire et la cargaison », « refuse le rappel par un autre joueur (404) [...] » |
| E6 | Messages au Village par la boîte d'envoi (`domain/saga.ts`, `application/caravan-service.ts`, `messages.ts`, sujets `CARAVAN_TOPICS` dans `contracts.ts`) ; lecture du langage publié du Village (`VillageFounded`) dans `infrastructure/caravans-projection.ts` ; aucun import interne du Village ; ADR 0011 | « fait partir la caravane, après le prélèvement [...] », « livre la caravane à son arrivée [...] », « ignore une réponse du Village reçue deux fois » ; « propose comme destinataires les autres joueurs qui ont fondé un village » (API et projection) |
| E7 | `src/modules/caravan/personal-data.ts` (export, réécriture de `CaravanSent`, effacement des tables et retrait des destinataires), déclaré dans `create-api.ts` avant l'identité ; traitement T8 du registre des traitements | « exporte les caravanes du joueur, et efface son nom avec son compte » ; fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Règles 1 à 11 de la fiche ; quatre routes | Règle 1 : « refuse une caravane adressée à l'expéditeur lui-même » ; règle 2 : « refuse une cargaison vide, non entière ou de plus de 300 unités » ; règle 3 : « refuse une quatrième caravane en cours, mais pas après une arrivée » ; règle 4 : « fait partir la caravane une fois la cargaison prélevée [...] » et « refuse la caravane si le stock [...] ne suffit pas » ; règle 5 : « dure une minute, plus une seconde par tranche de deux unités » ; règle 6 : « n'arrive pas avant son échéance » et « est constatée sans tâche de fond, datée de l'échéance, avec la même issue à chaque lecture » ; règle 7 : tests « Brigands - probabilité d’attaque » ; règle 8 : « rend à l'expéditeur la part épargnée par les brigands » et tests « Brigands - butin » ; règle 9 : « livre toute la cargaison au destinataire lorsque les brigands n'attaquent pas » ; règle 10 : tests « Caravane - rappel » ; règle 11 : tests « Caravane - idempotence ». Routes : `src/bootstrap/caravan-api.test.ts` |
| E9 | Aucune modification de `.dependency-cruiser.cjs` ni de `src/bootstrap/architecture.test.ts` | `pnpm lint:archi` : aucune violation ; `src/bootstrap/architecture.test.ts` |
| E10 | Migration `drizzle/0013_caravane.sql`, appliquée par `pnpm vercel-build` | Parcours en production le 2026-10-23, à deux comptes de test : page `/caravan` (200), route anonyme refusée (401), destinataires proposés, envoi en route, rappel, envoi à soi-même refusé (422), canal sans données ; caravane attaquée par les brigands à l'arrivée (10 bois volés, 10 rendus à l'expéditeur). Modules existants : village, expédition ouverte, échange conclu au Marché, message dans la Taverne, classement. Compte de test créé pour l'occasion : caravane envoyée, export avec la section `caravan`, suppression (reconnexion refusée, village retiré des destinataires, expéditeur affiché « Joueur effacé »), puis caravane livrée au destinataire |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B5 | Saga avec étapes compensables : après une attaque, la part épargnée est versée à l'expéditeur ; après un rappel, toute la cargaison | `domain/saga.ts`, `domain/caravan.ts`, `application/caravan-service.ts`, `messages.ts` | « rend à l'expéditeur la part épargnée par les brigands », « rend toute la cargaison à l'expéditeur avant la moitié du trajet » (domaine) ; « rend toute la cargaison à l'expéditeur qui rappelle sa caravane avant la moitié du trajet » (API) | ADR 0011 ; `docs/architecture.md` (parcours d'une caravane) ; README (échanges entre modules) |
| B2 | Échéance gérée sans tâche de fond : l'arrivée est constatée à la première lecture ou commande qui suit l'échéance, ou par un message différé de la boîte d'envoi | `domain/caravan.ts` (`settle`, `decide`), `application/caravan-service.ts` (`list`), `domain/saga.ts` (demande `arrive`) | « est constatée sans tâche de fond, datée de l'échéance [...] », « livre la caravane à son arrivée, constatée par le seul destinataire [...] », « constate l'arrivée par la tâche quotidienne, même si personne ne consulte les caravanes » | ADR 0010 ; README |
| B3 | Personnages pilotés par l'ordinateur : les brigands, dont la décision d'attaquer est déterministe (graine tirée par le serveur) et dépend de la valeur de la cargaison | `domain/brigands.ts`, `domain/random.ts` | Tests « Brigands - probabilité d’attaque » (dont la fréquence sur 10 000 départs) et « Brigands - butin » | ADR 0010 ; revue de sécurité (C7, C8) |
| B4 | Modèle de lecture tenu par une projection, avec son point de reprise et sa version : caravanes et destinataires | `infrastructure/caravans-projection.ts` (version 1), `infrastructure/drizzle-caravans-reader.ts`, `infrastructure/schema.ts` | `src/modules/caravan/infrastructure/caravans-projection.test.ts` (dont la reconstruction) | ADR 0010 ; `docs/architecture.md` ; README (base de données) |
| B1 | Canal temps réel propre au module, `caravans`, global et discret, avec sa règle d'accès | `index.ts` (`channelPolicy`), `ui.tsx` (`useChannel`) | « annonce l'évolution des caravanes sur un canal discret, sans leur contenu » | ADR 0010 ; README (temps réel) ; revue de sécurité (C11) |

## Écarts avec la fiche de cadrage

- Bonus B1 : la fiche envisageait un canal réservé à l'expéditeur et au destinataire. Le canal
  réalisé est global et discret, sur le modèle de celui du Marché : il ne transmet aucune donnée,
  mais annonce l'activité des caravanes à tous les joueurs connectés (risque accepté C11 de la
  revue de sécurité). Un canal personnel aurait demandé une source propre au module.
- Bonus B11 (droit de rectification) : non réalisé.
- Aucun écart sur les règles métier, les commandes et les lectures.

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 277 |
| Couverture des lignes | 75 % | 75,75 % |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

Claude Code :

- documents : rédaction des documents Markdown (fiche de cadrage, ADR 0010 et 0011, revue de
  sécurité, mises à jour de l'architecture, du README, des registres et du bilan, ce document),
  à partir des éléments imposés par le support ;
- analyse et conseil : choix du module, du stockage et du mode de communication avec le Village ;
- code et tests : développement réalisé étape par étape, chaque étape étant validée pour en
  comprendre le fonctionnement.

Les résultats ont été vérifiés par `pnpm verify`, par un parcours local à deux joueurs, et par un
parcours sur le déploiement de production. Le contenu a été relu et validé.
