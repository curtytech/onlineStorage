import { unlink } from "node:fs/promises";
import { join } from "node:path";
import db from "../db/connection";
import { setupUploadDirectory } from "../setup";

const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type ExpiredUpload = {
  id: string;
};

let cleanupRunning = false;

export async function cleanupExpiredUploads(): Promise<void> {
  if (cleanupRunning) return;
  cleanupRunning = true;

  try {
    const expiredUploads = db
      .query<ExpiredUpload, []>(
        "SELECT id FROM uploads WHERE created_at < datetime('now', '-24 hours')"
      )
      .all();

    for (const upload of expiredUploads) {
      const filePath = join(setupUploadDirectory(), upload.id);

      try {
        await unlink(filePath);
      } catch (error) {
        const fileError = error as NodeJS.ErrnoException;
        if (fileError.code !== "ENOENT") {
          console.error(`[Cleanup] Falha ao remover o arquivo ${upload.id}:`, error);
          continue;
        }
      }

      db.query("DELETE FROM uploads WHERE id = ?").run(upload.id);
      console.log(`[Cleanup] Upload expirado removido: ${upload.id}`);
    }
  } catch (error) {
    console.error("[Cleanup] Falha ao limpar uploads expirados:", error);
  } finally {
    cleanupRunning = false;
  }
}

export function startUploadCleanup(): NodeJS.Timeout {
  void cleanupExpiredUploads();
  return setInterval(() => {
    void cleanupExpiredUploads();
  }, CLEANUP_INTERVAL_MS);
}
