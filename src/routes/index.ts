import { Router } from "express";
import keyValuesRouter from "./keyvalues";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    name: "FreeOnlineStorage API",
    version: "1.0.0",
    description: "Key-Value Storage online (tipo localStorage)",
    status: "running",
    how_to_specify_bucket:
      "Escolha UMA das 3 formas: (1) query ?bucket=nome OU (2) no body JSON { ..., \"bucket\": \"nome\" } OU (3) path param em rotas /:bucket/... (veja abaixo)",
    default_bucket: "default",
    endpoints: {
      list_buckets: "GET /api/storage/buckets",
      list_all_or_clear: "GET /api/storage | DELETE /api/storage (?bucket=nome OU body.bucket)",
      get_or_remove_key: "GET /api/storage/:key | DELETE /api/storage/:key (?bucket=nome OU body.bucket)",
      set_or_update_key: "POST /api/storage body: { key, value, bucket? }",
      batch_set: "POST /api/storage/batch body: { key1: val1, key2: val2, bucket? }",
    },
  });
});

router.use("/storage", keyValuesRouter);

export default router;
