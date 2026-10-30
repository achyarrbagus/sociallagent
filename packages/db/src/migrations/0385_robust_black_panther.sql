CREATE TABLE IF NOT EXISTS "managed_gateway_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "managed_gateway_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "managed_gateway_tokens_kind_check" CHECK ("managed_gateway_tokens"."kind" in ('run', 'probe'))
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'managed_gateway_tokens'::regclass AND attname = 'kind' AND NOT attisdropped) THEN DELETE FROM "managed_gateway_tokens"; ALTER TABLE "managed_gateway_tokens" ADD COLUMN "kind" text NOT NULL; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'managed_gateway_tokens'::regclass AND conname = 'managed_gateway_tokens_kind_check') THEN ALTER TABLE "managed_gateway_tokens" ADD CONSTRAINT "managed_gateway_tokens_kind_check" CHECK ("managed_gateway_tokens"."kind" in ('run', 'probe')); END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'managed_gateway_tokens'::regclass AND conname = 'managed_gateway_tokens_company_id_companies_id_fk') THEN ALTER TABLE "managed_gateway_tokens" ADD CONSTRAINT "managed_gateway_tokens_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managed_gateway_tokens_run_idx" ON "managed_gateway_tokens" USING btree ("run_id");
