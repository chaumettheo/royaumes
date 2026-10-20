# Revue de sécurité du parcours d'authentification

- Date : 2026-10-20
- Périmètre : inscription, connexion, déconnexion, sessions, accès à l'API et aux pages du jeu.
- Références : OWASP Top 10, OWASP ASVS.

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| S1 | Les mots de passe ne sont conservés que sous forme d'empreinte, par une fonction dédiée | Test « ne conserve qu'une empreinte du mot de passe » ; documentation de Better Auth | Le test réussit : la colonne `identity.account.password` est renseignée et ne contient pas le mot de passe. Better Auth produit l'empreinte avec scrypt, fonction dédiée aux mots de passe et salée. | Conforme |
| S2 | Les mots de passe comportent au moins 8 caractères | Test « refuse un mot de passe trop court » | `minPasswordLength: 8` dans `better-auth.ts` ; le test réussit (inscription avec « court » refusée, code 400). Le formulaire impose aussi `minLength={8}`, par simple confort. | Conforme |
| S3 | Les tentatives répétées d'inscription et de connexion sont limitées | Sous-partie 2.3 ; configuration de `better-auth.ts` | `rateLimit` actif (sauf `AUTH_RATE_LIMIT=off` hors Vercel) : 40 inscriptions et 60 connexions par minute et par adresse IP, adaptées à une classe derrière une seule adresse. Réserve : les compteurs sont conservés dans la mémoire de chaque instance, la limite réelle est donc multipliée par le nombre d'instances (dette DT-004). | Conforme |
| S4 | Le cookie de session est inaccessible au JavaScript de la page | Test sur l'attribut `HttpOnly` | Le test réussit ; en local, l'en-tête observé est `better-auth.session_token=…; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`. | Conforme |
| S5 | Le cookie de session n'est pas envoyé par les requêtes émises depuis un autre site | Test sur l'attribut `SameSite` | Le test réussit : le cookie porte `SameSite=Lax`. | Conforme |
| S6 | Le cookie de session ne circule que sur des connexions chiffrées | Inspection du cookie dans le navigateur ; comportement en local et en production | En local (`http://localhost`), le cookie ne porte pas l'attribut `Secure` (connexion non chiffrée). Better Auth l'ajoute lorsque l'application est servie en HTTPS : l'exigence ne pourra être vérifiée qu'après le déploiement du TD5. | Non conforme |
| S7 | Le secret de signature n'est pas versionné, et son absence en production empêche le démarrage | `git grep BETTER_AUTH_SECRET` ; fonction `resolveSecret` | `git grep` ne trouve que le nom de la variable, dans `.env.example` (valeur vide) et dans `better-auth.ts`, jamais une valeur. `resolveSecret` lève une erreur si la variable est absente sur Vercel en production ; la valeur de développement par défaut est explicitement nommée comme ne protégeant rien. | Conforme |
| S8 | La connexion ne révèle pas si une adresse est inscrite | Test « répond de la même manière que l'adresse existe ou non » | Le test réussit : même code (401) et même corps de réponse pour une adresse inscrite avec un mauvais mot de passe et pour une adresse inconnue. | Conforme |
| S9 | L'inscription ne révèle pas si une adresse est inscrite | Création d'un compte avec une adresse déjà utilisée | L'inscription avec une adresse existante répond 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, et la page affiche « Cette adresse est déjà utilisée. » : l'existence du compte est révélée. Risque accepté : le joueur doit savoir qu'il ne peut pas utiliser cette adresse ; le jeu ne conserve aucune donnée sensible et n'envoie aucun courrier électronique, ce qui empêcherait de répondre de manière identique dans tous les cas. | Risque accepté |
| S10 | Toute route de l'API réservée aux joueurs refuse une requête anonyme | Tests « Contrôle d'accès à l'API du Village » ; racine de composition | Les tests réussissent : lecture et commande anonymes refusées (401), sans rien enregistrer ; la route de santé reste publique. La protection est décidée module par module dans `create-api.ts` (`app.use('/realm/*', requireUser(auth))`) : l'oubli de cette ligne pour un futur module laisserait ses routes ouvertes. Ce risque est maîtrisé en accompagnant chaque module protégé d'un test de contrôle d'accès. | Conforme |
| S11 | Un joueur ne peut accéder qu'à ses propres données | Test « isole les villages des joueurs » ; origine de `userId` dans les routes | Le test réussit : alice et bob ont chacun leur village. Les routes du Village lisent `c.var.userId`, renseigné par `requireUser` à partir de la session, et jamais un identifiant fourni par le client (adresse ou corps de la requête). | Conforme |
| S12 | Les pages du jeu sont protégées sur le serveur, avant tout rendu | Mise en page `app/(jeu)/layout.tsx` ; accès à `/village` sans session | La mise en page du groupe `(jeu)` appelle `currentUser` sur le serveur et `redirect('/login')` avant tout rendu (`force-dynamic`). Sans session, `/village` répond 307 vers `/login`. | Conforme |
| S13 | Les erreurs imprévues ne révèlent aucun détail technique au client | Gestionnaire `onError` de la racine de composition | `onError` consigne l'erreur dans les journaux du serveur et renvoie seulement `{ error: { code: 'INTERNAL', message: 'Erreur interne' } }` avec le code 500. | Conforme |
| S14 | La déconnexion invalide la session sur le serveur | Réutilisation d'un cookie après déconnexion | Avec le cookie conservé par curl, la déconnexion (origine de l'application) répond 200 ; la réutilisation du même cookie sur `/api/realm/village` répond ensuite 401 `UNAUTHENTICATED`. | Conforme |
| S15 | Une requête d'authentification accompagnée d'un cookie et émise depuis une autre origine est refusée | Appel de la déconnexion avec un en-tête `origin` étranger | La déconnexion avec `origin: http://site-malveillant.example` est refusée (403 `INVALID_ORIGIN`), et sans en-tête `origin` également (403 `MISSING_OR_NULL_ORIGIN`) ; la session reste valide après ces deux appels. | Conforme |

## Synthèse

- 13 exigences conformes, 1 non conforme (S6), 1 risque accepté (S9).
- S6 : vérifier l'attribut `Secure` du cookie de session après le déploiement en HTTPS (TD5), et
  mettre à jour cette ligne.
- S3 : la limitation des tentatives est effective, mais ses compteurs ne sont pas partagés
  entre instances ; consigné dans le registre de la dette technique (DT-004).
- S10 : chaque nouveau module dont les routes sont réservées aux joueurs est ajouté dans la
  racine de composition et accompagné d'un test de contrôle d'accès.
