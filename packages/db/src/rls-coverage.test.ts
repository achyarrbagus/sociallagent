import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRuntimeRoleBypassesRls,
  assertSessionCapableDatabaseUrl,
  checkRuntimeRoleBypassesRls,
  createDb,
} from "./client.js";
import {
  EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const cleanups: Array<() => Promise<void>> = [];
const support = await getEmbeddedPostgresTestSupport();
const describePostgres = support.supported ? describe : describe.skip;
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()?.();
});

describe("assertSessionCapableDatabaseUrl", () => {
  const message =
    "DATABASE_URL points at a transaction pooler (port 6543); use a direct or session-pooler connection";

  it("rejects the Supabase transaction pooler port", () => {
    expect(() =>
      assertSessionCapableDatabaseUrl("postgresql://u:p@aws-0.pooler.supabase.com:6543/postgres"),
    ).toThrow(message);
  });

  it("rejects pgbouncer=true", () => {
    expect(() =>
      assertSessionCapableDatabaseUrl("postgresql://u:p@db.example.com:5432/postgres?pgbouncer=true"),
    ).toThrow(message);
  });

  it("accepts session pooler, direct, default-port and local URLs", () => {
    for (const url of [
      "postgresql://u:p@aws-0.pooler.supabase.com:5432/postgres",
      "postgresql://u:p@db.example.com/postgres",
      "postgres://paperclip:paperclip@localhost:54329/paperclip",
    ]) {
      expect(() => assertSessionCapableDatabaseUrl(url)).not.toThrow();
    }
  });

  it("does not leak credentials in the error", () => {
    try {
      assertSessionCapableDatabaseUrl("postgresql://u:secretpw@h.example.com:6543/postgres");
    } catch (error) {
      expect(String(error)).not.toContain("secretpw");
    }
  });

  it("is enforced by createDb", () => {
    expect(() => createDb("postgresql://u:p@h.example.com:6543/postgres")).toThrow(message);
  });

  it("names the variable when given a label", () => {
    expect(() =>
      assertSessionCapableDatabaseUrl("postgresql://u:p@h.example.com:6543/postgres", "DATABASE_MIGRATION_URL"),
    ).toThrow(/^DATABASE_MIGRATION_URL points at a transaction pooler/);
  });
});

describePostgres("row level security lockdown", () => {
  async function database() {
    const db = await startEmbeddedPostgresTestDatabase("paperclip-rls-coverage-");
    cleanups.push(db.cleanup);
    const sql = postgres(db.connectionString, { max: 1, onnotice: () => {} });
    cleanups.push(async () => {
      await sql.end();
    });
    return sql;
  }

  it(
    "enables row level security on every public table",
    async () => {
      const sql = await database();
      const rows = await sql<{ relname: string }[]>`
        select relname from pg_class
        join pg_namespace n on n.oid = relnamespace
        where n.nspname = 'public' and relkind in ('r', 'p') and not relrowsecurity
        order by relname`;
      expect(rows.map((r) => r.relname)).toEqual([]);
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "keeps the server role able to read and write",
    async () => {
      const sql = await database();
      const id = randomUUID();
      await sql`insert into companies (id, name) values (${id}, 'RLS Co')`;
      const rows = await sql`select name from companies where id = ${id}`;
      expect(rows.map((r) => r.name)).toEqual(["RLS Co"]);
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "denies Data API roles and future grants when they exist",
    async () => {
      const sql = await database();
      // Plain Postgres has no Supabase roles; the migration is conditional on them.
      await sql.unsafe(`create role anon nologin; create role authenticated nologin;`);
      const id = randomUUID();
      await sql`insert into companies (id, name) values (${id}, 'Visible to owner')`;
      await sql.unsafe(`grant select on companies to anon`); // simulate Supabase default grant
      await sql.unsafe(`set role anon`);
      const rows = await sql`select id from companies`;
      await sql.unsafe(`reset role`);
      expect(rows.length).toBe(0); // RLS enabled, no policy => anon sees nothing
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "revokes grants and default privileges from Supabase roles when present",
    async () => {
      const sql = await database();
      await sql.unsafe(`create role anon nologin; create role authenticated nologin;`);
      await sql.unsafe(`grant select on all tables in schema public to anon, authenticated`);
      await sql.unsafe(`alter default privileges in schema public grant all on tables to anon, authenticated`);
      const body = await readFile(new URL("./migrations/0386_rls_lockdown.sql", import.meta.url), "utf8");
      await sql.unsafe(body);
      const [grant] = await sql`select has_table_privilege('anon', 'public.companies', 'select') as a,
        has_table_privilege('authenticated', 'public.companies', 'select') as b`;
      expect(grant).toEqual({ a: false, b: false });
      await sql.unsafe(`create table public.rls_future (id int)`);
      const [future] = await sql`select has_table_privilege('anon', 'public.rls_future', 'select') as a`;
      expect(future.a).toBe(false);
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "startup role check passes for the table owner",
    async () => {
      const db = await startEmbeddedPostgresTestDatabase("paperclip-rls-role-owner-");
      cleanups.push(db.cleanup);
      await expect(assertRuntimeRoleBypassesRls(db.connectionString)).resolves.toBeUndefined();
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "startup role check fails fast for a non-owner role without BYPASSRLS",
    async () => {
      const sql = await database();
      await sql.unsafe(`create role rls_runtime_nonowner nologin nobypassrls`);
      await sql.unsafe(`grant select on public.companies to rls_runtime_nonowner`);
      await sql.unsafe(`set role rls_runtime_nonowner`);
      try {
        await expect(checkRuntimeRoleBypassesRls(sql)).rejects.toThrow(
          /does not own public\.companies and lacks BYPASSRLS/,
        );
      } finally {
        await sql.unsafe(`reset role`);
      }
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );

  it(
    "startup role check passes for a non-owner role with BYPASSRLS",
    async () => {
      const sql = await database();
      await sql.unsafe(`create role rls_runtime_bypass nologin bypassrls`);
      await sql.unsafe(`set role rls_runtime_bypass`);
      try {
        await expect(checkRuntimeRoleBypassesRls(sql)).resolves.toBeUndefined();
      } finally {
        await sql.unsafe(`reset role`);
      }
    },
    EMBEDDED_POSTGRES_TEST_TIMEOUT_MS,
  );
});
