# ADR-0011 - Une saga avec compensation entre la Caravane et le Village, et la lecture de son langage publié

- Statut : accepté
- Date : 2026-10-23

## Contexte

Une caravane déplace des ressources entre deux villages : elle les prélève chez l'expéditeur au
départ, puis les verse au destinataire à l'arrivée, ou à l'expéditeur si les brigands l'attaquent
ou s'il la rappelle. Les stocks appartiennent au Village, que la Caravane ne peut ni modifier
directement, ni importer en dehors de ses contrats (TD2).

La Caravane doit aussi savoir quels joueurs ont fondé un village : le Village refuse un versement à
un village inexistant, et un tel versement serait retenté, puis abandonné.

Le Village sait déjà prélever et verser des ressources pour un autre module, par des messages
idempotents qui répondent à l'adresse indiquée par le demandeur (ADR-0007). Ses événements de
fondation font partie de son langage publié, que le Classement lit déjà (ADR-0006).

## Décision

La Caravane orchestre une saga avec le Village (`src/modules/caravan/domain/saga.ts`), sans
modification du code du Village :

- le départ demande un prélèvement (`realm.withdraw`), avec la réponse attendue sur le sujet
  `caravan.transfer-result` ; un refus, faute de stock, refuse la caravane sans rien compenser ;
- l'arrivée demande un versement de toute la cargaison au destinataire (`realm.deposit`) ;
- une attaque et un rappel compensent le prélèvement : la part épargnée par les brigands, ou
  toute la cargaison, est versée à l'expéditeur.

Les événements et les messages qu'ils déclenchent sont enregistrés dans la même transaction, par la
boîte d'envoi. Chaque mouvement porte un identifiant stable, `caravan:<expéditeur>:<caravane>:<étape>`,
qui sert de clé d'idempotence au Village et désigne, dans la réponse, le flux de l'expéditeur.

La Caravane s'adresse un message différé à l'échéance de chaque caravane (`caravan.arrive`) : son
arrivée est constatée à la distribution suivante, même si personne ne consulte les caravanes.
La boîte d'envoi sert ici de minuterie, comme pour l'expiration des offres du Marché.

La Caravane lit le langage publié du Village : sa projection recense les événements
`VillageFounded` des flux `village-<joueur>`, qui désignent les destinataires possibles. Un envoi à
un joueur sans village est refusé avant tout prélèvement.

## Conséquences

### Positives

- Le Village n'a pas été modifié : la Caravane est un nouveau demandeur de ses mouvements, comme
  le Marché l'avait annoncé (ADR-0007).
- Une panne à n'importe quel moment ne crée ni ne perd de ressource : un message n'est jamais
  perdu, et un message remis plusieurs fois n'a d'effet qu'une fois.
- La compensation est explicite et testée : un rappel ou une attaque rend à l'expéditeur
  exactement ce que la caravane ne livre pas.
- L'arrivée d'une caravane est garantie sans tâche de fond, à la première consultation ou à la
  distribution suivante.

### Négatives

- La cohérence est différée : le destinataire ne voit les ressources livrées qu'une fois le
  versement distribué, et la liste des destinataires peut retarder sur les fondations récentes.
- Un versement ne peut pas être refusé dans le contrat du Village : une caravane en route vers un
  joueur qui supprime son compte perd sa cargaison (dette DT-013, revue de sécurité C12).
- La Caravane dépend du nom de l'événement `VillageFounded` et du préfixe des flux du Village :
  un changement de ce langage publié casserait la liste des destinataires sans erreur de
  compilation.
- Un message différé non distribué retarde l'arrivée jusqu'à la consultation suivante, ou
  jusqu'à la tâche quotidienne.

## Alternatives écartées

- **Appel direct du service du Village** : interdit par l'encapsulation des modules, et sujet à la
  double écriture que la boîte d'envoi évite.
- **Saga chorégraphiée** : le Village devrait connaître les événements de la Caravane, alors
  qu'il répond aujourd'hui à n'importe quel demandeur sans le connaître.
- **Nouveau sujet de versement refusable dans le Village** : il corrigerait DT-013, mais
  modifierait le contrat et les gestionnaires d'un module existant pour un cas rare ; il est
  reporté à l'échéance de la dette.
- **Demander la liste des villages au Village par un message** : une requête de lecture n'a pas
  sa place dans la boîte d'envoi, et la réponse arriverait après la requête du joueur.
- **Lire le Classement pour trouver les destinataires** : le Classement ne présente que vingt
  joueurs, et ses contrats ne sont pas faits pour cet usage.

## Réexamen

Cette décision devra être réexaminée si le Village était déployé dans un service distinct (le
relais de l'ADR-0009 couvre alors la lecture des fondations), si les versements devenaient
refusables pour d'autres raisons que l'absence de village, ou si le langage publié du Village
changeait.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés par le
support ; analyse et conseil sur le choix de l'architecture ; développement réalisé étape par
étape, chaque étape étant validée pour en comprendre le fonctionnement. Le contenu a été relu et
validé.
