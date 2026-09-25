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

app.get("/", (req, res) => {
  const host = `http://onlinestorage.you.tec.br/`;
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FreeOnlineStorage - API Docs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container { max-width: 960px; margin: 0 auto; }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; color: #38bdf8; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .info-card {
      background: #1e293b;
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 2rem;
      border-left: 4px solid #38bdf8;
    }
    .info-card p { margin-bottom: 0.5rem; line-height: 1.6; }
    .info-card code {
      background: #334155;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9rem;
    }
    h2 {
      font-size: 1.25rem;
      margin: 1.5rem 0 1rem;
      color: #f8fafc;
      border-bottom: 1px solid #334155;
      padding-bottom: 0.5rem;
    }
    .endpoint {
      background: #1e293b;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
    }
    .method {
      display: inline-block;
      font-weight: 700;
      font-size: 0.75rem;
      padding: 4px 10px;
      border-radius: 4px;
      margin-right: 0.75rem;
      text-transform: uppercase;
    }
    .method.get { background: #166534; color: #bbf7d0; }
    .method.post { background: #1e40af; color: #bfdbfe; }
    .method.delete { background: #991b1b; color: #fecaca; }
    .path { font-family: monospace; font-size: 1rem; color: #fbbf24; }
    .desc { margin-top: 0.5rem; color: #cbd5e1; font-size: 0.92rem; line-height: 1.5; }
    .params { margin-top: 0.5rem; font-size: 0.85rem; color: #94a3b8; }
    .params strong { color: #e2e8f0; }
    .badge {
      display: inline-block;
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 999px;
      background: #7c3aed;
      color: #e9d5ff;
      margin-left: 0.5rem;
    }
    footer {
      margin-top: 3rem;
      text-align: center;
      color: #64748b;
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>FreeOnlineStorage API</h1>
    <p class="subtitle">Sistema de armazenamento Key-Value online (tipo localStorage)</p>

    <div class="info-card">
      <p><strong>Base URL da API:</strong> <code>${host}/api</code></p>
      <p><strong>Bucket padrão:</strong> <code>default</code></p>
      <p><strong>Como especificar bucket:</strong> escolha 1 forma:
        (1) query <code>?bucket=nome</code> |
        (2) body JSON <code>{"bucket": "nome"}</code> |
        (3) path param <code>/:bucket/...</code>
      </p>
      <p><strong>Admin Auth:</strong> algumas rotas requerem header <code>admin-auth</code> com o valor de <code>ADMIN_AUTH</code> do .env</p>
    </div>

    <h2>Saúde do Sistema</h2>
    <div class="endpoint">
      <span class="method get">GET</span><span class="path">/health</span>
      <p class="desc">Verifica status do servidor, uptime e timestamp.</p>
    </div>

    <h2>Buckets (Admin)</h2>
    <div class="endpoint">
      <span class="method get">GET</span><span class="path">/api/getallbuckets</span>
      <span class="badge">ADMIN</span>
      <p class="desc">Lista todos os buckets com contagem de itens e tamanho total.</p>
      <p class="params"><strong>Header:</strong> <code>admin-auth: {valor}</code></p>
    </div>

    <div class="endpoint">
      <span class="method delete">DELETE</span><span class="path">/api/deletebucket/:bucket</span>
      <span class="badge">ADMIN</span>
      <p class="desc">Apaga todas as chaves de um bucket específico via path param.</p>
      <p class="params"><strong>Params:</strong> <code>:bucket</code> - nome do bucket</p>
      <p class="params"><strong>Header:</strong> <code>admin-auth: {valor}</code></p>
    </div>

    <h2>Chaves (Keys)</h2>

    <div class="endpoint">
      <span class="method post">POST</span><span class="path">/api/</span>
      <p class="desc">Cria ou atualiza uma chave/valor via corpo JSON.</p>
      <p class="params"><strong>Body JSON:</strong> <code>{"key": "nome", "value": "qualquer", "bucket?"}</code></p>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span><span class="path">/api/getbucket/:bucket</span>
      <p class="desc">Retorna todas as chaves/valores de um bucket específico.</p>
      <p class="params"><strong>Params:</strong> <code>:bucket</code> - nome do bucket</p>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span><span class="path">/api/getkey/:bucket/:key</span>
      <p class="desc">Busca o valor de uma chave específica dentro de um bucket.</p>
      <p class="params"><strong>Params:</strong> <code>:bucket</code>, <code>:key</code></p>
    </div>
  
    <div class="endpoint">
      <span class="method get">GET</span><span class="path">/api/createkey/:bucket/:key/:value</span>
      <p class="desc">Cria ou atualiza uma chave diretamente via parâmetros na URL.</p>
      <p class="params"><strong>Params:</strong> <code>:bucket</code>, <code>:key</code>, <code>:value</code></p>
    </div>

    <div class="endpoint">
      <span class="method delete">DELETE</span><span class="path">/api/deletekey/:bucket/:key</span>
      <p class="desc">Remove uma chave específica de um bucket.</p>
      <p class="params"><strong>Params:</strong> <code>:bucket</code>, <code>:key</code></p>
    </div>

    <footer>
      FreeOnlineStorage &mdash; Rodando em ${host}
    </footer>
  </div>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
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
