# Relatório de Registro de Imagens

## 1. Contexto atual

O projeto está preparado para receber imagens no Supabase Storage e criar registros na tabela `public.capturas`.

Até o momento, foram implementadas duas abordagens principais:

- uma rota de webhook no backend para receber eventos de upload e registrar a captura;
- um script de fallback que sincroniza manualmente arquivos do bucket com a tabela `capturas`.

## 2. O que foi feito

### 2.1 Rota de captura automática

Arquivo criado:
- `routes/capturas.js`

Rota adicionada em `server.js`:
- `POST /api/capturas/storage-event`

O que essa rota faz:
- valida o segredo de webhook via `x-storage-sync-secret` (opcional);
- recebe o nome do arquivo enviado ao Storage (`imagem_url` ou `fileName`);
- identifica a armadilha com base no identificador (`SPY-07`) extraído do nome do arquivo ou recebido em `armadilha_identificador`;
- busca `armadilha_id` na tabela `armadilhas`;
- insere um registro em `capturas` com:
  - `armadilha_id`
  - `capturada_em`
  - `total_insetos`
  - `nivel`
  - `confianca_ia`
  - `imagem_url`
  - `bounding_boxes`
  - `criado_em`

### 2.2 Ajuste das variáveis de ambiente

Foram adicionadas e ajustadas no `.env`:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `STORAGE_SYNC_SECRET`

Essas variáveis permitem que o backend use a chave correta do Supabase e proteja o webhook.

### 2.3 Script de fallback

Arquivo criado:
- `storage-to-capturas.js`

O que ele faz:
- lista os arquivos no bucket `armadilha-imagens`;
- compara com os registros existentes em `capturas`;
- insere novas capturas para arquivos ainda não registrados;
- identifica armadilhas pelo prefixo do nome do arquivo `SPY-07`.

### 2.4 Script de upload manual

Arquivo criado:
- `upload-manual.js`

O que ele faz:
- permite fazer upload manual de imagens presentes na pasta `capturas-img` para o bucket;
- insere o registro correspondente em `capturas`.

### 2.5 Commit e envio ao GitHub

Todas as mudanças relevantes foram commitadas e empurradas para o repositório remoto em `main`.

## 3. Como está funcionando agora

O backend está pronto para processar um evento de upload se receber o POST correto para a rota `POST /api/capturas/storage-event`.

Por enquanto, o fluxo automático ainda depende da ESP32CAM ou do servidor de upload enviar esse webhook logo após a imagem ser gravada no Storage.

## 4. O que está pendente

### 4.1 Integração final com o envio direto da ESP32CAM

Ainda é necessário que a ESP32CAM execute um POST para:

- `http://<seu-backend>/api/capturas/storage-event`

com o payload JSON contendo ao menos:

```json
{
  "imagem_url": "SPY-07-08052026-2030-0002.jpeg",
  "armadilha_identificador": "SPY-07",
  "capturada_em": "2026-05-08T20:30:00Z",
  "total_insetos": 5,
  "nivel": "low",
  "confianca_ia": 90
}
```

E, se estiver usando, o header:

```
 x-storage-sync-secret: storage-sync-secret
```

### 4.2 Falta de evento automático direto do Storage

Como a imagem está sendo enviada direto pela ESP32CAM para o Storage, o backend não é notificado automaticamente.

O webhook resolve isso, mas ele só funciona se o firmware ou servidor da ESP32CAM enviar a requisição.

### 4.3 Dashboard

A dashboard já consegue usar `imagem_url` para montar a URL pública do Storage, desde que o registro exista em `capturas`.

Se os registros não estiverem sendo criados, a interface ainda não mostrará as imagens.

## 5. Próximos passos recomendados

1. Ajustar a ESP32CAM para fazer o POST ao webhook após o upload ao bucket.
2. Se não for possível alterar a ESP32CAM, agendar a execução de `storage-to-capturas.js` periodicamente como fallback.
3. Validar no painel do Supabase se novos registros aparecem em `public.capturas` imediatamente após o upload.
4. Confirmar se a dashboard está usando `imagem_url` e exibindo a imagem pela URL pública do Storage.

## 6. Observações finais

O backend já foi preparado. O ponto crítico restante é a ligação entre o upload direto no Storage e o registro na tabela `capturas`.

Se quiser, posso também criar um pequeno documento de instrução para o Jean copiar no firmware ou no servidor da ESP32CAM.
