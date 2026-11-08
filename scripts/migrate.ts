import { sql } from "drizzle-orm";
import { closeDatabase, getDatabaseInfo, getDb } from "@/lib/db";

async function main() {
  const db = await getDb();
  await db.execute(sql`select 1`);
  const info = await getDatabaseInfo();
  console.log(`Migrations applied. Database: ${info.kind} (${info.detail}).`);
  await closeDatabase();
}

main().catch(async (error) => {
  console.error("Migration check failed:", error);
  await closeDatabase();
  process.exitCode = 1;
});
