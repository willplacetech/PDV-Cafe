# UI Loading and Empty-State Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard, PDV, and delivery loading, empty, and error states explicit without global overlays.

**Architecture:** Keep loading feedback inside each owning card or page. Reuse the PDV's existing product skeleton and shared skeleton component where practical; preserve dashboard API routes and validate the chart response before changing aggregation logic.

**Tech Stack:** React 19, Vite 8, JavaScript, Express, Jest, Cypress.

**Spec:** `docs/superpowers/specs/2026-10-16-estabilidade-paginacao-design.md`

## Global Constraints

- Preserve the existing creme/marrom visual identity and tokens.
- Keep React + Vite in JavaScript; do not start the TypeScript migration.
- Do not change authentication, checkout, inventory, or revenue rules.
- Loading is not an empty result; API errors are not empty results.
- Do not remove a global indicator unless it exists in the source path being changed.

## Review Focus

- Product endpoint failure without offline catalog must show an error, not “Nenhum produto cadastrado.”
- Product endpoint returning an empty array must still show the valid empty-catalog state.
- A delayed chart request must show loading until success or error.
- A chart endpoint error must remain retryable/visible and must not be rendered as zero sales.
- `/api/dashboard/urgencias` must remain authenticated/admin-only and return the expected array contract.

---

### Task 1: Product Catalog Loading and Error States

**Files:**
- Modify: `front-end/src/pages/PDV.jsx`
- Test: `front-end/tests/e2e/pdv_mobile.cy.js`
- Test: `front-end/tests/e2e/fluxo_principal.cy.js`

**Interfaces:**
- Consumes: Existing `/products/pdv` array response and `pdv_catalogo_offline` cache.
- Produces: Explicit catalog load state so only a successful empty response displays the empty-catalog message.

- [ ] **Step 1: Write failing Cypress cases** for delayed product response, valid empty response, and failed request without offline catalog.
- [ ] **Step 2: Run the focused Cypress spec** and verify the error case currently renders the wrong empty state.
- [ ] **Step 3: Implement explicit catalog state** in `PDV.jsx`, retaining the current skeleton while loading, valid empty state on a successful empty response, and a visible retry/error state when both API and usable offline cache are unavailable.
- [ ] **Step 4: Rerun the focused Cypress cases** and verify existing offline-catalog behavior remains intact.
- [ ] **Step 5: Commit** the tested PDV state change.

### Task 2: Dashboard Chart and Card Loading

**Files:**
- Modify: `front-end/src/components/dashboard/DeliveryAnalytics.jsx`
- Modify: `front-end/src/pages/Dashboard.jsx`
- Test: `front-end/tests/e2e/dashboard_pwa.cy.js`

**Interfaces:**
- Consumes: `GET /dashboard/receita-7-dias` returning seven `{ data, dia, total, pedidos, ticketMedio }` records.
- Produces: Separate loading, empty, error, and loaded visual states for the chart; local dashboard-card skeleton while the dashboard payload is pending.

- [ ] **Step 1: Add Cypress coverage** for delayed chart response, empty response, error response, and dashboard initial loading.
- [ ] **Step 2: Run the focused dashboard spec** and verify delayed loading is not represented as “no data.”
- [ ] **Step 3: Add local loading state** to `DeliveryAnalytics.jsx`, keeping the chart empty state for a completed empty response and the existing error state for failures.
- [ ] **Step 4: Replace the whole-page dashboard loading text** with card-shaped skeletons that use existing theme tokens; do not introduce a fixed footer overlay.
- [ ] **Step 5: Rerun the dashboard spec and production build.**
- [ ] **Step 6: Commit** the tested dashboard states.

### Task 3: Urgencies Route Contract Regression

**Files:**
- Test: `back-end/test/dashboard.test.js`
- Inspect only unless a failing regression requires a code change: `back-end/routes/dashboard.js`, `back-end/server.js`

**Interfaces:**
- Consumes: Existing `router.get('/urgencias', ...)` mounted at `/api/dashboard`.
- Produces: Test evidence that the authenticated administrator route resolves and returns an array.

- [ ] **Step 1: Inspect dashboard test setup and add a route test** for the mounted endpoint, expected array response, and non-admin denial.
- [ ] **Step 2: Run the targeted Jest test** and confirm it detects a missing/unmounted route or wrong role behavior.
- [ ] **Step 3: Change routing only if the regression test proves it is necessary.**
- [ ] **Step 4: Run the focused test and relevant backend suite.**
- [ ] **Step 5: Commit** the regression test and any required route fix.

### Task 4: Remove Verified Global Footer Indicator

**Files:**
- Modify only the component that actually renders the fixed footer indicator, if present.
- Test: Add or extend the owning screen test to prove the fixed global indicator is absent during local card loading.

**Interfaces:**
- Consumes: Existing local loading states from Tasks 1–2 and delivery page loading state.
- Produces: No global fixed “Aguarde…” overlay in Dashboard, PDV, or Entregas.

- [ ] **Step 1: Trace the rendered indicator** from each affected route, including shared layout and delivery entry components; do not infer from text-only search.
- [ ] **Step 2: If present, add a route-level regression test** that waits on a delayed request and asserts no fixed global footer overlay blocks the page.
- [ ] **Step 3: Remove only the shared indicator responsible** and retain local button/action busy states.
- [ ] **Step 4: Verify the regression tests at mobile and desktop viewports.**
- [ ] **Step 5: Commit** only the verified removal.

## Status da execução — 2026-10-16

- Catálogo do PDV diferencia carregamento, resposta vazia válida e erro sem cache utilizável; o usuário pode tentar novamente.
- Gráfico de receita diferencia carregamento, vazio e erro recuperável. O dashboard inicial e os indicadores de Delivery mostram skeletons dentro da área correspondente.
- `GET /api/dashboard/urgencias` já estava montada e protegida; o teste de regressão confirma resposta em array e negação para não administrador.
- A busca no código executado não encontrou indicador global fixo “Aguarde…” no rodapé; nenhum overlay global foi removido.
- Verificação: build de produção, lint dos arquivos alterados e os testes Cypress focados passaram. A suíte unitária geral ainda registra 3 falhas fora deste escopo: uma em `caixa.test.js` e duas em `layout.test.js`.
