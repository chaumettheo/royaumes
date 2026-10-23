# Revue de sécurité de la Forge : intégrité des fabrications

- Date : 2026-10-23
- Périmètre : API du module Forge, gestionnaire de ses messages et de ceux du Village, canal
  temps réel `forge-<joueur>`, contributeur des données personnelles.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and
  Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| F1 | Toutes les routes du module sont réservées aux joueurs connectés | Test « refuse une requête anonyme sur chaque route (401) » | Le test réussit : les quatre routes (`GET /api/forge`, `POST /craft`, `POST /cancel`, `POST /items/:id/smelt`) répondent 401 sans session. `requireUser` est posé sur `/forge` et `/forge/*` dans `create-api.ts`, la route de consultation étant la racine du module. | Conforme |
| F2 | Un joueur n'agit que sur sa propre forge | Lecture de `api.ts` ; test « ne permet à un joueur ni de fondre ni de voir la forge d'un autre » | Aucune route n'accepte d'identifiant de joueur : toutes utilisent `c.var.userId`. Le test réussit : Bob qui tente de fondre l'objet d'Alice reçoit 404, l'objet étant introuvable dans sa propre forge. | Conforme |
| F3 | Seules les recettes connues peuvent être demandées | Test « valide la recette, et refuse une seconde fabrication simultanée » ; test du domaine « refuse une recette inconnue » | Les tests réussissent : une recette inconnue ou absente est refusée à l'entrée de l'API (400, schéma `CraftInput` fondé sur la liste des recettes), et le domaine la refuse aussi (`UNKNOWN_RECIPE`). Le coût vient toujours de la recette, jamais de la requête. | Conforme |
| F4 | La forge ne fabrique qu'un objet à la fois, même lors de commandes simultanées | Même test | Le test réussit : deux demandes simultanées donnent une réponse 201 et une réponse 409 (`FORGE_BUSY`), et une seule recette est prélevée. La règle est vérifiée dans le flux du joueur, sous la protection de la concurrence optimiste. | Conforme |
| F5 | Aucune fabrication ne commence sans ses ressources | Test « refuse la fabrication lorsque le stock ne suffit pas, sans rien prélever » | Le test réussit : faute d'or, la fabrication d'un anneau est refusée, la forge reste libre, et le stock ne change pas. | Conforme |
| F6 | L'annulation et la fonte ne créent pas de ressources | Tests « rend toutes les ressources à l'annulation [...] » et « rend la moitié des ressources à la fonte d'un objet [...] » | Les tests réussissent : l'annulation rend exactement le coût prélevé, la fonte la moitié, arrondie à l'unité inférieure ; un objet n'est fondu qu'une fois (« ne fond qu'une fois un objet, même si la commande est répétée »). La fonte rend moins que le coût : fabriquer puis fondre fait toujours perdre des ressources. | Conforme |
| F7 | Une fabrication achevée ne peut plus être annulée | Test du domaine « refuse l'annulation sans fabrication au feu, ou après l'achèvement » | Le test réussit : à l'échéance, l'objet est achevé avant l'examen de la commande, et l'annulation est refusée (`NOT_FORGING`). Un joueur ne peut donc pas récupérer à la fois l'objet et ses ressources. | Conforme |
| F8 | Un message remis plusieurs fois n'a d'effet qu'une fois | Test du domaine « ignore une réponse du Village reçue deux fois, ou étrangère à la fabrication » ; idempotence du Village par `transferId` | Le test réussit : une réponse en double ou destinée à un autre module ne fait pas progresser la fabrication. Chaque mouvement porte un identifiant stable (`forge:<joueur>:<fabrication>:<étape>`), que le Village n'applique qu'une fois. | Conforme |
| F9 | Le canal de la forge n'est accessible qu'à son propriétaire | Tests « ne permet à un joueur ni de fondre ni de voir la forge d'un autre » et « transmet les événements de sa forge au seul joueur » | Les tests réussissent : Bob reçoit 403 sur le canal `forge-alice`, et Alice y reçoit ses propres événements. | Conforme |
| F10 | L'export contient les données de la Forge, et la suppression d'un compte n'y laisse aucun nom | Test « exporte l'inventaire et l'historique de la forge du joueur » ; lecture des événements | Le test réussit. Aucun événement de la Forge ne contient de nom : seul l'identifiant, pseudonyme, figure dans le nom du flux, comme dans les autres modules (ADR 0008). | Conforme |

## Synthèse

- 10 exigences conformes, 0 non conforme, 0 risque accepté.
- Action : un futur effet des objets en jeu (bonus de production ou de combat) devra être revu,
  car il donnerait une valeur nouvelle aux règles F4 à F7.
- Action : toute recette ajoutée doit rendre à la fonte moins que son coût, pour que fabriquer puis
  fondre ne produise jamais de ressources.
