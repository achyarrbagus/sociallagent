import { createDb } from "@paperclipai/db";
import { seedAdmin } from "../src/services/admin-seed.js";

const { DATABASE_URL, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_COMPANY_ID } = process.env;
if (!DATABASE_URL || !SEED_ADMIN_NAME || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD || !SEED_ADMIN_COMPANY_ID) {
  console.error("Set DATABASE_URL, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD and SEED_ADMIN_COMPANY_ID before running the seeder.");
  process.exit(1);
}
const db = createDb(DATABASE_URL);
try {
  const id = await seedAdmin(db, { name: SEED_ADMIN_NAME, email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD, companyId: SEED_ADMIN_COMPANY_ID });
  console.log(`Admin account created: ${SEED_ADMIN_EMAIL.trim().toLowerCase()} (user ID: ${id})`);
} catch (error) {
  console.error(`Admin seeding failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
