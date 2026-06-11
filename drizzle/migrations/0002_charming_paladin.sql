CREATE TYPE "public"."recipe_draft_source_type" AS ENUM('manual', 'text', 'photo', 'url');--> statement-breakpoint
CREATE TYPE "public"."recipe_draft_state" AS ENUM('editing', 'confirming', 'saved', 'expired');--> statement-breakpoint
CREATE TABLE "recipe_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"state" "recipe_draft_state" DEFAULT 'editing' NOT NULL,
	"source_type" "recipe_draft_source_type" NOT NULL,
	"title" text,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cook_time_minutes" integer,
	"servings" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source_text" text,
	"source_url" text,
	"cover_image_key" text,
	"video_url" text,
	"last_ai_suggestion" jsonb,
	"recipe_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_drafts" ADD CONSTRAINT "recipe_drafts_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;