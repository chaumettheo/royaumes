# ADR-0003 - Server-Sent Events, alimentés par le journal d'événements, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements sans recharger leur page : d'abord entre
les onglets ou les appareils d'un même joueur pour son village, puis entre les participants
d'une même partie du Donjon (TD6).

Les actions des joueurs passent déjà par l'API, au moyen de requêtes HTTP authentifiées par
le cookie de session (TD4) : seul un canal du serveur vers le navigateur manque.

L'application est hébergée sur Vercel, dans l'offre gratuite : la durée d'exécution d'une
fonction est plafonnée (300 secondes), plusieurs instances peuvent traiter les requêtes sans
partager de mémoire, et aucune infrastructure supplémentaire (serveur permanent, service de
messagerie) n'est disponible.

Le projet dispose d'un journal d'événements dont chaque flux porte des versions croissantes
et uniques (ADR-0002).

## Décision

Les changements sont diffusés aux navigateurs par des Server-Sent Events, sur la route
`/api/stream/<canal>` (`src/platform/realtime/stream-api.ts`).

Un canal correspond exactement à un flux du journal ; l'identifiant de chaque message est la
version de l'événement, ce qui permet au navigateur de reprendre après une interruption grâce
à l'en-tête `Last-Event-ID`, sans perte ni doublon.

Le flux relit le journal toutes les demi-secondes et ne conserve aucun état en mémoire. Il se
ferme de lui-même au bout de 240 secondes, sous la limite de Vercel, et le navigateur s'y
reconnecte automatiquement.

L'accès est réservé aux joueurs connectés (`requireUser`), et chaque module déclare la règle
d'accès à ses canaux (`ChannelPolicy`) ; un canal qu'aucune règle ne couvre est refusé.

L'interface relit sa vue auprès de l'API à chaque notification (hook `useChannel`), plutôt
que d'appliquer elle-même le contenu des événements.

## Conséquences

### Positives

- Du HTTP ordinaire : les flux traversent les intermédiaires du réseau et bénéficient de
  l'authentification par cookie, sans protocole ni configuration supplémentaire.
- La reconnexion et la reprise sont assurées nativement par `EventSource` ; la version des
  événements garantit l'absence de perte et de doublon.
- Aucun état en mémoire : n'importe quelle instance de l'application peut servir n'importe
  quel joueur, ce qui convient à l'exécution sans serveur.
- Aucune infrastructure supplémentaire : le journal est la source unique de l'état et des
  notifications.
- La relecture de la vue garde l'affichage conforme au calcul du serveur, et permettra de ne
  diffuser qu'un signal lorsque le contenu des événements ne doit pas être connu de tous.

### Négatives

- Chaque joueur connecté produit deux lectures du journal par seconde : la charge de la base
  croît avec le nombre de joueurs connectés simultanément.
- Un événement est reçu jusqu'à une demi-seconde après son enregistrement, auquel s'ajoute le
  délai de relecture de la vue.
- Chaque notification provoque une requête supplémentaire de lecture de la vue.
- Les flux sont interrompus toutes les 240 secondes ; la reconnexion est transparente, mais
  consomme une requête et une exécution de fonction supplémentaires.
- La communication est unidirectionnelle : un besoin d'échange à très faible délai du
  navigateur vers le serveur ne serait pas couvert.

## Alternatives écartées

- **WebSocket** : connexion permanente et bidirectionnelle, mais incompatible avec des
  fonctions Vercel à durée plafonnée (prise en charge expérimentale) ; elle aurait exigé un
  serveur permanent supplémentaire, contraire aux critères du projet.
- **Interrogation périodique par le navigateur** : simple, mais impose un compromis
  défavorable entre requêtes inutiles et délai de réception, et multiplie les requêtes HTTP
  complètes, authentification comprise.
- **Mécanisme de notification partagé entre instances** (`LISTEN/NOTIFY` de PostgreSQL, ou un
  service de messagerie comme Redis) : il éviterait la relecture périodique, mais exige une
  connexion permanente à la base ou une infrastructure supplémentaire, disproportionnées pour
  le nombre de joueurs du projet.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés simultanément rend les
lectures du journal sensibles pour la base, si un besoin de communication du navigateur vers
le serveur à très faible délai apparaît, ou si l'hébergeur propose une prise en charge stable
des WebSocket.

## Usage de l'IA générative

Claude Code : rédaction des documents Markdown, dont cet ADR, à partir des éléments imposés
par le support. Le contenu a été relu et validé.
