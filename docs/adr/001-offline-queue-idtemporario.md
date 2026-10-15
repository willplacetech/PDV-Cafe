# ADR-001: Fila Offline com ID Temporário

## Status
Aceito — implementado em `front-end/src/services/offlineStore.js`, `front-end/src/hooks/useFilaOffline.js`, `front-end/src/context/ComandaContext.jsx`, `back-end/models/Comanda.js`.

## Contexto
O PDV deve operar em ambientes de cafeteria com conectividade intermitente. As vendas precisam ser registradas mesmo sem conexão com o backend e sincronizadas posteriormente, sem duplicatas nem perda de dados. Além disso, vendas legadas (de operadores ou comércios diferentes) precisam ser revisadas antes de ser lançadas, para evitar contaminação de dados de comissão e identidade fiscal.

## Decisão

### 1. ID Temporário (`idTemporario`)
- Cada venda offline recebe um `idTemporario` único gerado no cliente (`useFilaOffline.idTemporarioNovo()`), baseado em timestamp + random.
- O `idTemporario` é enviado no corpo da requisição (`ComandaContext.salvarComandaAberta` → `POST /comandas` com `idTemporario`).
- O backend usa `idTemporario` para deduplicação: se uma venda com o mesmo `idTemporario` já foi processada, a requisição é tratada como idempotente (não cria duplicata).

### 2. Fila Offline (IndexedDB)
- Armazenamento: IndexedDB via `localforage` com nome `fila` (`OFFLINE_QUEUE_STORE='fila'`).
- Limite: `OFFLINE_QUEUE_LIMIT=50` itens. Ao atingir o limite (`armazenamentoCheio`), a UI mostra alerta e impede novas vendas offline até sincronização.
- Estrutura de cada item: `{ endpoint, method, body, status, tentativas, idTemporario, origem }`.
- Status dos itens: `pendente` → `processando` → `concluido` | `erro`.

### 3. Sincronização
- Trigger: evento `online` do navegador (`window.addEventListener('online', sync)`).
- Leasing: `SYNC_LEASE_MS=90_000` (90s) — evita múltiplas sincronizações concorrentes em abas diferentes. Um lock temporário é adquirido antes de processar a fila.
- DEDUP: antes de enfileirar, verifica se um item com a mesma assinatura canônica (`canonicalJSON` dos campos `endpoint`, `method`, `body`) já existe.
- CORS-aware: a sincronização só roda quando `navigator.onLine === true`; quando offline, novos itens vão direto para a fila sem tentativa de envio.

### 4. Origem (Quarentena de Vendas Legadas)
- Cada item na fila carrega um `origem` capturado em `useFilaOffline.origemAtual()` — contém `{ operadorId, comercioId }` (do accessSession).
- Na sincronização, se a origem capturada não bate com a origem atual da sessão, o item entra em **quarentena** com `motivoQuarentena: 'OFFLINE_ORIGIN_MISMATCH'`.
- Itens em quarentena ficam visíveis na UI (`StatusConexao.jsx`) e exigem confirmação manual (`resolverOrigem(id, reason, confirmed)`) antes de serem reenviados.
- Alerta de UI: "A venda {idTemporario} foi rejeitada porque o operador ou comércio mudou. Confira os dados antes de lançá-la novamente."

### 5. Persistência de Dados Financeiros
- `ComandaContext` usa `criarOperacoesFinanceiras(api)` (de `utils/operacaoFinanceira.js`) para operações que envolvem pagamentos, garantindo consistência mesmo na sincronização offline.
- `fecharComanda` → `POST /comandas/{id}/fechar` — o fechamento da comanda (pagamento) também passa pela fila offline se offline.

### 6. [DECISÃO PENDENTE] Retry de itens com erro
- Atualmente, itens que falham na sincronização ficam com `status: 'erro'` e `tentativas` incrementado, mas **não há retry automático** observado no código — o reenvio depende de nova sincronização manual (via `online` event ou `reimprimirPendente`).
- **Sugestão**: implementar retry exponencial com backoff (`tentativas` * 30s) e limite máximo de 5 tentativas. Após limite, manter como `erro` e exigir intervenção manual.

## Consequências
- **Positivas**: funcionamento contínuo sem conexão; deduplicação automática via `idTemporario`; auditoria de origem para vendas legadas.
- **Negativas**: limite de 50 itens pode ser insuficiente para alta volume em eventos; a quarentena exige intervenção manual; sem retry automático, falhas transitórias exigem ação manual.
- **Risco de dados**: se o navegador for configurado para limpar dados do site, vendas pendentes são perdidas — a UI exibe aviso explícito: "Não limpe os dados do site enquanto houver vendas pendentes."

## Referências
- `front-end/src/services/offlineStore.js` — implementação da fila, constants e sync
- `front-end/src/hooks/useFilaOffline.js` — geração de idTemporario, origem, sync
- `front-end/src/context/ComandaContext.jsx` — uso no fluxo de comanda
- `front-end/src/components/StatusConexao.jsx` — UI de status
- `back-end/models/Comanda.js` — campo `idTemporario`
