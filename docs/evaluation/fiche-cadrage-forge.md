# Fiche de cadrage : la Forge

- Auteur : Théo Chaumet
- Date : 2026-10-23
- Nom technique du module : `forge`

## L'idée

Le joueur fabrique des objets dans la forge de son village : une hache, un marteau, un anneau ou
une couronne. Chaque recette consomme des ressources prélevées dans son village, et demande un
temps de fabrication. L'objet rejoint ensuite son inventaire. Un objet dont le joueur ne veut plus
peut être fondu : la moitié des ressources de sa recette lui est rendue.

Le module donne un usage à l'or et aux ressources accumulées, et une collection à constituer. La
Forge complète la Caravane, qui reste le module présenté en premier dans le rendu.

## Les règles métier

1. La recette demandée existe : hache, marteau, anneau ou couronne.
2. La forge ne fabrique qu'un objet à la fois : une fabrication en cours, ou en attente de ses
   ressources, empêche d'en commencer une autre.
3. Un joueur possède au plus trois exemplaires d'une même recette.
4. La fabrication ne commence qu'une fois les ressources de la recette prélevées dans le village
   du joueur ; si son stock est insuffisant, la fabrication est refusée et rien n'est prélevé.
5. Chaque recette a sa durée de fabrication, d'une à cinq minutes.
6. L'achèvement est constaté à la première lecture ou commande qui suit l'échéance, sans tâche de
   fond ; l'objet rejoint alors l'inventaire.
7. Le joueur peut annuler une fabrication en cours : toutes les ressources prélevées lui sont
   rendues.
8. Fondre un objet de l'inventaire le retire, et rend la moitié des ressources de sa recette,
   arrondie à l'unité inférieure.
9. Chaque mouvement de ressources n'est effectué qu'une fois, même si un message est reçu
   plusieurs fois.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Consulter sa forge et son inventaire | Lecture (flux du joueur) | `GET /api/forge` |
| Lancer une fabrication | Commande `RequestForging` | `POST /api/forge/craft` |
| Annuler la fabrication en cours | Commande `CancelForging` | `POST /api/forge/cancel` |
| Fondre un objet | Commande `SmeltItem` | `POST /api/forge/items/:id/smelt` |

## Le stockage envisagé

Journal d'événements, selon le modèle decider, avec un flux par joueur (`forge-<identifiant>`). Les
règles 2 et 3 portent sur l'ensemble de la forge d'un joueur : un seul flux les garantit, sous la
protection de la concurrence optimiste. La vue du joueur est reconstruite à partir de son propre
flux : aucun modèle de lecture n'est nécessaire.

## La communication avec les modules existants

Le Village, par des messages de la boîte d'envoi, sans modification de son code : un prélèvement
au lancement d'une fabrication (avec réponse), un versement à l'annulation (étape de
compensation) et à la fonte d'un objet. Chaque mouvement porte un identifiant dérivé de la
fabrication ou de l'objet, ce qui le rend idempotent.

## Les données personnelles

L'inventaire et l'historique des fabrications du joueur, rattachés à son identifiant dans le
journal ; aucun nom n'est recopié dans les événements.

## Les bonus visés

Aucun bonus supplémentaire n'est visé : le plafond est atteint par la Caravane. Le module
déclare un canal temps réel personnel, `forge-<joueur>`, réservé à son propriétaire.
