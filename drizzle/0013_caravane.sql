CREATE SCHEMA "caravan";
--> statement-breakpoint
CREATE TABLE "caravan"."caravans" (
	"caravan_id" text PRIMARY KEY NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"recipient_id" text NOT NULL,
	"recipient_village" text NOT NULL,
	"cargo" jsonb NOT NULL,
	"status" text NOT NULL,
	"sent_at" bigint NOT NULL,
	"departed_at" bigint,
	"arrives_at" bigint,
	"stolen" jsonb,
	"returned" jsonb
);
--> statement-breakpoint
CREATE TABLE "caravan"."recipients" (
	"player_id" text PRIMARY KEY NOT NULL,
	"village_name" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "caravans_sender_idx" ON "caravan"."caravans" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "caravans_recipient_idx" ON "caravan"."caravans" USING btree ("recipient_id");