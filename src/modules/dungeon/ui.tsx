'use client'
import { hc } from 'hono/client'
import { AnimatePresence, motion } from 'motion/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import { appear, ScreenTitle } from '@/ui/screen'
import { Actor, Sprite } from '@/ui/sprite'
import { faceOf } from '@/ui/theme'
import { useCountdown } from '@/ui/use-countdown'
import { ZoneFade } from '@/ui/zone-fade'
import type { DungeonApi } from './api'
import {
  type Action,
  DIFFICULTIES,
  type Difficulty,
  type Effect,
  type GameError,
  type GameView,
  gameChannel,
  MAX_HEROES,
  MONSTERS,
  type Monster,
  type OpenGame,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<DungeonApi>('/api/dungeon')

/** Erreurs que l'API peut renvoyer : erreurs métier et erreur de validation. */
type ApiError = { code: GameError['code'] | 'INVALID_INPUT'; message?: string }

/** Message affiché au joueur pour chaque erreur. */
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  GAME_NOT_FOUND: 'Expédition introuvable.',
  ALREADY_EXISTS: 'Expédition déjà ouverte.',
  WRONG_PHASE: "Cette action n'est plus possible.",
  GAME_FULL: "L'expédition est complète.",
  ALREADY_JOINED: "Vous faites déjà partie de l'expédition.",
  NOT_A_MEMBER: "Vous ne faites pas partie de l'expédition.",
  NOT_HOST: "Seul l'hôte peut lancer l'expédition.",
  NOT_YOUR_TURN: "Ce n'est pas votre tour.",
  HERO_DOWN: 'Votre héros est tombé.',
  ROUND_OVER: 'La manche est déjà terminée.',
  ALREADY_CHOSEN: 'Vous avez déjà choisi votre action.',
  INVALID_TARGET: 'Cible invalide.',
}

/** Libellé de chaque niveau de difficulté. */
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Facile', hard: 'Difficile' }

// ---------------------------------------------------------------------------
// Liste des expéditions ouvertes
// ---------------------------------------------------------------------------

/** Écran d'accueil du Donjon : expéditions ouvertes et ouverture d'une expédition. */
export function DungeonLobby() {
  const router = useRouter()
  const [games, setGames] = useState<OpenGame[] | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')

  const refresh = useCallback(async () => {
    const res = await client.games.$get()
    if (res.ok) setGames((await res.json()).games)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open() {
    const res = await client.games.$post({ json: { difficulty } })
    if (res.ok) router.push(`/dungeon/${(await res.json()).gameId}`)
  }

  return (
    <>
      <ScreenTitle kind="dungeon">Donjon</ScreenTitle>

      <motion.div className="panel dark" {...appear}>
        <div className="forge-fire">
          <span style={{ position: 'relative', display: 'inline-block' }}>
            {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
            <img
              className="pixel"
              src="/assets/map/arch.png"
              alt=""
              aria-hidden="true"
              style={{ height: 120 }}
            />
            <motion.span
              style={{ position: 'absolute', left: 36, top: 30 }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
            >
              <Actor name="skull" monster scale={3} />
            </motion.span>
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2>L'entrée du donjon</h2>
            <p className="muted">Six salles, des monstres et un trésor. Jusqu'à quatre héros.</p>
            <div className="row">
              <fieldset className="difficulty">
                <legend className="sr-only">Niveau</legend>
                {DIFFICULTIES.map((level) => (
                  <button
                    key={level}
                    type="button"
                    aria-pressed={difficulty === level}
                    onClick={() => setDifficulty(level)}
                  >
                    {DIFFICULTY_LABELS[level]}
                  </button>
                ))}
              </fieldset>
              <motion.button type="button" onClick={open} whileTap={{ scale: 0.93 }}>
                Ouvrir une expédition
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>

      <section className="panel" aria-label="Expéditions ouvertes">
        <div className="row spread">
          <h2>Expéditions ouvertes</h2>
          <button className="link" type="button" onClick={refresh}>
            Actualiser
          </button>
        </div>
        {games?.length === 0 && <p className="muted">Aucune expédition ouverte pour le moment.</p>}
        <ul className="cards">
          <AnimatePresence initial={false}>
            {games?.map((game) => (
              <motion.li
                key={game.gameId}
                className="card"
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <span className="card-main">
                  <span className="portrait small">
                    {/* biome-ignore lint/performance/noImgElement: images en pixel art, sans optimisation */}
                    <img className="pixel" src={faceOf(game.hostName)} alt="" aria-hidden="true" />
                  </span>
                  <span>
                    Expédition de {game.hostName}
                    <br />
                    <span className="muted">
                      {Array.from({ length: MAX_HEROES }, (_, index) =>
                        index < game.heroCount ? '●' : '○',
                      ).join(' ')}{' '}
                      ({game.heroCount}/{MAX_HEROES} héros)
                    </span>
                  </span>
                </span>
                <Link className="button" href={`/dungeon/${game.gameId}`}>
                  Voir
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </>
  )
}

// ---------------------------------------------------------------------------
// Expédition
// ---------------------------------------------------------------------------

/** Nom affiché d'un monstre, numéroté si la salle en contient plusieurs du même type. */
function monsterName(monster: Monster, monsters: Monster[]) {
  const sameKind = monsters.filter((other) => other.kind === monster.kind)
  const name = MONSTERS[monster.kind].name
  return sameKind.length > 1 ? `${name} ${sameKind.indexOf(monster) + 1}` : name
}

/** Description d'une action, telle que le joueur l'a choisie. */
function describeAction(action: Action, nameOf: (id: string) => string) {
  if (action.type === 'attack') return `attaquer ${nameOf(action.target)}`
  if (action.type === 'heal') return `soigner ${nameOf(action.target)}`
  return 'se défendre'
}

/** Préposition « de » devant un verbe à l'infinitif, élidée devant une voyelle. */
const ofVerb = (text: string) => (/^[aeéiou]/i.test(text) ? `d'${text}` : `de ${text}`)

/** Description d'un effet de la dernière manche. */
function describeEffect(effect: Effect, nameOf: (id: string) => string) {
  return effect.kind === 'damage'
    ? `${nameOf(effect.source)} inflige ${effect.amount} dégâts à ${nameOf(effect.target)}`
    : `${nameOf(effect.source)} rend ${effect.amount} points de vie à ${nameOf(effect.target)}`
}

// ---------------------------------------------------------------------------
// Relecture d'une manche, coup par coup
// ---------------------------------------------------------------------------

/** Durée d'affichage de chaque coup, en millisecondes : assez court pour rester vif. */
const STEP_MS = 750

/** Manche en cours de relecture : ses effets, les points de vie d'avant la manche, le coup affiché. */
interface Playback {
  effects: Effect[]
  start: Record<string, number>
  step: number
}

/**
 * Relit, effet après effet, une manche résolue pendant que le joueur regarde l'expédition.
 * Les points de vie d'avant la manche sont ceux de la vue précédente ; une manche déjà résolue
 * à l'ouverture de la page n'est pas rejouée.
 */
function useRoundPlayback(view: GameView | null | undefined): Playback | null {
  const previous = useRef<GameView | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null)

  useEffect(() => {
    if (!view) return
    const before = previous.current
    previous.current = view
    const round = view.lastRound
    const resolvedNow =
      before?.phase === 'combat' && round?.round === before.round && before.room === view.room
    if (!before || !round || !resolvedNow || round.effects.length === 0) return
    const start: Record<string, number> = {}
    for (const fighter of [...before.heroes, ...before.monsters]) start[fighter.id] = fighter.hp
    setPlayback({ effects: round.effects, start, step: 0 })
  }, [view])

  useEffect(() => {
    if (!playback) return
    const timer = setTimeout(
      () =>
        setPlayback((current) =>
          current && current.step + 1 < current.effects.length
            ? { ...current, step: current.step + 1 }
            : null,
        ),
      STEP_MS,
    )
    return () => clearTimeout(timer)
  }, [playback])

  return playback
}

/**
 * Compte les entrées dans une salle, vues par le joueur : le lancement de l'expédition, puis
 * chaque porte ouverte. Une salle déjà atteinte à l'ouverture de la page ne compte pas.
 */
function useRoomEntries(view: GameView | null | undefined): number {
  const previous = useRef<GameView | null>(null)
  const [entries, setEntries] = useState(0)
  useEffect(() => {
    if (!view) return
    const before = previous.current
    previous.current = view
    if (!before || view.phase === 'lobby') return
    if (before.room !== view.room || before.phase === 'lobby') setEntries((count) => count + 1)
  }, [view])
  return entries
}

/** Nom de la salle atteinte ; avant la première porte, les héros sont à l'entrée du donjon. */
const roomTitle = (view: GameView) =>
  view.room < 0 ? 'Entrée du donjon' : `Salle ${view.room + 1} sur ${view.roomCount}`

/** Contenu d'une salle, annoncé à l'entrée. */
function roomSubtitle(view: GameView) {
  if (view.phase === 'combat') return 'Des monstres surgissent !'
  if (view.currentRoom?.kind === 'treasure') return `Un trésor de ${view.currentRoom.gold} or`
  if (view.currentRoom?.kind === 'empty') return 'Une salle vide'
  return undefined
}

/** Points de vie d'un combattant au coup affiché : les effets sont appliqués comme par le domaine. */
function hpDuring(playback: Playback, id: string, hp: number, maxHp: number) {
  let current = playback.start[id] ?? hp
  for (const effect of playback.effects.slice(0, playback.step + 1)) {
    if (effect.target !== id) continue
    const change = effect.kind === 'damage' ? -effect.amount : effect.amount
    current = Math.max(0, Math.min(maxHp, current + change))
  }
  return current
}

/** Écran d'une expédition : salon, exploration, combat et fin de l'expédition. */
export function DungeonGame({ gameId, userId }: { gameId: string; userId: string }) {
  // undefined : chargement en cours ; null : expédition introuvable.
  const [view, setView] = useState<GameView | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const param = { id: gameId }

  // REQUÊTE : lecture de la vue de l'expédition, filtrée pour le joueur.
  const refresh = useCallback(async () => {
    const res = await client.games[':id'].$get({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
    else if (res.status === 404) setView(null)
  }, [gameId])

  useEffect(() => {
    refresh()
  }, [refresh])

  // TEMPS RÉEL : seuls les membres écoutent le canal de l'expédition. Le canal ne transmet
  // aucune donnée : chaque notification provoque une relecture de la vue filtrée.
  const status = useChannel(view?.isMember ? gameChannel(gameId) : null, refresh)

  // COMMANDES : chaque réponse contient la vue à jour, ou une erreur.
  function handle(body: { view: GameView } | { error: ApiError }) {
    if ('error' in body) {
      setError(ERRORS[body.error.code])
      refresh()
    } else {
      setError(null)
      setView(body.view)
    }
  }
  const addCompanion = async () =>
    handle(await (await client.games[':id'].companion.$post({ param })).json())
  const join = async () => handle(await (await client.games[':id'].join.$post({ param })).json())
  const start = async () => handle(await (await client.games[':id'].start.$post({ param })).json())
  const openDoor = async () =>
    handle(await (await client.games[':id'].door.$post({ param })).json())
  async function act(action: Action) {
    if (!view) return
    const res = await client.games[':id'].action.$post({
      param,
      json: { round: view.round, action },
    })
    handle(await res.json())
  }

  // ÉCHÉANCE : lorsque le compte à rebours d'une manche ou d'un tour d'exploration atteint
  // zéro, la commande d'échéance fait enregistrer la suite de l'expédition, et donc
  // notifier tous les membres.
  const checkDeadline = useCallback(async () => {
    const res = await client.games[':id'].deadline.$post({ param: { id: gameId } })
    if (res.ok) setView((await res.json()).view)
  }, [gameId])
  // RELECTURE : une manche qui vient d'être résolue est rejouée coup par coup.
  const playback = useRoundPlayback(view)

  // ENTRÉE EN SALLE : un fondu marque l'entrée dans le donjon, puis dans chaque nouvelle salle.
  const entered = useRoomEntries(view)

  const remaining = useCountdown(
    view?.isMember && (view.phase === 'combat' || view.phase === 'exploring')
      ? view.deadline
      : null,
    checkDeadline,
  )

  const title = (
    <ScreenTitle kind="dungeon" back="/dungeon" status={view?.isMember ? status : undefined}>
      Expédition{view && ` · ${DIFFICULTY_LABELS[view.difficulty]}`}
    </ScreenTitle>
  )

  if (view === undefined) return title
  if (view === null) {
    return (
      <>
        {title}
        <div className="panel">
          <p className="error">{ERRORS.GAME_NOT_FOUND}</p>
          <Link className="button" href="/dungeon">
            Retour au Donjon
          </Link>
        </div>
      </>
    )
  }

  // Noms des combattants, pour décrire les actions et les effets.
  const nameOf = (id: string) => {
    const hero = view.heroes.find((h) => h.id === id)
    if (hero) return hero.name
    const monster = view.monsters.find((m) => m.id === id)
    return monster ? monsterName(monster, view.monsters) : id
  }
  const me = view.heroes.find((hero) => hero.id === userId)
  const standingMonsters = view.monsters.filter((monster) => monster.hp > 0)
  const standingHeroes = view.heroes.filter((hero) => hero.hp > 0)
  const fighting = view.phase === 'combat'
  // Coup affiché pendant la relecture : son auteur, sa cible et son effet.
  const shown = playback ? playback.effects[playback.step] : null
  const heroIds = new Set(view.heroes.map((hero) => hero.id))
  /** Points de vie affichés : ceux du coup en cours de relecture, sinon les points actuels. */
  const hpOf = (fighter: { id: string; hp: number; maxHp: number }) =>
    playback ? hpDuring(playback, fighter.id, fighter.hp, fighter.maxHp) : fighter.hp
  /** Effet visuel reçu par un combattant au coup affiché. */
  const hitOf = (id: string): Hit | null =>
    shown?.target === id
      ? {
          kind: shown.kind,
          amount: shown.amount,
          fx: shown.kind === 'heal' ? 'heal' : heroIds.has(shown.source) ? 'slash' : 'claw',
        }
      : null

  return (
    <>
      {title}

      <motion.section className="panel" aria-label="Expédition" {...appear}>
        <div className="row spread">
          <h2 style={{ margin: 0 }}>
            {view.phase === 'lobby' && 'Rassemblement des héros'}
            {view.phase === 'exploring' && roomTitle(view)}
            {fighting && `Combat - salle ${view.room + 1}, manche ${view.round}`}
            {view.phase === 'won' && 'Victoire !'}
            {view.phase === 'lost' && 'Défaite...'}
          </h2>
          <span className="row">
            <span>
              <Entity kind="gold" /> {view.loot}
            </span>
            {remaining !== null && (
              <motion.span
                key={remaining <= 5 ? remaining : 'calme'}
                className="countdown"
                initial={{ scale: remaining <= 5 ? 1.4 : 1 }}
                animate={{ scale: 1 }}
                title={view.phase === 'exploring' ? "La porte s'ouvrira d'elle-même" : undefined}
              >
                {remaining}
              </motion.span>
            )}
          </span>
        </div>

        <div className="combat-call" aria-live="polite">
          <AnimatePresence mode="wait">
            {shown && (
              <motion.span
                key={playback?.step}
                initial={{ opacity: 0, y: -8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18 }}
              >
                {describeEffect(shown, nameOf)}
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="arena battle">
          {entered > 0 && (
            <ZoneFade
              key={entered}
              scope="area"
              title={roomTitle(view)}
              subtitle={roomSubtitle(view)}
            />
          )}
          {/* Héros de l'expédition. */}
          <section className="heroes" aria-label="Héros" style={{ display: 'grid', gap: 8 }}>
            {view.heroes.map((hero) => (
              <Fighter
                key={hero.id}
                name={hero.name}
                sprite={hero.companion ? 'companion' : heroSprite(hero.id)}
                hp={hpOf(hero)}
                maxHp={hero.maxHp}
                facing="right"
                acting={shown?.source === hero.id}
                hit={hitOf(hero.id)}
                step={playback?.step ?? -1}
                tags={[
                  hero.id === view.hostId ? 'hôte' : null,
                  hero.companion ? 'compagnon' : null,
                  fighting && hero.ready ? 'prêt' : null,
                ]}
                turn={view.turnHeroId === hero.id}
              />
            ))}
          </section>

          {/* Monstres de la salle. */}
          {view.monsters.length > 0 && (
            <section className="monsters" aria-label="Monstres" style={{ display: 'grid', gap: 8 }}>
              {view.monsters.map((monster) => (
                <Fighter
                  key={monster.id}
                  name={monsterName(monster, view.monsters)}
                  sprite={MONSTER_SPRITES[monster.kind].name}
                  monster={MONSTER_SPRITES[monster.kind].monster}
                  hp={hpOf(monster)}
                  maxHp={monster.maxHp}
                  facing="left"
                  acting={shown?.source === monster.id}
                  hit={hitOf(monster.id)}
                  step={playback?.step ?? -1}
                />
              ))}
            </section>
          )}
        </div>

        {/* Salon : rejoindre ou lancer l'expédition. */}
        {view.phase === 'lobby' && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">
              Communiquez l'adresse de cette page aux joueurs que vous souhaitez inviter.
            </p>
            <div className="actions">
              {!view.isMember && view.heroes.length < MAX_HEROES && (
                <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={join}>
                  Rejoindre l'expédition
                </motion.button>
              )}
              {view.isHost && view.heroes.length < MAX_HEROES && (
                <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={addCompanion}>
                  <Entity kind="companion" /> Ajouter un compagnon
                </motion.button>
              )}
              {view.isHost && (
                <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={start}>
                  Entrer dans le donjon
                </motion.button>
              )}
            </div>
            {view.isMember && !view.isHost && (
              <p className="muted">En attente du lancement par l'hôte.</p>
            )}
          </div>
        )}

        {/* Exploration : ouvrir la porte suivante, à tour de rôle. */}
        {!playback && view.phase === 'exploring' && (
          <div style={{ marginTop: 12 }}>
            <p>
              {view.currentRoom?.kind === 'treasure' &&
                `Un trésor de ${view.currentRoom.gold} or !`}
              {view.currentRoom?.kind === 'empty' && 'Une salle vide.'}
            </p>
            {view.turnHeroId === userId ? (
              <motion.button type="button" whileTap={{ scale: 0.93 }} onClick={openDoor}>
                <Entity kind="door" /> Ouvrir la porte suivante
              </motion.button>
            ) : (
              <p className="muted">Au tour de {nameOf(view.turnHeroId ?? '')}.</p>
            )}
          </div>
        )}

        {/* Combat : choix de l'action. */}
        {!playback && fighting && me && me.hp > 0 && !me.action && (
          <div className="actions">
            {standingMonsters.map((monster) => (
              <motion.button
                key={monster.id}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => act({ type: 'attack', target: monster.id })}
              >
                Attaquer {monsterName(monster, view.monsters)}
              </motion.button>
            ))}
            <motion.button
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={() => act({ type: 'defend' })}
            >
              Se défendre
            </motion.button>
            {standingHeroes.map((hero) => (
              <motion.button
                key={hero.id}
                type="button"
                whileTap={{ scale: 0.93 }}
                onClick={() => act({ type: 'heal', target: hero.id })}
              >
                Soigner {hero.name}
              </motion.button>
            ))}
          </div>
        )}
        {!playback && fighting && me?.action && (
          <p className="muted" style={{ marginTop: 10 }}>
            Votre choix : {describeAction(me.action, nameOf)}. En attente des autres héros.
          </p>
        )}

        {/* Fin de l'expédition. */}
        {!playback && (view.phase === 'won' || view.phase === 'lost') && (
          <motion.div
            style={{ marginTop: 12 }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
          >
            <p>
              Butin de l'expédition : <Entity kind="gold" /> {view.loot}
            </p>
            <Link className="button" href="/dungeon">
              Retour au Donjon
            </Link>
          </motion.div>
        )}
      </motion.section>

      {/* Résultat de la dernière manche, connu de tous une fois la manche résolue. */}
      {view.lastRound && (
        <section className="panel dark" aria-label="Dernière manche">
          <h2>Manche {view.lastRound.round}</h2>
          <ul className="log">
            {Object.entries(view.lastRound.actions).map(([heroId, action]) => (
              <li key={heroId}>
                {nameOf(heroId)} a choisi {ofVerb(describeAction(action, nameOf))}.
              </li>
            ))}
            {view.lastRound.effects.map((effect) => (
              // Chaque combattant n'agit qu'une fois par manche : ce triplet identifie l'effet.
              <li key={`${effect.kind}-${effect.source}-${effect.target}`}>
                {describeEffect(effect, nameOf)}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="toast error">{error}</p>}
    </>
  )
}

// ---------------------------------------------------------------------------
// Combattants
// ---------------------------------------------------------------------------

/** Planche de chaque type de monstre ; le squelette est un personnage, pas un monstre. */
const MONSTER_SPRITES: Record<Monster['kind'], { name: string; monster: boolean }> = {
  goblin: { name: 'goblin', monster: true },
  skeleton: { name: 'skeleton', monster: false },
  troll: { name: 'troll', monster: true },
}

/** Apparence d'un héros joueur, choisie de façon stable à partir de son identifiant. */
const HERO_SPRITES = ['hero', 'knight', 'hunter', 'monk', 'master']
function heroSprite(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return HERO_SPRITES[hash % HERO_SPRITES.length]
}

/** Effet visuel reçu par un combattant : entaille d'un héros, griffure d'un monstre, ou soin. */
interface Hit {
  kind: Effect['kind']
  amount: number
  fx: 'slash' | 'claw' | 'heal'
}

/** Planches des effets visuels, en images de 32 pixels. */
const FX: Record<Hit['fx'], { src: string; frames: number }> = {
  slash: { src: '/assets/fx/slash.png', frames: 4 },
  claw: { src: '/assets/fx/claw.png', frames: 4 },
  heal: { src: '/assets/fx/heal.png', frames: 6 },
}

/**
 * Un combattant : personnage animé, nom, points de vie. Pendant la relecture d'une manche,
 * l'auteur du coup bondit vers sa cible ; la cible reçoit l'effet, tremble, et affiche les
 * points perdus ou rendus, tandis que sa barre se vide ou se remplit.
 */
function Fighter({
  name,
  sprite,
  monster = false,
  hp,
  maxHp,
  facing,
  tags = [],
  turn = false,
  acting = false,
  hit = null,
  step = -1,
}: {
  name: string
  sprite: string
  monster?: boolean
  hp: number
  maxHp: number
  facing: 'left' | 'right'
  tags?: (string | null)[]
  turn?: boolean
  acting?: boolean
  hit?: Hit | null
  step?: number
}) {
  const down = hp <= 0
  const lunge = facing === 'right' ? 22 : -22
  return (
    <div className="fighter" data-down={down} data-acting={acting || undefined}>
      <span className="stage-sprite">
        <motion.span
          key={acting ? `act-${step}` : 'idle'}
          style={{ display: 'inline-block' }}
          animate={acting ? { x: [0, lunge, 0], scale: [1, 1.2, 1] } : { x: 0, scale: 1 }}
          transition={{ duration: 0.42, ease: 'easeOut' }}
        >
          <Actor
            name={sprite}
            monster={monster}
            direction={facing}
            walking={!down}
            fps={5}
            scale={3}
          />
        </motion.span>
        {hit && (
          <span key={`fx-${step}`} className="fx">
            <Sprite
              src={FX[hit.fx].src}
              w={32}
              h={32}
              sheet={[FX[hit.fx].frames * 32, 32]}
              frames={FX[hit.fx].frames}
              fps={FX[hit.fx].frames * 1.6}
              scale={2}
            />
          </span>
        )}
      </span>
      <motion.span
        key={hit?.kind === 'damage' ? `hit-${step}` : 'calm'}
        className="info"
        animate={hit?.kind === 'damage' ? { x: [0, -7, 7, -4, 0] } : { x: 0 }}
        transition={{ duration: 0.35, delay: 0.15 }}
      >
        <span className="row" style={{ gap: 6 }}>
          <strong>{name}</strong>
          {tags.filter(Boolean).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
          {turn && <span className="tag turn">à son tour</span>}
        </span>
        <span className="bar hp" data-low={hp / maxHp < 0.3} aria-hidden="true">
          <motion.span
            initial={false}
            animate={{ width: `${(Math.max(0, hp) / maxHp) * 100}%` }}
            transition={{ duration: 0.3, delay: 0.15 }}
          />
        </span>
        <span className="muted">
          {Math.max(0, hp)}/{maxHp} PV
        </span>
      </motion.span>
      <AnimatePresence>
        {hit && (
          <motion.span
            key={`n-${step}`}
            className={`float ${hit.kind}`}
            aria-hidden="true"
            initial={{ y: 6, opacity: 0, scale: 0.6 }}
            animate={{ y: -26, opacity: [0, 1, 1, 0], scale: [0.6, 1.3, 1, 1] }}
            transition={{ duration: 0.75, ease: 'easeOut' }}
          >
            {hit.kind === 'damage' ? `-${hit.amount}` : `+${hit.amount}`}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
