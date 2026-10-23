import { bigint, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Caravane. Ses événements restent dans le journal de la plateforme. */
export const caravan = pgSchema('caravan')

/**
 * Caravanes envoyées, tenues à jour par la projection des caravanes : une caravane y entre
 * à son envoi, et y reste après son arrivée, pour l'historique de l'expéditeur et du destinataire.
 */
export const caravans = caravan.table(
  'caravans',
  {
    caravanId: text('caravan_id').primaryKey(),
    senderId: text('sender_id').notNull(),
    senderName: text('sender_name').notNull(),
    recipientId: text('recipient_id').notNull(),
    recipientVillage: text('recipient_village').notNull(),
    cargo: jsonb('cargo').notNull(),
    status: text('status').notNull(),
    sentAt: bigint('sent_at', { mode: 'number' }).notNull(),
    departedAt: bigint('departed_at', { mode: 'number' }),
    arrivesAt: bigint('arrives_at', { mode: 'number' }),
    stolen: jsonb('stolen'),
    returned: jsonb('returned'),
  },
  (t) => [
    index('caravans_sender_idx').on(t.senderId),
    index('caravans_recipient_idx').on(t.recipientId),
  ],
)

/**
 * Destinataires possibles : les joueurs qui ont fondé un village, lus dans le langage publié
 * du Village (événement VillageFounded) par la même projection.
 */
export const recipients = caravan.table('recipients', {
  playerId: text('player_id').primaryKey(),
  villageName: text('village_name').notNull(),
})
