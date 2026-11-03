ALTER TABLE "agency_publications" DROP CONSTRAINT "agency_publications_status_check";--> statement-breakpoint
ALTER TABLE "agency_publications" DROP CONSTRAINT "agency_publications_dispatch_check";--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "social_account_id" uuid;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "post_text" text;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "provider_post_id" text;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "checkpoint" jsonb;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_social_account_id_agency_social_accounts_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."agency_social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_publications_due_idx" ON "agency_publications" USING btree ("status","dispatch","scheduled_at");--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_status_check" CHECK ("agency_publications"."status" in ('scheduled', 'publishing', 'published', 'failed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_dispatch_check" CHECK ("agency_publications"."dispatch" in ('agent', 'manual', 'connector'));