ALTER TABLE "recipe_drafts" RENAME COLUMN "telegram_chat_id" TO "channel_chat_id";--> statement-breakpoint
ALTER TABLE "recipe_drafts" RENAME COLUMN "telegram_user_id" TO "channel_user_id";--> statement-breakpoint
DROP INDEX "recipe_drafts_active_lookup_idx";--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD COLUMN "channel" text DEFAULT 'telegram' NOT NULL;--> statement-breakpoint
CREATE INDEX "recipe_drafts_active_lookup_idx" ON "recipe_drafts" USING btree ("channel","channel_chat_id","channel_user_id","state","expires_at");