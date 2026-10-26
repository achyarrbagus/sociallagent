import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";

/** Acquire before row locks: deletion's child-first cleanup must not invert the
 * content transaction's parent-first source locks. No external work is held. */
export async function lockAgencyContentCompany(db: Db, companyId: string, deleting = false) {
  const key = `agency-content-company:${companyId}`;
  await db.execute(deleting
    ? sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
    : sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`);
}
