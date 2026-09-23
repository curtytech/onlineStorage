import express from "express";
import cors from "cors";
import apiRoutes from "./src/routes";
import { runMigrations } from "./src/db/migrate";

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_BYTES = 100 * 1024 * 1024;

const app = express();

app.use(cors());

app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.use((req, res, next) => {
  if (
    req.method === "GET" ||
    req.method === "DELETE" ||
    req.method === "HEAD" ||
    req.method === "OPTIONS"
  ) {
    return next();
  }

  const ct = req.headers["content-type"] || "";
  const isJson = /application\/json/i.test(ct);

  if (!isJson) return next();

  let total = 0;
  const chunks: Buffer[] = [];

  req.on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      res.status(413).json({ error: "Payload muito grande. Limite: 100MB" });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (res.headersSent) return;
    if (total === 0) {
      (req as any).body = {};
      return next();
    }

    const raw = Buffer.concat(chunks).toString("utf8");

    try {
      const parsed = JSON.parse(raw);
      (req as any).body = parsed;
      next();
    } catch (err: any) {
      res.status(400).json({
        error: "JSON inválido no corpo da requisição",
        detail: err.message,
      });
    }
  });

  req.on("error", (err: any) => {
    if (res.headersSent) return;
    res.status(400).json({
      error: "Erro ao ler corpo da requisição",
      detail: err.message,
    });
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

app.use("/api", apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Rota não encontrada", path: req.path, method: req.method });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Erro]", err);
  res.status(err.statusCode || err.status || 500).json({
    error: err.message || "Erro interno do servidor",
  });
});

async function start() {
  console.log("\n========================================");
  console.log("  FreeOnlineStorage API");
  console.log("========================================\n");

  console.log("[Setup] Executando migrations...");
  await runMigrations();

  console.log("");

  app.listen(PORT, HOST, () => {
    console.log(`[Servidor] Rodando em http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
    console.log(`[Saúde]    GET  http://localhost:${PORT}/health`);
    console.log(`[API]      GET  http://localhost:${PORT}/api`);
    console.log(`[Storage]  GET  http://localhost:${PORT}/api/storage`);
    // console.log(`[Buckets]  GET  http://localhost:${PORT}/api/storage/buckets`);
    console.log("");
  });
}

start().catch((err) => {
  console.error("[Fatal] Falha ao iniciar servidor:", err);
  process.exit(1);
});
