import type { Database } from "bun:sqlite";

export default {
  up(db: Database) {
    db.run(`
      CREATE TABLE uploads (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        password TEXT,
        size INTEGER NOT NULL,
        content_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },

  down(db: Database) {
    db.run("DROP TABLE IF EXISTS uploads");
  },
};
