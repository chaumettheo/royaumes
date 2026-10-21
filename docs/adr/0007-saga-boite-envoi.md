# ADR-0007 - Sagas orchestrées et boîte d'envoi transactionnelle pour les opérations entre modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Un échange du Marché modifie les données de trois flux appartenant à deux modules : celui de
l'offre, dans le Marché, et ceux des villages du vendeur et de l'acheteur, dans le Village. Il ne
doit ni créer ni perdre de ressources, quelles que soient les pannes ou les requêtes simultanées.

La règle d'encapsulation des modules (TD2) interdit au Marché d'écrire dans les données du
Village ou d'en dupliquer les règles, et l'extraction d'un module dans un service doté de sa
propre base de données (TD11) doit rester possible.

L'hébergement ne permet aucun processus permanent (ADR-0004) : aucun service de messagerie ni
aucune tâche de fond ne peut acheminer les messages entre les modules.

## Décision

Une transaction ne modifie jamais les données que d'un seul module.

Une opération qui concerne plusieurs modules est une saga, dont les étapes sont identifiées :
la mise en séquestre des ressources du vendeur est compensable, le paiement de l'acheteur est
l'étape pivot, les versements et la restitution sont repris jusqu'au succès.

La saga est orchestrée par le module qui porte l'opération (`src/modules/market/domain/saga.ts`).
Les participants ne connaissent pas la saga : le Village prélève et verse des ressources à la
demande, et répond à l'adresse de retour (`replyTo`) indiquée dans chaque demande.

Les messages sont enregistrés dans la boîte d'envoi de la plateforme (`platform.outbox`), dans la
même transaction que les événements qui les déclenchent.

La distribution est garantie au moins une fois : bail de trente secondes, nouvel essai avec recul
exponentiel, abandon après dix tentatives (`src/platform/outbox/outbox.ts`).

Chaque gestionnaire est idempotent, grâce à une clé d'idempotence choisie par le demandeur
(`transferId`, construit à partir de l'offre et de l'étape).

La distribution a lieu après chaque commande et chaque consultation du Marché, et chaque jour par
une tâche planifiée de Vercel, protégée par le secret `CRON_SECRET`.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : chacun n'écrit que dans ses flux et dans la
  boîte d'envoi de la plateforme.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : un message n'est
  jamais perdu, et un message remis plusieurs fois n'a d'effet qu'une fois.
- Le Village peut servir d'autres demandeurs sans modification, puisqu'il ignore les offres et
  répond à l'adresse qui lui est indiquée.
- La boîte d'envoi sert aussi de minuterie : l'expiration d'une offre est un message différé.
- Le déroulement de la saga se lit en un seul endroit, la fonction `requestsFor`.

### Négatives

- Des états intermédiaires sont visibles des joueurs, comme une offre en réservation ou en
  règlement.
- La latence dépend de l'activité : une saga interrompue ne reprend qu'à la consultation suivante
  du Marché, ou le lendemain lors de la tâche planifiée.
- Tout gestionnaire doit être idempotent, et ses doublons doivent être testés.
- Les messages abandonnés ne sont que comptés : aucun outil ne permet de les examiner ni de les
  relancer (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, les messages traités étant conservés.

## Alternatives écartées

- **Transaction unique englobant les données des deux modules** : contraire à l'encapsulation, elle
  obligerait le Marché à dupliquer les règles du Village et rendrait l'extraction d'un module
  impossible.
- **Transaction distribuée par validation en deux phases** : peu disponible dans les services
  hébergés, elle rend chaque base dépendante de la disponibilité des autres et maintient des
  verrous pendant toute la coordination.
- **Appel direct du Village par le Marché, sans boîte d'envoi** : une panne entre l'enregistrement
  de l'offre et l'appel laisserait le système incohérent (double écriture).
- **Saga chorégraphiée** : le déroulement serait réparti entre les participants, et le Village
  devrait connaître les événements du Marché.
- **Journal d'événements utilisé comme boîte d'envoi** : un message est une commande adressée à
  un destinataire, et non un fait, et sa distribution doit suivre, message par message, les
  tentatives et la dernière erreur.

## Réexamen

Cette décision devra être réexaminée lors de l'extraction d'un module dans un service distinct,
qui demanderait une boîte d'envoi par base et un transport entre services, si le volume de
messages justifiait un courtier de messages dédié, ou si la latence de la distribution déclenchée
par les requêtes ne suffisait plus.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
