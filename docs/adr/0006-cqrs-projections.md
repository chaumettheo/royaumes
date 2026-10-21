# ADR-0006 - CQRS : des modèles de lecture tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

Certaines lectures traversent les flux du journal : le classement, qui résume l'activité de
tous les joueurs dans le Village et le Donjon, et la liste des expéditions ouvertes. Calculées
par rejeu, comme la liste depuis le TD6, elles relisent l'historique de tout le jeu à chaque
consultation : leur coût croît sans limite avec le journal (dette DT-005).

L'hébergement ne permet aucun processus permanent (ADR-0004) : aucune tâche de fond ne peut
surveiller le journal pour tenir des tables à jour.

Le journal attribue à chaque événement une position globale, croissante mais non continue : une
insertion refusée consomme une position, et deux insertions simultanées ne sont pas
nécessairement validées dans l'ordre de leurs positions (ADR-0002).

## Décision

Les lectures transversales s'appuient sur des modèles de lecture, placés dans le schéma
PostgreSQL de leur module (`ranking.players`, `dungeon.open_games`) ; les décisions s'appuient
toujours sur le modèle d'écriture, le journal, seule source de vérité.

Chaque modèle de lecture est tenu à jour par une projection (`src/platform/projection/`), dont
le point de reprise est enregistré dans la table `platform.projections`.

Une projection est rattrapée au moment de sa consultation, dans une seule transaction, le point
de reprise étant verrouillé (`FOR UPDATE`) : un événement n'est jamais appliqué deux fois.

Le rattrapage s'arrête devant une position manquante tant que l'événement qui la suit a moins
de cinq secondes : un événement dont l'insertion est encore en cours n'est jamais dépassé.

Chaque projection porte une version : une version du code plus élevée que celle des tables
provoque leur reconstruction à partir du journal ; une version moins élevée interdit toute
écriture.

Le classement est annoncé aux navigateurs par un canal global et discret ; l'interface relit le
classement jusqu'à ce que la projection ait atteint la position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique, mais des événements nouveaux et
  des lignes lues.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le Village et le
  Donjon n'ont pas été modifiés pour le Classement.
- Une nouvelle information peut être calculée pour tout le passé, sans migration de données :
  le meilleur butin a été obtenu par une simple augmentation de version.
- Aucune tâche de fond ni opération manuelle après un déploiement : la première consultation
  rattrape ou reconstruit la projection.
- Le moteur, écrit une fois dans la plateforme, sert à tous les modules : le remboursement de
  DT-005 n'a demandé que la projection propre au Donjon.

### Négatives

- La cohérence n'est qu'à terme : un modèle de lecture peut avoir quelques secondes de retard
  sur le journal.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée sur Vercel : elle
  deviendra impossible au-delà d'une certaine taille du journal.
- Après un retour à une version précédente de l'application, une projection dont la version a
  été augmentée cesse d'avancer jusqu'au déploiement suivant.
- Le Classement dépend du langage publié des autres modules : un événement modifié ou ajouté sans
  réexamen de ses lecteurs passe inaperçu, comme l'a montré la liste des expéditions ouvertes,
  qui ignorait les compagnons.
- Deux consultations simultanées d'une même projection sont sérialisées par le verrou du point
  de reprise.

## Alternatives écartées

- **Mise à jour des modèles de lecture dans la commande, par le module qui écrit** : le Village
  et le Donjon devraient connaître toutes les projections qui les lisent, contrairement à la
  règle d'encapsulation des modules.
- **Tâche planifiée** : elle ne s'exécute qu'une fois par jour sur l'offre gratuite de Vercel ;
  les modèles de lecture seraient en retard d'une journée.
- **Processus de fond abonné au journal** : impossible sans processus permanent (ADR-0004).
- **Vue matérialisée de PostgreSQL** : chaque rafraîchissement recalcule entièrement la vue à
  partir de tout le journal, ce qui reproduit le coût du rejeu.
- **Maintien du calcul par rejeu** : c'est précisément le coût, croissant avec l'historique,
  consigné par la dette DT-005.

## Réexamen

Cette décision devra être réexaminée si une reconstruction approche la durée maximale d'une
fonction, si le nombre de consultations simultanées fait du verrou du point de reprise un goulet
d'étranglement, ou si un besoin de lecture strictement à jour apparaît.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
