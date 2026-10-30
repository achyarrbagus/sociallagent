CREATE TABLE IF NOT EXISTS "company_credit_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"amount_microunits" bigint NOT NULL,
	"input_tokens" bigint NOT NULL,
	"cached_input_tokens" bigint NOT NULL,
	"output_tokens" bigint NOT NULL,
	"rates" jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_credit_charges_nonnegative" CHECK ("company_credit_charges"."amount_microunits" >= 0 and "company_credit_charges"."input_tokens" >= 0 and "company_credit_charges"."cached_input_tokens" >= 0 and "company_credit_charges"."cached_input_tokens" <= "company_credit_charges"."input_tokens" and "company_credit_charges"."output_tokens" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_credit_policies" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"allowance_microunits" bigint NOT NULL,
	"rates" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_credit_policies_nonnegative" CHECK ("company_credit_policies"."allowance_microunits" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "instance_credit_settings" (
	"singleton_key" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"allowance_microunits" bigint NOT NULL,
	"rates" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_credit_settings_nonnegative" CHECK ("instance_credit_settings"."allowance_microunits" >= 0)
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'company_credit_charges'::regclass AND conname = 'company_credit_charges_company_id_companies_id_fk') THEN ALTER TABLE "company_credit_charges" ADD CONSTRAINT "company_credit_charges_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'company_credit_policies'::regclass AND conname = 'company_credit_policies_company_id_companies_id_fk') THEN ALTER TABLE "company_credit_policies" ADD CONSTRAINT "company_credit_policies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_credit_charges_company_run_uq" ON "company_credit_charges" USING btree ("company_id","run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_credit_charges_company_occurred_idx" ON "company_credit_charges" USING btree ("company_id","occurred_at");
--> statement-breakpoint
ALTER TABLE "company_credit_charges" DROP CONSTRAINT IF EXISTS "company_credit_charges_run_id_heartbeat_runs_id_fk";
