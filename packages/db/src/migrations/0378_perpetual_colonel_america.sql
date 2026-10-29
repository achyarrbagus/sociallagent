CREATE TABLE "agency_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website_url" text,
	"audience" text,
	"tone_of_voice" text,
	"brief" text,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_brands_company_id_uq" UNIQUE("company_id","id")
);
--> statement-breakpoint
CREATE TABLE "agency_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"contact_name" text,
	"contact_email" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_clients_company_id_uq" UNIQUE("company_id","id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "agency_brands" ADD CONSTRAINT "agency_brands_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_brands" ADD CONSTRAINT "agency_brands_company_id_client_id_agency_clients_company_id_id_fk" FOREIGN KEY ("company_id","client_id") REFERENCES "public"."agency_clients"("company_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_clients" ADD CONSTRAINT "agency_clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_brands_company_client_idx" ON "agency_brands" USING btree ("company_id","client_id");--> statement-breakpoint
CREATE INDEX "agency_clients_company_idx" ON "agency_clients" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_brand_id_agency_brands_company_id_id_fk" FOREIGN KEY ("company_id","brand_id") REFERENCES "public"."agency_brands"("company_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "projects_company_brand_idx" ON "projects" USING btree ("company_id","brand_id");