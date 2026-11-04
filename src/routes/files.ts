import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { Transform, type TransformCallback } from "node:stream";
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

class InvalidMultipartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMultipartError";
  }
}

class MultipartFileParser extends Transform {
  private buffer = Buffer.alloc(0);
  private phase: "start" | "headers" | "body" | "suffix" | "done" = "start";
  private readonly initialBoundary: Buffer;
  private readonly bodyBoundary: Buffer;
  private currentPartIsFile = false;
  fileName: string | undefined;
  contentType = "application/octet-stream";
  private fileSize = 0;

  constructor(boundary: string) {
    super();
    this.initialBoundary = Buffer.from(`--${boundary}\r\n`);
    this.bodyBoundary = Buffer.from(`\r\n--${boundary}`);
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    try {
      this.processBuffer();
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }

  _flush(callback: TransformCallback) {
    if (this.phase !== "done") {
      callback(new InvalidMultipartError("O formulário multipart está incompleto ou inválido"));
      return;
    }
    if (!this.fileName) {
      callback(new InvalidMultipartError("O campo de arquivo 'file' é obrigatório"));
      return;
    }
    callback();
  }

  private processBuffer() {
    while (true) {
      if (this.phase === "start") {
        if (this.buffer.length < this.initialBoundary.length) return;
        if (!this.buffer.subarray(0, this.initialBoundary.length).equals(this.initialBoundary)) {
          throw new InvalidMultipartError("O formulário multipart está inválido");
        }
        this.buffer = this.buffer.subarray(this.initialBoundary.length);
        this.phase = "headers";
      } else if (this.phase === "headers") {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd < 0) {
          if (this.buffer.length > 16 * 1024) {
            throw new InvalidMultipartError("Os cabeçalhos do formulário são muito grandes");
          }
          return;
        }

        const headers = this.buffer.subarray(0, headerEnd).toString("utf8");
        this.buffer = this.buffer.subarray(headerEnd + 4);
        this.readPartHeaders(headers);
        this.phase = "body";
      } else if (this.phase === "body") {
        const boundaryIndex = this.buffer.indexOf(this.bodyBoundary);
        if (boundaryIndex >= 0) {
          const suffixOffset = boundaryIndex + this.bodyBoundary.length;
          if (this.buffer.length < suffixOffset + 2) {
            this.writeFileData(this.buffer.subarray(0, boundaryIndex));
            this.buffer = this.buffer.subarray(boundaryIndex);
            return;
          }

          const suffix = this.buffer.subarray(suffixOffset, suffixOffset + 2).toString("ascii");
          if (suffix !== "--" && suffix !== "\r\n") {
            this.writeFileData(this.buffer.subarray(0, boundaryIndex + 1));
            this.buffer = this.buffer.subarray(boundaryIndex + 1);
            continue;
          }

          this.writeFileData(this.buffer.subarray(0, boundaryIndex));
          this.buffer = this.buffer.subarray(boundaryIndex + this.bodyBoundary.length);
          this.phase = "suffix";
        } else {
          const safeLength = this.buffer.length - this.bodyBoundary.length + 1;
          if (safeLength <= 0) return;
          this.writeFileData(this.buffer.subarray(0, safeLength));
          this.buffer = this.buffer.subarray(safeLength);
          return;
        }
      } else if (this.phase === "suffix") {
        if (this.buffer.length < 2) return;
        const suffix = this.buffer.subarray(0, 2).toString("ascii");
        this.buffer = this.buffer.subarray(2);
        if (suffix === "--") {
          this.phase = "done";
          return;
        }
        if (suffix !== "\r\n") {
          throw new InvalidMultipartError("O formulário multipart está inválido");
        }
        this.phase = "headers";
      } else {
        return;
      }
    }
  }

  private readPartHeaders(rawHeaders: string) {
    const headers = new Map<string, string>();
    for (const line of rawHeaders.split("\r\n")) {
      const separator = line.indexOf(":");
      if (separator <= 0) {
        throw new InvalidMultipartError("Os cabeçalhos do formulário são inválidos");
      }
      headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
    }

    const disposition = headers.get("content-disposition") || "";
    const getParameter = (name: string) => {
      const match = new RegExp(`(?:^|;)\\s*${name}=(?:"((?:\\\\.|[^"])*)"|([^;]*))`, "i").exec(disposition);
      return match ? (match[1] ?? match[2]).trim().replace(/\\(.)/g, "$1") : undefined;
    };
    const fieldName = getParameter("name");
    const fileName = getParameter("filename");

    this.currentPartIsFile = false;
    if (fileName !== undefined && fileName.length > 0) {
      if (fieldName !== "file") {
        throw new InvalidMultipartError("Envie o arquivo no campo 'file'");
      }
      if (this.fileName) {
        throw new InvalidMultipartError("Envie apenas um arquivo no campo 'file'");
      }
      this.fileName = fileName;
      this.contentType = headers.get("content-type") || "application/octet-stream";
      this.currentPartIsFile = true;
    }
  }

  private writeFileData(data: Buffer) {
    if (!this.currentPartIsFile || data.length === 0) return;
    this.fileSize += data.length;
    if (this.fileSize > MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeError();
    }
    this.push(data);
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
  const contentTypeHeader = req.get("content-type") || "";
  const boundary = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentTypeHeader);
  if (!/^multipart\/form-data\b/i.test(contentTypeHeader) || !boundary) {
    req.resume();
    return res.status(400).json({ error: "Envie o arquivo como multipart/form-data" });
  }
  const boundaryValue = (boundary[1] || boundary[2] || "").trim();
  if (!boundaryValue || boundaryValue.length > 70) {
    req.resume();
    return res.status(400).json({ error: "O boundary do formulário multipart é inválido" });
  }

  const requestedName =
    req.get("x-file-name") ||
    (typeof req.query.filename === "string" ? req.query.filename : undefined);
  if (requestedName && requestedName.length > 255) {
    req.resume();
    return res.status(400).json({ error: "O nome do arquivo deve ter no máximo 255 caracteres" });
  }

  const parser = new MultipartFileParser(boundaryValue);
  const id = randomUUID();
  const filePath = join(setupUploadDirectory(), id);
  const output = createWriteStream(filePath, { flags: "wx" });
  let size = 0;
  let settled = false;

  const fail = (error: Error) => {
    if (settled) return;
    settled = true;

    req.unpipe(parser);
    parser.unpipe(output);
    req.resume();
    const cleanup = () => {
      void unlink(filePath).catch((cleanupError: NodeJS.ErrnoException) => {
        if (cleanupError.code !== "ENOENT") {
          console.error("[Upload] Falha ao remover arquivo incompleto:", cleanupError);
        }
      });
    };
    if (output.closed) cleanup();
    else output.once("close", cleanup);
    output.destroy();

    if (error instanceof UploadTooLargeError) {
      res.status(413).json({ error: error.message });
      return;
    }
    if (error instanceof InvalidMultipartError) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  };

  req.on("error", fail);
  req.on("aborted", () => fail(new Error("Upload interrompido pelo cliente")));
  parser.on("error", fail);
  output.on("error", fail);
  output.on("finish", () => {
    if (settled) return;
    const originalName = requestedName || parser.fileName || "upload.bin";
    if (originalName.length > 255) {
      fail(new InvalidMultipartError("O nome do arquivo deve ter no máximo 255 caracteres"));
      return;
    }
    settled = true;
    const contentType = parser.contentType;

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

  output.on("drain", () => {
    if (parser.isPaused()) parser.resume();
  });
  parser.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (!output.write(chunk)) parser.pause();
  });
  parser.on("end", () => output.end());
  req.pipe(parser);
});

export default router;
