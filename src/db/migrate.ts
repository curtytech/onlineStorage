import { readdirSync } from "fs";
import { resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import db from "./connection";

interface Migration {
  up: (db: any) => void;
  down?: (db: any) => void;
}

export function ensureMigrationsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export function getExecutedMigrations(): string[] {
  const rows = db.query("SELECT name FROM migrations ORDER BY id ASC").all() as { name: string }[];
  return rows.map((row) => row.name);
}

export async function runMigrations() {
  ensureMigrationsTable();

  const migrationsDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
    .sort();

  const executed = getExecutedMigrations();
  const pending = files.filter((f) => !executed.includes(f));

  console.log(`\n[Migrations] Executadas: ${executed.length} | Pendentes: ${pending.length}\n`);

  for (const file of pending) {
    const filePath = resolve(migrationsDir, file);
    const module = (await import(pathToFileURL(filePath).href)) as { default: Migration };
    const migration = module.default;

    if (!migration?.up) {
      console.warn(`[Migrations] Pulando ${file} (sem função up exportada)`);
      continue;
    }

    console.log(`[Migrations] Executando: ${file}`);
    const transaction = db.transaction(() => {
      migration.up(db);
      db.run("INSERT INTO migrations (name) VALUES (?)", [file]);
    });
    transaction();
    console.log(`[Migrations] Concluído: ${file}\n`);
  }

  console.log("[Migrations] Todas as migrations foram aplicadas com sucesso!");
}

export async function rollbackLastMigration() {
  ensureMigrationsTable();

  const lastRow = db.query(
    "SELECT name FROM migrations ORDER BY id DESC LIMIT 1"
  ).get() as { name: string } | null;

  if (!lastRow) {
    console.log("[Migrations] Nenhuma migration para reverter.");
    return;
  }

  const migrationsDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..", "migrations");
  const filePath = resolve(migrationsDir, lastRow.name);
  const module = (await import(pathToFileURL(filePath).href)) as { default: Migration };
  const migration = module.default;

  if (!migration?.down) {
    console.warn(`[Migrations] A migration ${lastRow.name} não tem função down.`);
    return;
  }

  console.log(`[Migrations] Revertendo: ${lastRow.name}`);
  const transaction = db.transaction(() => {
    migration.down(db);
    db.run("DELETE FROM migrations WHERE name = ?", [lastRow.name]);
  });
  transaction();
  console.log(`[Migrations] Revertida: ${lastRow.name}`);
}

if (import.meta.main) {
  const arg = process.argv[2];
  if (arg === "rollback") {
    rollbackLastMigration();
  } else {
    runMigrations();
  }
}
