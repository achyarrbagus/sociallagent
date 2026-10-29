CREATE TABLE "agency_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"platform" text NOT NULL,
	"account_label" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"dispatch" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"agent_id" uuid,
	"routine_id" uuid,
	"external_url" text,
	"failure_reason" text,
	"published_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_publications_status_check" CHECK ("agency_publications"."status" in ('scheduled', 'published', 'failed', 'cancelled')),
	CONSTRAINT "agency_publications_dispatch_check" CHECK ("agency_publications"."dispatch" in ('agent', 'manual'))
);
--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_content_id_agency_content_items_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."agency_content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_publications" ADD CONSTRAINT "agency_publications_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_publications_company_schedule_idx" ON "agency_publications" USING btree ("company_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "agency_publications_content_idx" ON "agency_publications" USING btree ("company_id","content_id");