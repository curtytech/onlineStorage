import type { Database } from "bun:sqlite";

export default {
  up(db: Database) {
    db.run(`ALTER TABLE key_values ADD COLUMN size INTEGER DEFAULT 0`);

    const rows = db
      .query("SELECT id, value FROM key_values WHERE size IS NULL OR size = 0")
      .all() as any[];

    const updateStmt = db.query("UPDATE key_values SET size = ? WHERE id = ?");
    const tx = db.transaction(() => {
      for (const row of rows) {
        updateStmt.run(Buffer.byteLength(String(row.value), "utf8"), row.id);
      }
    });
    tx();
  },

  down(db: Database) {
    try {
      db.run(`ALTER TABLE key_values DROP COLUMN size`);
    } catch (err) {
      console.warn("[Migration down] Não foi possível remover coluna size:", err);
    }
  },
};
