import { Router } from "express";
import db from "../db/connection";

const router = Router();

const DEFAULT_BUCKET = "default";

function parseValue(val: string): any {
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

function serializeValue(val: any): string {
  return typeof val === "string" ? val : JSON.stringify(val);
}

function byteLength(str: string): number {
  return Buffer.byteLength(str, "utf8");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function resolveBucket(source: { query?: any; body?: any; params?: any }): string {
  const candidates = [
    source?.params?.bucket,
    source?.body?.bucket,
    source?.query?.bucket,
  ];
  for (const v of candidates) {
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v);
    }
  }
  return DEFAULT_BUCKET;
}

router.get("/getallbuckets", (req, res) => {

  const adminAuth = req.headers["admin-auth"];
  if (adminAuth !== process.env.ADMIN_AUTH) {
    return res.status(403).json({ error: "Admin auth inválida Crie o Header admin-auth e informe o valor correto" });
  }

  const bucket = resolveBucket(req);

  if (bucket !== DEFAULT_BUCKET) {
    return res.status(403).json({ error: "Apenas bucket default permitido" });
  }

  const rows = db
    .query(
      "SELECT bucket, COUNT(*) as items, COALESCE(SUM(size),0) as bytes FROM key_values GROUP BY bucket ORDER BY bucket ASC"
    )
    .all() as any[];

  const buckets = rows.map((r) => ({
    bucket: r.bucket,
    items: Number(r.items),
    total_size: Number(r.bytes),
    total_size_human: formatBytes(Number(r.bytes)),
  }));

  res.json({ buckets, total: buckets.length });
});

// router.post("/batch", (req, res) => {
//   const bucket = resolveBucket(req);
//   const data = req.body;

//   if (!data || typeof data !== "object" || Array.isArray(data)) {
//     return res.status(400).json({ error: "Body deve ser um objeto { key: value, ... }" });
//   }

//   const entries = Object.entries(data).filter(([k]) => {
//     if (k === "bucket") return false;
//     return true;
//   });

//   if (entries.length === 0) {
//     return res.status(400).json({ error: "Nenhum par chave/valor informado" });
//   }

//   const tx = db.transaction(() => {
//     for (const [key, value] of entries) {
//       const serialized = serializeValue(value);
//       const size = byteLength(serialized);
//       const existing = db
//         .query("SELECT id FROM key_values WHERE bucket = ? AND key = ?")
//         .get(bucket, key) as any;

//       if (existing) {
//         db.query(
//           "UPDATE key_values SET value = ?, size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
//         ).run(serialized, size, existing.id);
//       } else {
//         db.query(
//           "INSERT INTO key_values (bucket, key, value, size) VALUES (?, ?, ?, ?)"
//         ).run(bucket, key, serialized, size);
//       }
//     }
//   });
//   tx();

//   const rows = db
//     .query(
//       "SELECT key, value, size, created_at, updated_at FROM key_values WHERE bucket = ? ORDER BY updated_at DESC"
//     )
//     .all(bucket) as any[];

//   const obj: Record<string, any> = {};
//   let totalBytes = 0;
//   for (const row of rows) {
//     obj[row.key] = parseValue(row.value);
//     totalBytes += Number(row.size || 0);
//   }

//   res.status(200).json({
//     bucket,
//     data: obj,
//     count: rows.length,
//     total_size: totalBytes,
//     total_size_human: formatBytes(totalBytes),
//   });
// });

router.get("/getbucket/:bucket", (req, res) => {
  const bucket = resolveBucket(req);

  const rows = db
    .query(
      "SELECT key, value, size, created_at, updated_at FROM key_values WHERE bucket = ? ORDER BY updated_at DESC"
    )
    .all(bucket) as any[];

  const obj: Record<string, any> = {};
  let totalBytes = 0;
  for (const row of rows) {
    obj[row.key] = parseValue(row.value);
    totalBytes += Number(row.size || 0);
  }

  res.json({
    bucket,
    data: obj,
    count: rows.length,
    total_size: totalBytes,
    total_size_human: formatBytes(totalBytes),
  });
});

router.get("/getkey/:bucket/:key", (req, res) => {
  const bucket = resolveBucket(req);
  const key = req.params.key;

  const row = db
    .query(
      "SELECT bucket, key, value, size, created_at, updated_at FROM key_values WHERE bucket = ? AND key = ?"
    )
    .get(bucket, key) as any;

  if (!row) {
    return res.status(404).json({ bucket, key, value: null });
  }

  res.json({
    bucket: row.bucket,
    key: row.key,
    value: parseValue(row.value),
    size: Number(row.size || 0),
    size_human: formatBytes(Number(row.size || 0)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

router.post("/", (req, res) => {
  const bucket = resolveBucket(req);
  const { key, value } = req.body;

  if (!key || String(key).trim() === "") {
    return res.status(400).json({ error: "'key' é obrigatória" });
  }
  if (value === undefined) {
    return res.status(400).json({ error: "'value' é obrigatório" });
  }

  const serialized = serializeValue(value);
  const size = byteLength(serialized);

  const existing = db
    .query("SELECT id FROM key_values WHERE bucket = ? AND key = ?")
    .get(bucket, String(key)) as any;

  if (existing) {
    db.query(
      "UPDATE key_values SET value = ?, size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(serialized, size, existing.id);
  } else {
    db.query(
      "INSERT INTO key_values (bucket, key, value, size) VALUES (?, ?, ?, ?)"
    ).run(bucket, String(key), serialized, size);
  }

  const row = db
    .query(
      "SELECT bucket, key, value, size, created_at, updated_at FROM key_values WHERE bucket = ? AND key = ?"
    )
    .get(bucket, String(key)) as any;

  res.status(existing ? 200 : 201).json({
    bucket: row.bucket,
    key: row.key,
    value: parseValue(row.value),
    size: Number(row.size || 0),
    size_human: formatBytes(Number(row.size || 0)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

router.get("/createkey/:bucket/:key/:value", (req, res) => {
  const bucket = req.params.bucket || DEFAULT_BUCKET;
  const key = req.params.key;
  const value = req.params.value;

  if (!key || String(key).trim() === "") {
    return res.status(400).json({ error: "'key' é obrigatória" });
  }
  if (value === undefined) {
    return res.status(400).json({ error: "'value' é obrigatório" });
  }

  const serialized = serializeValue(value);
  const size = byteLength(serialized);

  const existing = db
    .query("SELECT id FROM key_values WHERE bucket = ? AND key = ?")
    .get(bucket, String(key)) as any;

  if (existing) {
    db.query(
      "UPDATE key_values SET value = ?, size = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(serialized, size, existing.id);
  } else {
    db.query(
      "INSERT INTO key_values (bucket, key, value, size) VALUES (?, ?, ?, ?)"
    ).run(bucket, String(key), serialized, size);
  }

  const row = db
    .query(
      "SELECT bucket, key, value, size, created_at, updated_at FROM key_values WHERE bucket = ? AND key = ?"
    )
    .get(bucket, String(key)) as any;

  res.status(existing ? 200 : 201).json({
    bucket: row.bucket,
    key: row.key,
    value: parseValue(row.value),
    size: Number(row.size || 0),
    size_human: formatBytes(Number(row.size || 0)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

router.delete("/deletekey/:bucket/:key", (req, res) => {
  const bucket = resolveBucket(req);
  const key = req.params.key;

  const existing = db
    .query("SELECT id, size FROM key_values WHERE bucket = ? AND key = ?")
    .get(bucket, key) as any;

  if (!existing) {
    return res.status(404).json({ error: "Key não encontrada", bucket, key });
  }

  db.query("DELETE FROM key_values WHERE id = ?").run(existing.id);
  res.status(200).json({
    deleted: true,
    bucket,
    key,
    freed_bytes: Number(existing.size || 0),
    freed_human: formatBytes(Number(existing.size || 0)),
  });
});

router.delete("/", (req, res) => {
  const bucket = resolveBucket(req);

  const info = db
    .query("SELECT COUNT(*) as c, COALESCE(SUM(size),0) as b FROM key_values WHERE bucket = ?")
    .get(bucket) as any;

  db.query("DELETE FROM key_values WHERE bucket = ?").run(bucket);

  res.status(200).json({
    cleared: true,
    bucket,
    removed: Number(info.c),
    freed_bytes: Number(info.b),
    freed_human: formatBytes(Number(info.b)),
  });
});

export default router;
