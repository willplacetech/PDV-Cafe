# PDV

Sistema de atendimento e ponto de venda (white-label).

Branch de demonstração neutra: **`Generico`**.

## Principais recursos

- Produtos por unidade, peso ou volume (até três casas decimais).
- Comandas para mesa/balcão, com fechamento gerando pedido e baixa de estoque.
- Campos de situação fiscal por pedido; configuração segura em `GET /api/fiscal/config`.
- PWA com tema claro/escuro e branding configurável via variáveis `VITE_APP_*`.

## White-label (branding)

No build do front-end (Vite), opcional:

```bash
VITE_APP_NAME=PDV
VITE_APP_SHORT_NAME=PDV
VITE_APP_TAGLINE=Sistema de atendimento
VITE_APP_LOGO_URL=/logo.svg
VITE_APP_THEME_COLOR=#4f9d6a
VITE_APP_BG_COLOR=#f3f6f1
```

Defaults neutros estão em `front-end/src/config/branding.js`, `index.html` e `public/manifest.json`.

## Consumo da equipe

O cadastro disponibiliza o **Cliente Interno**. No PDV, use **Registrar consumo interno**. O registro não gera dívida, recebimento ou fidelidade; baixa o estoque uma vez. Custos aparecem no **Financeiro → DRE / EBITDA** (linha de consumo da equipe), separados do CMV.

## Fiscal

Nenhum documento fiscal é emitido sem configuração explícita de provedor. Use `back-end/.env.example` e mantenha credenciais apenas no servidor.

## Impressão térmica local

**Configurações → Impressoras** (`/ajustes/impressoras`): preferência e dados do estabelecimento ficam no `localStorage` do dispositivo. Ordem de tentativa: BLE → USB/Serial → impressão do sistema (Chrome em HTTPS/localhost).

## Execução local

```bash
cd back-end && npm install && npm start
cd front-end && npm install && npm run dev
```

Crie `back-end/.env` a partir de `.env.example` com `MONGO_URI`. Em banco novo, `ADMIN_PASSWORD` com pelo menos 12 caracteres.

## Deploy no Render

Blueprint de referência: `render.yaml` (ambiente de teste). Ajuste a **branch** do serviço para `Generico` (ou a branch de apresentação) no painel do Render.

Informe `MONGO_URI` (e `ADMIN_PASSWORD` se for banco novo). Não versionar secrets no GitHub.

URLs de exemplo (substitua pelas do seu projeto):

- API: `https://seu-pdv-api.onrender.com`
- Front-end: `https://seu-pdv-web.onrender.com`

## Validação

```bash
npm test
npm run test:frontend:unit
npm run lint
npm --prefix front-end run build
```

E2E seguro (API interceptada):

```bash
npm run test:frontend -- --spec tests/e2e/regressao_segura.cy.js --config baseUrl=http://127.0.0.1:5173
```

Veja [CORRECOES.md](CORRECOES.md) para histórico de correções.
