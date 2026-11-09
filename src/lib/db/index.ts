import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type DatabaseState = {
  db: Database;
  kind: "pglite" | "postgres";
  close: () => Promise<void>;
};

const globalForDb = globalThis as unknown as {
  __reconpayDbPromise?: Promise<DatabaseState>;
  __reconpayTestState?: DatabaseState;
};

function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

function databasePath(): string {
  const configured = process.env.PGLITE_DATA_DIR;
  if (configured) return path.resolve(configured);
  return path.join(process.cwd(), ".data", "reconpay");
}

async function runPostgresMigrations(databaseUrl: string): Promise<void> {
  // Supabase's transaction pooler (port 6543) is not the right connection for
  // DDL. Use a direct/session connection for migrations when one is provided.
  const migrationUrl = process.env.MIGRATION_DATABASE_URL?.trim() || databaseUrl;
  const client = postgres(migrationUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    prepare: false,
  });
  try {
    const migrationDb = drizzlePostgres(client, { schema });
    await migratePostgres(migrationDb as never, {
      migrationsFolder: migrationsFolder(),
    });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function initState(): Promise<DatabaseState> {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    if (process.env.RUN_MIGRATIONS === "true") {
      await runPostgresMigrations(databaseUrl);
    }
    const client = postgres(databaseUrl, {
      max: Number(process.env.DB_POOL_MAX ?? 20),
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
    });
    const db = drizzlePostgres(client, { schema }) as unknown as Database;
    return {
      db,
      kind: "postgres",
      close: async () => {
        await client.end({ timeout: 5 });
      },
    };
  }

  const dir = databasePath();
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder() });
  return {
    db,
    kind: "pglite",
    close: async () => {
      await client.close();
    },
  };
}

export async function getDb(): Promise<Database> {
  if (globalForDb.__reconpayTestState) return globalForDb.__reconpayTestState.db;
  if (!globalForDb.__reconpayDbPromise) {
    globalForDb.__reconpayDbPromise = initState();
  }
  const state = await globalForDb.__reconpayDbPromise;
  return state.db;
}

export async function getDatabaseInfo(): Promise<{
  kind: "pglite" | "postgres";
  detail: string;
}> {
  if (globalForDb.__reconpayTestState) {
    return { kind: "pglite", detail: "in-memory test database" };
  }
  if (!globalForDb.__reconpayDbPromise) {
    globalForDb.__reconpayDbPromise = initState();
  }
  const state = await globalForDb.__reconpayDbPromise;
  return {
    kind: state.kind,
    detail:
      state.kind === "pglite"
        ? databasePath()
        : "PostgreSQL connection from DATABASE_URL",
  };
}

/** Test-only injection. Not used by the application runtime. */
export function setTestDatabase(state: DatabaseState): void {
  globalForDb.__reconpayTestState = state;
}

export function clearTestDatabase(): void {
  globalForDb.__reconpayTestState = undefined;
}

export async function closeDatabase(): Promise<void> {
  if (globalForDb.__reconpayTestState) {
    await globalForDb.__reconpayTestState.close();
    globalForDb.__reconpayTestState = undefined;
    return;
  }
  if (globalForDb.__reconpayDbPromise) {
    const state = await globalForDb.__reconpayDbPromise;
    await state.close();
    globalForDb.__reconpayDbPromise = undefined;
  }
}

/** Used by scripts and tests to create an isolated database without touching app state. */
export async function createIsolatedDatabase(options?: {
  memory?: boolean;
  path?: string;
}): Promise<{
  db: Database;
  close: () => Promise<void>;
}> {
  const client = options?.path
    ? new PGlite(path.resolve(options.path))
    : new PGlite(options?.memory === false ? undefined : "memory://");
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: migrationsFolder() });
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}

export { schema };
