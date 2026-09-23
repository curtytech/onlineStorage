import type { Database } from "bun:sqlite";

export default {
  up(db: Database) {
    db.run(`
      CREATE TABLE key_values (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bucket TEXT NOT NULL DEFAULT 'default',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bucket, key)
      )
    `);

    db.run(`CREATE INDEX idx_key_values_bucket ON key_values(bucket)`);
    db.run(`CREATE INDEX idx_key_values_key ON key_values(key)`);
  },

  down(db: Database) {
    db.run("DROP INDEX IF EXISTS idx_key_values_key");
    db.run("DROP INDEX IF EXISTS idx_key_values_bucket");
    db.run("DROP TABLE IF EXISTS key_values");
  },
};
