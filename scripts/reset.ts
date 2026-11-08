import { rm } from "node:fs/promises";
import path from "node:path";

async function main() {
  if (process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "Refusing to reset an external DATABASE_URL. Reset the provisioned database with your migration tooling, then run `npm run db:seed`.",
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset demo data in production.");
  }
  const root = process.cwd();
  const dbDir = process.env.PGLITE_DATA_DIR
    ? path.resolve(process.env.PGLITE_DATA_DIR)
    : path.join(root, ".data", "reconpay");
  const storageDir = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(root, ".data", "storage");
  const dataRoot = path.join(root, ".data");
  for (const target of [dbDir, storageDir]) {
    const relative = path.relative(dataRoot, target);
    if (target !== dataRoot && relative.startsWith("..")) {
      throw new Error(
        `Refusing to delete a path outside .data: ${target}. Reset it manually if intentional.`,
      );
    }
  }
  await rm(dbDir, { recursive: true, force: true });
  await rm(storageDir, { recursive: true, force: true });
  console.log(`Removed local database ${dbDir}`);
  console.log(`Removed local storage ${storageDir}`);
  console.log("Running migrations and seed...");
  await import("./seed");
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exitCode = 1;
});
