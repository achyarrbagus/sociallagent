CREATE TABLE "agency_social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"display_name" text NOT NULL,
	"external_account_id" text NOT NULL,
	"credentials_secret_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agency_social_accounts_brand_platform_uq" UNIQUE("company_id","brand_id","platform")
);
--> statement-breakpoint
ALTER TABLE "agency_social_accounts" ADD CONSTRAINT "agency_social_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agency_social_accounts" ADD CONSTRAINT "agency_social_accounts_brand_id_agency_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."agency_brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agency_social_accounts_company_idx" ON "agency_social_accounts" USING btree ("company_id","brand_id");--> statement-breakpoint
ALTER TABLE "agency_social_accounts" ENABLE ROW LEVEL SECURITY;
