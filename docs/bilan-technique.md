# Bilan technique de Royaumes

- Date : 2026-10-21
- Version examinée : étiquette `td11-fin`
- Auteur : Théo Chaumet

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 6 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system` ; plus le service Village extrait (`src/services/village`, 82 lignes), non déployé |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` |
| Lignes de code, hors tests | 8 262 (`src/` et `app/`) |
| Fichiers de test, nombre de tests | 33 fichiers, 232 tests |
| Commits | 75 au moment de la rédaction |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 093, dont le module distant de l'extraction |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 064 |
| `market` | Event Sourcing, projection des offres, saga | 1 271 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 678 |
| `system` | Aucun | 73 |

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | A tenu : seuls cinq fichiers importaient le Village, tous par ses entrées publiques ; ni son domaine, ni son service, ni les autres modules n'ont été modifiés. Prix : un module distant d'environ 150 lignes, et deux chemins d'exécution du Village. |
| 0002 | Event Sourcing pour le Village | Projections du classement (TD8), effacement des données (TD10), relais du flux publié (TD11) | A tenu : le journal a alimenté le classement sans modifier le Village, et a pu être recopié dans un autre processus. Prix : la réécriture ciblée du TD10, exception à l'ajout seul. La relecture du flux à chaque commande reste rapide : le Village est le scénario le plus rapide du test de charge. |
| 0003 | Server-Sent Events alimentés par le journal | Déploiement sur Vercel (TD5), canaux discrets (TD6), canaux globaux (TD8), canal à source propre (TD10) | A tenu : fermeture des flux à 240 s et reprise par `Last-Event-ID` vérifiées en production ; le mécanisme a absorbé trois nouvelles formes de canaux. Non éprouvé : sa charge, deux lectures du journal par seconde et par joueur connecté, n'a jamais été mesurée. |
| 0004 | Manches simultanées et échéances paresseuses | Expédition jouée en production à deux comptes (TD6) ; tests de quatre héros simultanés | A tenu, après correction : un joueur absent pouvait bloquer l'exploration (DT-006), corrigé au TD7 par une échéance d'exploration. |
| 0005 | Intelligence artificielle déterministe | Simulation statistique (TD7) ; expédition du TD6 relue en production après l'ajout des niveaux (upcasting) | A tenu : la simulation a révélé un déséquilibre du niveau difficile, corrigé et protégé par trois tests statistiques ; aucune tâche de fond n'a été nécessaire. |
| 0006 | CQRS et projections rattrapées à la lecture | Changement de version d'une projection (meilleur butin, TD8) ; test de charge (TD11) | A tenu, après correction : la mesure a montré que chaque rattrapage, même sans rien à appliquer, ouvrait une transaction verrouillée ; le chemin rapide a augmenté le débit des lectures de 34 à 55 %. |
| 0007 | Saga orchestrée et boîte d'envoi | Panne partielle du service Village (TD11) | A tenu : la saga reprend d'elle-même après le rétablissement du service, sans code supplémentaire. Prix : les messages abandonnés n'étaient que comptés (DT-007), jusqu'au script d'exploitation du TD11. |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Export puis effacement d'un compte en production (TD10) ; relais du TD11 | A tenu : compte effacé, message disparu, « Joueur effacé » au classement ; le relais a imposé de réécrire aussi les copies relayées. Prix : export et effacement parcourent le journal, et leur coût croît avec lui. |
| 0009 | Extraction du Village, préparée mais non déployée | Six tests de contrat ; démonstration à deux processus, panne et retour arrière compris (TD11) | Décision récente : éprouvée en local seulement. Trois dettes (DT-010 à DT-012) restent à rembourser avant tout déploiement du service. |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 232 tests réussis ; domaines couverts à 99,7 % des lignes | Satisfaisante : les règles du jeu sont entièrement vérifiées, sans base ni réseau. |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 509 (Marché) à 911 (Village) requêtes par seconde ; p99 de 37 à 64 ms ; budget respecté (p99 sous 500 ms, sans erreur) | Satisfaisante en local, avec une large marge. Mesures locales seulement : la production, sa latence réseau et ses démarrages à froid n'ont pas été mesurés. |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Améliorations et héros simultanés, reprise de la saga après une panne, gestionnaires idempotents testés ; aucun message abandonné sur la base locale | Satisfaisante. Les messages abandonnés sont désormais signalés par la tâche quotidienne, et examinés par `scripts/dead-letters.ts`. |
| Sécurité | Exigences des revues de sécurité | 40 exigences : 38 conformes, 2 risques acceptés (S9, D14) | Satisfaisante. La limitation des tentatives est partagée entre instances depuis le TD11 (DT-004). |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles de dependency-cruiser, aucune violation ; 2 fonctions d'aptitude testées ; 75 % des lignes couvertes | Bonne pour le serveur. L'interface (`ui.tsx`, `src/ui/`) n'est couverte par aucun test automatique (0 %) : vérifiée à la main à chaque TD, elle peut régresser sans qu'aucune vérification ne le signale. |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait et réversible sans migration ; mêmes migrations sur PGlite et Neon | Démontrée par l'extraction ; le service n'a pas de procédure de migration propre (DT-010). |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 12 |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 5 : DT-008 et DT-009 (revue de conformité du TD10), DT-010 à DT-012 (service extrait) |

Analyse : les sept premières entrées ont toutes été remboursées au TD prévu, de DT-002 et DT-003
au TD3 jusqu'à DT-004 et DT-007 au TD11 : chacune avait été consignée au moment où le raccourci
était pris, avec son marqueur dans le code. Les trois dettes du service extrait n'ont pas
d'échéance datée : elles ne deviennent exigibles qu'au déploiement du service, qui n'est pas
décidé. En revanche, DT-008 (sessions expirées jamais purgées) et DT-009 (erreurs journalisées
avec leurs paramètres), issues de la revue de conformité du TD10, avaient pour échéance le TD11 et
n'ont pas été remboursées : ce sont les deux seules dettes en retard, et elles concernent la
production. Elles doivent être traitées en priorité, et leur échéance réévaluée dans le registre.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 15 | 1 risque accepté (S9 : l'inscription révèle qu'une adresse est déjà utilisée) | Aucune : DT-004 remboursée au TD11 |
| Sécurité du Donjon | 14 | 13 | 1 risque accepté (D14 : le canal du classement révèle les identifiants des expéditions) | Aucune dette ; règles de conception à respecter pour tout nouvel événement ou canal |
| Sécurité du Marché | 10 | 10 | 0 | Aucune : DT-007 remboursée au TD11 |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 risque accepté (R10) | DT-008 et DT-009 ; droit de rectification du nom non mis en œuvre, consigné au registre des traitements mais absent du registre de la dette |

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | La charge des flux temps réel croît avec le nombre de joueurs connectés : chaque flux relit le journal deux fois par seconde (ADR 0003) | Hausse de la consommation de calcul de Neon et de la durée des fonctions Vercel, à nombre de commandes constant | Ajouter au test de charge un scénario de flux ouverts simultanés ; au-delà du budget, remplacer la lecture périodique par une notification de la base (`LISTEN`/`NOTIFY`) ou un service temps réel dédié. |
| 2 | La croissance du journal allonge la reconstruction des projections et l'effacement d'un compte, qui le parcourent en entier (ADR 0006 et 0008) | Durée d'une reconstruction ou d'un effacement mesurée en secondes ; effacement qui approche la durée maximale d'une fonction | Mesurer ces deux durées à chaque revue ; filtrer la lecture du journal par flux et par type, puis exécuter l'effacement par lots, ou en tâche différée. |
| 3 | L'interface n'est vérifiée par aucun test automatique | Régressions signalées par les joueurs après un déploiement, en particulier sur le temps réel (`use-channel.ts`) | Ajouter des tests de bout en bout dans un navigateur sur les parcours critiques (connexion, Village, flux temps réel, échange au Marché), exécutés avant chaque déploiement. |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression côté serveur : ses frontières sont vérifiées
à chaque construction par huit règles de dépendance, deux fonctions d'aptitude et six tests de
contrat, ses domaines sont couverts presque entièrement, et chacune de ses décisions est consignée
avec ses conséquences. L'extraction du Village a montré que ces frontières étaient réelles. Trois
conditions s'y ajoutent : rembourser d'abord DT-008 et DT-009, en retard et propres à la
production ; couvrir l'interface par des tests de bout en bout avant toute évolution importante
des écrans ; mesurer la charge des flux temps réel avant toute hausse sensible du nombre de
joueurs.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont ce bilan, à partir des éléments imposés
par le support et des mesures relevées sur le projet. Le contenu a été relu et validé.
