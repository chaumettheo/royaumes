<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Royaumes — contexte du projet

Projet du module « Architecture & pilotage technique » (SupDeVinci) : jeu web multijoueur
organisé en monolithe modulaire, construit TD après TD (TD0 à TD11, puis TD final) en suivant
un support Notion. Les décisions d'architecture sont dans `docs/adr/` ; ce fichier complète les
ADR avec le contexte de travail.

## Règles de travail

- Suivre le TD **à la lettre** : code fourni repris tel quel, architecture et technos imposées,
  rien de plus que ce qui est demandé. Récapitulatif après chaque sous-partie (1.1, 1.2...).
- **Aucun commit, push ni tag par l'assistant** : le développeur les lance lui-même. À chaque
  point de commit du TD, s'arrêter et fournir la commande.
- Messages de commit en **anglais**, au format Conventional Commits (types et portées du TD0).
- Le dépôt GitHub `chaumettheo/royaumes` reste **privé** (le TD le demande public).
- Code et identifiants en anglais ; commentaires, documentation et textes affichés en français.

## Écarts connus par rapport au support

- `packageManager` vaut `pnpm@10.33.2` (version du poste), et non `pnpm@10.34.7` comme dans le TD.
- Le dépôt a été cloné avant la génération : `git init` et `git remote add origin` du TD1 1.3
  sont sans objet.
- `AGENTS.md` est conservé volontairement (le générateur a été lancé avec `--no-agents-md`,
  mais `next dev` crée le bloc ci-dessus lorsqu'il détecte un assistant).

## Avancement

### TD0 — terminé
Environnement vérifié : Node 22, pnpm 10, Git, `init.defaultBranch main`, Biome dans VS Code
(Prettier désactivé pour le projet), compte Vercel relié à GitHub.

### TD1 — en cours
- 1.1 Next.js 16.4.0 généré ; TypeScript figé en 6.0.3, `@types/node` ^22 ; alias `@/*` → `src/*`.
- 1.2 Arborescence `src/{platform,modules,bootstrap,ui}` et `docs/adr`.
- 1.3 Premier commit poussé (`chore: initialize next.js project in typescript`).
- 2.1 Hono 4.13.13 ; route unique `app/api/[[...route]]/route.ts` (runtime nodejs, force-dynamic).
- 2.2 Racine de composition : `src/bootstrap/create-api.ts` (basePath `/api`, erreurs JSON
  `INTERNAL`/`NOT_FOUND`) et `src/bootstrap/server.ts` (instance unique dans `globalThis`,
  construite à la première requête).
