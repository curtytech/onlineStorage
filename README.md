# freeonlinestorage

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.1.34. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Upload de arquivos

Envie o conteúdo binário do arquivo em `POST /files`. Qualquer tipo de arquivo é aceito, desde que tenha menos de 1 GiB. O arquivo é salvo em `UPLOAD_DIR` (por padrão, `./uploads`) com um identificador gerado pelo servidor.

```bash
curl -X POST http://localhost:3000/files \
  -H "Content-Type: application/octet-stream" \
  -H "X-File-Name: documento.pdf" \
  --data-binary "@documento.pdf"
```

O nome original pode ser informado no header `X-File-Name` ou pela query `?filename=documento.pdf`. A resposta `201` inclui `id`, `originalName`, `size` e `contentType`.

Para listar os uploads registrados, use `GET /files/getall` com o header `admin-auth` configurado pela variável `ADMIN_AUTH`. A resposta inclui os metadados dos arquivos e o total de registros.
