// Minimal migration runner: applies prisma/migrations/*/migration.sql once each.
// Used at container start and by `npm run db:migrate`, so the runtime image
// does not need the Prisma CLI.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "file:./data/dev-remail.db";
const file = url.replace(/^file:/, "");
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

const dir = path.resolve(process.env.MIGRATIONS_DIR ?? "prisma/migrations");
const db = new Database(file);
db.pragma("journal_mode = WAL");
db.exec(
  "CREATE TABLE IF NOT EXISTS _dr_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
);
const applied = new Set(
  db.prepare("SELECT name FROM _dr_migrations").all().map((r) => r.name),
);
const names = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const name of names) {
  if (applied.has(name)) continue;
  const sql = fs.readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO _dr_migrations (name, applied_at) VALUES (?, ?)").run(
      name,
      new Date().toISOString(),
    );
  })();
  console.log(`[migrate] applied ${name}`);
}
db.close();
