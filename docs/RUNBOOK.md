# Runbook — Sabor de Abraço PDV

## Visão Geral
Aplicação PDV para cafeteria: backend Node.js/Express + MongoDB/Mongoose, frontend React/Vite. Deploy no Render (ambiente de teste).

## Pré-requisitos
- Node.js >= 18
- npm
- Banco MongoDB (local ou cluster Atlas)

## Variáveis de Ambiente (backend)
Copiar `.env.example` para `.env` e preencher. Chaves críticas:

| Variável | Descrição |
|----------|-----------|
| `MONGO_URI` | String de conexão MongoDB. |
| `MONGO_DB_NAME` | Nome do database (`TesteOffDelivery` em teste). |
| `JWT_SECRET` | Segredo para assinatura JWT. Persistido em `RuntimeSettings` (via `authConfig.js`). |
| `ADMIN_USERNAME` | Usuário admin padrão. |
| `ADMIN_PASSWORD` | Senha admin padrão. |
| `EMPRESA_CNPJ` | CNPJ para NFC-e. |
| `EMPRESA_INSC_EST` | Inscrição estadual. |
| `SEFAZ_AMBIENTE` | `homologacao` ou `producao`. |
| `DELIVERY_ADMIN_EMAIL` | Email do admin DeliveryLink. |
| `DELIVERY_ADMIN_PASSWORD` | Senha do admin DeliveryLink. |
| `WHATSAPP_API_URL` | URL da API WhatsApp. |
| `WHATSAPP_ACCESS_TOKEN` | Token de acesso WhatsApp Cloud API. |

Variáveis opcionais: `DELIVERYLINK_TOKEN`, `DELIVERY_ADMIN_PASSWORD`, `FRONTEND_URL`.

## Como Rodar Localmente

### Backend
```bash
cd back-end
npm install
cp ../.env.example .env    # preencher variáveis
npm run dev                # nodemon, porta 3001
```
- Health check: `GET /api` → retorna `{ status: 'ok' }`

### Frontend
```bash
cd front-end
npm install
npm run dev                # Vite, porta 5173
```
- Configurar `VITE_API_URL=http://localhost:3001/api` em `.env`

## Como Testar
```bash
npm test                    # roda todos os testes
npm run test:backend        # somente backend
npm run test:frontend       # somente frontend
npm run lint                # lint
```

## Deploy no Render (ambiente de teste)

O `render.yaml` define dois serviços:

### 1. Serviço Backend (API)
- Tipo: `web` (Node.js)
- `rootDir: back-end`
- `buildCommand: npm ci --omit=dev`
- `startCommand: npm start`
- `healthCheckPath: /api`
- Plano: `free`
- Branch: `feature/pwa-offline-sincronizacao`

### 2. Site Estático Frontend
- Tipo: `static`
- `rootDir: front-end`
- `buildCommand: npm ci && VITE_API_URL="${API_PUBLIC_URL%/}/api" npm run build`
- `staticPublishPath: dist`
- Rewrite: `/*` → `/index.html` (SPA fallback)
- `API_PUBLIC_URL` aponta para o backend Render (`https://pdv-completo-z6ly.onrender.com`)

### Comandos de deploy
```bash
render deploy              # Render CLI
# ou via GitHub Actions (veja .github/)
```

## Troubleshooting

### API retorna 401
- Verificar se `JWT_SECRET` está definido no `.env`.
- O `authConfig.js` persiste o secret em `RuntimeSettings` coleção no MongoDB. Se alterado, deletar o documento `RuntimeSettings` e reiniciar.

### Conexão MongoDB falha
- Verificar `MONGO_URI` no `.env`.
- Checar se o IP está na whitelist do MongoDB Atlas.
- O `db.js` loga conexão bem-sucedida.

### NFC-e não emite
- Rodar `GET /api/fiscal/config` — verifica se `EMPRESA_CNPJ`, `EMPRESA_INSC_EST`, `SEFAZ_AMBIENTE` estão configurados.
- Checar logs do backend para `NfceProviderError`.
- Verificar se a SEFAZ está em manutenção (modo homologação vs produção).

### Sincronização offline (fila) não funciona
- Checar se há mais de 50 itens na fila (`OFFLINE_QUEUE_LIMIT=50`). Aguardar sync ou limpar IndexedDB.
- Se "Conecte à internet para sincronizar" aparece, limpar dados do site só após sync completo.
- Vendas em quarentena (`OFFLINE_ORIGIN_MISMATCH`) exigem confirmação no `StatusConexao.jsx`.

### Impressão térmica falha
- BLE: requer Chrome/Edge + HTTPS + permissão. Bluetooth Clássico SPP não é suportado.
- USB (Web Serial): requer Chrome/Edge + HTTPS + autorização de porta.
- Fallback: `imprimirNoSistema` usa iframe + window.print() — requer driver no SO.
- Itens de impressão falha ficam em `pdv_impressao_pendente` (localStorage) para reimpressão.

### DeliveryLink (entregas)
- `back-end/utils/deliveryOutbox.js` roda a cada 15s (`setInterval`) tentando enviar comandas fechadas com `entrega.status` em `pendente`/`erro`.
- Logs: `[DeliveryLink] Integração pendente; nova tentativa automática.`
- Erro: incrementa `entrega.tentativas` e agenda retry em 60s (`entrega.proximaTentativa`).

## Estrutura de Diretórios
```
back-end/
  server.js          # Express app, route mounts, middleware
  db.js              # Mongoose connection
  models/            # Schemas Mongoose
  routes/            # Rotas Express
  utils/             # Utils (nfce, pagamento, deliveryService, deliveryOutbox, etc.)
  middleware/        # auth, deliveryAuth
front-end/src/
  services/          # api.jsx, offlineStore, impressaoService, sessionInterceptors, accessSession
  hooks/             # useFilaOffline
  pages/             # PDV, Comandas, Login, etc.
  components/        # UI components (StatusConexao, etc.)
  context/           # ComandaContext
  utils/             # escpos (ESC/POS builder)
docs/                # Esta documentação
  adr/               # ADRs
```
