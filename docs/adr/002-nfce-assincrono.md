# ADR-002: Emissão NFC-e Assíncrona

## Status
Aceito — implementado em `back-end/utils/nfce.js`, `back-end/routes/fiscal.js`, `back-end/models/Order.js`.

## Contexto
A emissão de NFC-e (Nota Fiscal do Consumidor Eletrônica) depende de comunicação com a SEFAZ, que pode ter latência variável ou falhar temporariamente. Bloquear a API ou o caixa enquanto a nota é emitida degrada a experiência do atendente e do cliente na cafeteria.

## Decisão

### 1. Arquitetura Assíncrona
- A rota `POST /api/fiscal/orders/:id/emitir` (em `routes/fiscal.js`) inicia a emissão de forma não-bloqueante.
- O backend chama `emitirNfce()` (de `utils/nfce.js`), que:
  - Busca a configuração fiscal via `getFiscalConfig()` (variáveis de ambiente: `EMPRESA_CNPJ`, `EMPRESA_INSC_EST`, `SEFAZ_AMBIENTE`, etc.).
  - Envia a nota para a SEFAZ.
  - Atualiza o subdocumento `nfce` do `Order` com o status resultante.

### 2. Subdocumento `nfce` no Order
O schema `Order` contém um subdocumento `nfce` com os seguintes estados de `status`:
- `autorizada` — NFC-e emitida e autorizada com sucesso (`chaveAcesso`, `pdfBase64`).
- `processando` — emissão em andamento (não bloquear o fluxo).
- `erro` — falha na emissão (`erro` descreve a falha; `chaveAcesso` permanece em branco).

### 3. Resposta da API
- A rota `POST /api/fiscal/orders/:id/emitir` retorna imediatamente com `{ status, message }` indicando que a emissão foi **iniciada** (`status: 'processando'`), não o resultado final.
- O status final da NFC-e deve ser verificado posteriormente via:
  - `GET /api/orders/:id` — retorna o `Order` com o campo `nfce.status` atualizado.
  - `GET /api/fiscal/config` — verifica se a configuração fiscal está completa (usado na UI antes de tentar emitir).

### 4. [DECISÃO PENDENTE] Retry automático com back-off
- Em caso de erro (`status: 'erro'`), o campo `nfce.erro` contém a mensagem retornada pela SEFAZ.
- A emissão pode ser retriggerada chamando novamente `POST /api/fiscal/orders/:id/emitir`.
- **[DECISÃO PENDENTE]** Não há mecanismo de retry automático com back-off observado no código. Definir: backoff exponencial (30s → 1min → 5min → 15min), teto de N tentativas, e limite de tempo para desistir.

### 5. Impressão da DANFE
- `imprimirNFCeDanfe` em `front-end/src/services/impressaoService.js` já implementado: aceita `data.pdf` (Blob/URL) via `imprimirNoSistema` (iframe), ou monta ESC/POS receipt como fallback.

## Consequências
- **Positivas**: caixa não trava durante emissão; UX fluido na cafeteria.
- **Negativas**: cliente precisa sondar o status posteriormente; possível emitir nota com atraso em relação à venda.
- **Risco operacional**: se a SEFAZ estiver indisponível, a venda é registrada mas a nota fica pendente — o operador deve monitorar o status via UI.

## Referências
- `back-end/utils/nfce.js` — `emitirNfce()`, `getFiscalConfig()`, `NfceProviderError`
- `back-end/routes/fiscal.js` — `GET /config`, `POST /orders/:id/emitir`
- `back-end/models/Order.js` — subdocumento `nfce`
- `front-end/src/services/impressaoService.js` — `imprimirNFCeDanfe`
- `back-end/.env.example` — variáveis SEFAZ e empresa
