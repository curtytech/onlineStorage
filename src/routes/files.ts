import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { Router } from "express";
import db from "../db/connection";
import { setupUploadDirectory } from "../setup";

const MAX_UPLOAD_BYTES = 1024 ** 3 - 1;

class UploadTooLargeError extends Error {
  constructor() {
    super("O arquivo deve ter menos de 1 GiB");
    this.name = "UploadTooLargeError";
  }
}

const router = Router();

router.get("/getall", (req, res) => {
  const adminAuth = req.get("admin-auth");
  if (!process.env.ADMIN_AUTH || adminAuth !== process.env.ADMIN_AUTH) {
    return res.status(403).json({ error: "Admin auth inválida Crie o Header admin-auth e informe o valor correto" });
  }

  const uploads = db
    .query(
      "SELECT id, original_name, password, size, content_type, created_at FROM uploads ORDER BY created_at DESC"
    )
    .all();

  res.json({ uploads, total: uploads.length });
});

router.post("/", (req, res, next) => {
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    req.resume();
    return res.status(413).json({ error: "O arquivo deve ter menos de 1 GiB" });
  }

  const originalName =
    req.get("x-file-name") ||
    (typeof req.query.filename === "string" ? req.query.filename : "upload.bin");

  if (originalName.length > 255) {
    req.resume();
    return res.status(400).json({ error: "O nome do arquivo deve ter no máximo 255 caracteres" });
  }

  const id = randomUUID();
  const filePath = join(setupUploadDirectory(), id);
  const output = createWriteStream(filePath, { flags: "wx" });
  let size = 0;
  let settled = false;

  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        callback(new UploadTooLargeError());
        return;
      }
      callback(null, chunk);
    },
  });

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;

    req.unpipe(limiter);
    limiter.unpipe(output);
    req.resume();
    output.once("close", () => {
      void unlink(filePath).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") {
          console.error("[Upload] Falha ao remover arquivo incompleto:", cleanupError);
        }
      });
    });
    output.destroy();

    if (error instanceof UploadTooLargeError) {
      res.status(413).json({ error: error.message });
      return;
    }
    next(error);
  };

  req.on("error", fail);
  req.on("aborted", () => fail(new Error("Upload interrompido pelo cliente")));
  limiter.on("error", fail);
  output.on("error", fail);
  output.on("finish", () => {
    if (settled) return;
    settled = true;
    const contentType = req.get("content-type") || "application/octet-stream";

    try {
      db.query(
        "INSERT INTO uploads (id, original_name, size, content_type) VALUES (?, ?, ?, ?)"
      ).run(id, originalName, size, contentType);
    } catch (error) {
      void unlink(filePath).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") {
          console.error("[Upload] Falha ao remover arquivo sem registro:", cleanupError);
        }
      });
      next(error);
      return;
    }

    res.status(201).json({
      id,
      originalName,
      size,
      contentType,
    });
  });

  req.pipe(limiter).pipe(output);
});

export default router;
