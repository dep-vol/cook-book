ALTER TYPE "public"."recipe_draft_source_type" ADD VALUE 'video';--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'video';--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "draft_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD COLUMN "pending_source" jsonb;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_draft_id_recipe_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."recipe_drafts"("id") ON DELETE set null ON UPDATE no action;