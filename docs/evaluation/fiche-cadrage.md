# Fiche de cadrage : la Caravane

- Auteur : Théo Chaumet
- Date : 2026-10-23
- Nom technique du module : `caravan`

## L'idée

Le joueur charge une caravane de ressources prélevées dans son village, et l'envoie au village
d'un autre joueur. La caravane voyage pendant une durée qui dépend de sa charge. À son arrivée,
elle livre sa cargaison au destinataire, à moins que des brigands ne l'attaquent en chemin : ils
en emportent la moitié, et le reste retourne à l'expéditeur. Tant qu'elle n'a pas parcouru la
moitié du trajet, l'expéditeur peut la rappeler, et récupérer toute sa cargaison.

Le module donne aux joueurs un moyen de s'entraider, ou de faire du commerce hors du Marché, au
prix d'un délai et d'un risque : plus la cargaison a de valeur, plus elle attire les brigands.

## Les règles métier

1. Le destinataire est un autre joueur que l'expéditeur.
2. La cargaison contient au moins une ressource, en quantités entières strictement positives,
   et 300 unités au plus, toutes ressources confondues.
3. Un joueur a au plus trois caravanes en cours à la fois (en chargement ou en route).
4. La caravane ne part qu'une fois les ressources prélevées dans le village de l'expéditeur ;
   si son stock est insuffisant, la caravane est refusée et rien ne part.
5. La durée du trajet croît avec la charge : une minute, plus une seconde par tranche de deux
   unités transportées.
6. L'arrivée est constatée à la première lecture ou commande qui suit l'échéance, sans tâche de
   fond ; son issue est tirée au hasard à partir d'une graine fixée au départ, et ne change donc
   pas d'une lecture à l'autre.
7. Les brigands attaquent selon une règle déterministe : la probabilité d'attaque vaut 10 %,
   plus 1 % par tranche de dix unités de valeur de la cargaison (une unité d'or vaut cinq
   unités), et ne dépasse pas 50 %.
8. Une caravane attaquée perd la moitié de chaque ressource, arrondie à l'unité inférieure ; le
   reste est reversé au village de l'expéditeur.
9. Une caravane arrivée sans encombre verse toute sa cargaison au village du destinataire.
10. L'expéditeur peut rappeler sa caravane tant qu'elle n'a pas parcouru la moitié de son
    trajet ; toute la cargaison est alors reversée à son village.
11. Chaque mouvement de ressources n'est effectué qu'une fois, même si un message est reçu
    plusieurs fois.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Envoyer une caravane à un joueur | Commande `SendCaravan` | `POST /api/caravan/caravans` |
| Rappeler une caravane en route | Commande `RecallCaravan` | `POST /api/caravan/caravans/:id/recall` |
| Consulter ses caravanes envoyées et reçues | Lecture (modèle de lecture) | `GET /api/caravan/caravans` |
| Choisir un destinataire | Lecture (villages connus) | `GET /api/caravan/recipients` |

## Le stockage envisagé

Journal d'événements, selon le modèle decider, avec un flux par expéditeur
(`caravan-<identifiant>`). L'historique des envois a une valeur de jeu (livraisons, attaques,
rappels), et le flux de l'expéditeur porte naturellement la règle des trois caravanes en cours,
sous la protection de la concurrence optimiste. Les caravanes reçues et la liste des
destinataires sont présentées par un modèle de lecture, tenu par une projection.

## La communication avec les modules existants

- Le Village, par des messages de la boîte d'envoi, sans modification de son code : un
  prélèvement chez l'expéditeur au départ (avec réponse), puis un versement au destinataire à
  l'arrivée, ou à l'expéditeur en cas d'attaque ou de rappel (étape de compensation). Chaque
  mouvement porte un identifiant dérivé de la caravane, ce qui le rend idempotent.
- Le Village encore, par la lecture de son langage publié : les événements de fondation de
  village indiquent quels joueurs peuvent recevoir une caravane.

## Les données personnelles

- Identifiants de l'expéditeur et du destinataire, cargaisons, dates et issues des envois,
  dans le journal et dans le modèle de lecture.
- Nom du village des destinataires, recopié depuis le langage publié du Village dans le modèle
  de lecture.

## Les bonus visés

1. B5 : saga avec étapes compensables (versement à l'expéditeur après une attaque ou un rappel).
2. B2 : arrivée constatée sans tâche de fond.
3. B3 : brigands pilotés par une règle déterministe et testée.
4. B4 : modèle de lecture des caravanes et des destinataires, tenu par une projection.
5. B1 : canal temps réel propre au module, réservé à l'expéditeur et au destinataire.
6. B11 : droit de rectification du nom d'un joueur.
