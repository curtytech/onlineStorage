import { mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

function ensureDir(relative: string): string {
  const p = resolve(ROOT, relative);
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true });
  }
  return p;
}

export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !process.env.ADMIN_AUTH) {
    console.error(
      "[Erro] Variável ADMIN_AUTH é OBRIGATÓRIA em produção. Defina no arquivo .env ou variável de ambiente."
    );
    process.exit(1);
  }

  if (!process.env.ADMIN_AUTH) {
    console.warn(
      "[Aviso] ADMIN_AUTH não definida. Endpoints de admin não funcionarão corretamente."
    );
  }
}

export function setupDirectories() {
  const dataDir = ensureDir(process.env.DB_PATH ? dirname(resolve(ROOT, process.env.DB_PATH)) : "./data");
  const uploadDir = ensureDir(process.env.UPLOAD_DIR || "./uploads");
  return { dataDir, uploadDir };
}

if (import.meta.main) {
  validateEnv();
  const dirs = setupDirectories();
  console.log("[Setup] Variáveis validadas.");
  console.log("[Setup] Diretórios garantidos:", dirs);
}
