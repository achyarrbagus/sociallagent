CREATE TABLE "agency_content_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"decided_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_content_decision_check" CHECK ("agency_content_decisions"."decision" in ('select_idea','approve','request_changes','reject'))
);
--> statement-breakpoint
CREATE TABLE "agency_content_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'idea' NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"approved_revision_number" integer,
	"asset_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_content_company_id_uq" UNIQUE("company_id","id"),
	CONSTRAINT "agency_content_status_check" CHECK ("agency_content_items"."status" in ('idea','in_production','awaiting_owner','changes_requested','approved','rejected')),
	CONSTRAINT "agency_content_revision_check" CHECK ("agency_content_items"."revision_number" > 0 and ("agency_content_items"."approved_revision_number" is null or ("agency_content_items"."status" = 'approved' and "agency_content_items"."approved_revision_number" = "agency_content_items"."revision_number")))
);
--> statement-breakpoint
CREATE TABLE "agency_content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by_actor_type" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_revision_content_number_uq" UNIQUE("company_id","content_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "agency_content_tasks" (
	"company_id" uuid NOT NULL,
	"content_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_content_tasks_content_id_issue_id_pk" PRIMARY KEY("content_id","issue_id")
);
--> statement-breakpoint
ALTER TABLE "agency_content_decisions" ADD CONSTRAINT "agency_decision_revision_fk" FOREIGN KEY ("company_id","content_id","revision_number") REFERENCES "public"."agency_content_revisions"("company_id","content_id","revision_number") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_content_items" ADD CONSTRAINT "agency_content_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_content_items" ADD CONSTRAINT "agency_content_brand_fk" FOREIGN KEY ("company_id","brand_id") REFERENCES "public"."agency_brands"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_content_items" ADD CONSTRAINT "agency_content_project_fk" FOREIGN KEY ("company_id","project_id") REFERENCES "public"."projects"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_content_revisions" ADD CONSTRAINT "agency_revision_content_fk" FOREIGN KEY ("company_id","content_id") REFERENCES "public"."agency_content_items"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_content_tasks" ADD CONSTRAINT "agency_task_content_fk" FOREIGN KEY ("company_id","content_id") REFERENCES "public"."agency_content_items"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_decision_content_idx" ON "agency_content_decisions" USING btree ("company_id","content_id","revision_number");--> statement-breakpoint
CREATE INDEX "agency_content_company_id_idx" ON "agency_content_items" USING btree ("company_id","id");--> statement-breakpoint
CREATE INDEX "agency_content_company_brand_idx" ON "agency_content_items" USING btree ("company_id","brand_id");--> statement-breakpoint
CREATE INDEX "agency_content_company_project_idx" ON "agency_content_items" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "agency_content_company_status_idx" ON "agency_content_items" USING btree ("company_id","status","id");--> statement-breakpoint
CREATE INDEX "agency_content_task_issue_idx" ON "agency_content_tasks" USING btree ("company_id","issue_id");