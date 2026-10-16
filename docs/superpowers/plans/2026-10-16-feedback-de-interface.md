# Consistent Interface Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize accessible feedback, destructive confirmations, and loading/error/empty states across the existing PDV, management, and Delivery screens.

**Architecture:** Build on the existing `ToastProvider`, `ConfirmarAcao`, and skeleton patterns; add one shared list-state component and migrate existing screens in functional groups. Keep each screen's data fetching, filters, pagination, API contract, and business rules in place.

**Tech Stack:** React 19, JavaScript, Vite 8, Cypress, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-16-feedback-e-changelog-design.md` (section 1)

## Global Constraints

- Preserve existing APIs, authentication/authorization, sales, payment, inventory, delivery, and cash semantics.
- Destructive confirmations use an accessible custom modal; do not use `window.confirm()` for destructive actions.
- Non-destructive attendance-transition prompts remain unchanged unless separately validated.
- Loading, error, empty, and populated results are distinct states; never present a failed request as an empty list.
- Retry only the owning request; do not reload the document or silently clear current filters.
- Preserve pagination and do not paginate server-paginated results a second time.
- Keep loading indicators local and preserve the existing cream/brown visual tokens.

## Review Focus

- A list request fails after a previous successful load: show an explicit error and retry, not stale “empty” content.
- Retry occurs while a filter/page is active: preserve the filter and request the same view.
- User cancels a destructive-action dialog: no mutation request is sent.
- Mutation fails after confirmation: show an error toast and retain recoverable screen state.
- A list has no records for the current filter but records exist overall: show a contextual empty state without discarding the active filter.

---

### Task 1: Shared Toast, Confirmation, and List-State Components

**Files:**
- Modify: `front-end/src/components/Toast.jsx`
- Modify: `front-end/src/components/ConfirmarAcao.jsx`
- Modify: `front-end/src/components/SkeletonLista.jsx`
- Create: `front-end/src/components/EstadoLista.jsx`
- Test: `front-end/tests/e2e/feedback_ui.cy.js`

**Interfaces:**
- Consumes: existing `ToastContext` and theme tokens.
- Produces: accessible toast semantics; an accessible modal confirmation; `EstadoLista({ carregando, erro, vazio, onRetry, iconeVazio, tituloVazio, mensagemVazia, acaoVaziaTexto, onAcaoVazia, children })`, rendering skeleton, error/retry, empty/action, or children in that precedence.

- [ ] **Step 1: Add failing E2E coverage** for toast roles, destructive-dialog labels/cancel behavior, skeleton state, empty-state action, and retry action.
- [ ] **Step 2: Run `npm run test:frontend -- --spec "tests/e2e/feedback_ui.cy.js"`** and verify the new cases fail against the current inconsistent or inaccessible states.
- [ ] **Step 3: Implement accessible toast output** in `Toast.jsx` with `role="status"` for non-errors and `role="alert"` for errors; ensure timers do not leave stale messages or update unmounted providers.
- [ ] **Step 4: Make `ConfirmarAcao.jsx` a labelled `role="dialog"`/`aria-modal="true"` dialog with keyboard dismissal and focus handling; do not invoke `onConfirmar` on cancel. Preserve its existing children callback API.**
- [ ] **Step 5: Repair `SkeletonLista.jsx` markup/styles and implement `EstadoLista.jsx` with the exact props above, theme tokens, labelled loading feedback, and conditional retry/action buttons.**
- [ ] **Step 6: Rerun the focused E2E spec and lint the four shared component files.**
- [ ] **Step 7: Commit** the shared feedback primitives and tests.

### Task 2: Destructive Actions and Mutation Toasts

**Files:**
- Modify as applicable: `front-end/src/pages/Customers.jsx`, `Products.jsx`, `Users.jsx`, `Orders.jsx`, `Comandas.jsx`
- Modify as applicable: `front-end/src/pages/Financeiro.jsx`, `PaymentSettings.jsx`, `FichasTecnicas.jsx`, `Production.jsx`, `Caixa.jsx`
- Modify as applicable: `front-end/src/pages/MesasCadastro.jsx`, `Purchases.jsx`, `Entregas.jsx`, `DeliveryAdmin.jsx`, `DeliveryEntregador.jsx`, `DeliveryPlataforma.jsx`
- Modify as applicable: other action owners found by the initial `window.alert()`/`window.confirm()` inventory in `front-end/src/pages/` and `front-end/src/components/`
- Modify: `front-end/src/components/StatusConexao.jsx`
- Test: the corresponding existing Cypress specs and `front-end/tests/e2e/feedback_ui.cy.js`

**Interfaces:**
- Consumes: accessible `ConfirmarAcao` and `useToast()` from Task 1.
- Produces: every destructive delete/cancel action found in the frontend inventory uses the custom modal; successful and failed mutations provide actionable toast feedback. No interface calls `window.alert()`.

- [ ] **Step 1: Add regression assertions** that cancel/delete buttons open the custom dialog, cancelling sends no DELETE/cancel request, and a confirmed action sends exactly one request.
- [ ] **Step 2: Run the focused page specs** and confirm the new assertions expose native confirmation or missing feedback.
- [ ] **Step 3: Replace destructive `window.confirm()` calls only** in all inventoried owners with `ConfirmarAcao`, including record deletion and order/comanda cancellation. Preserve warning copy, manager-authorization flow, and request payloads.
- [ ] **Step 4: Add success/error toasts at mutation boundaries** in the listed pages, preserving inline errors where they must remain visible and leaving non-destructive PDV/channel/dispatch/closure prompts unchanged.
- [ ] **Step 5: Replace `window.alert()` in `StatusConexao.jsx`** with `useToast()` error feedback; retain its non-destructive source-confirmation behavior.
- [ ] **Step 6: Run relevant page specs, focused lint, and a source search proving no `window.alert()` remains and each remaining `window.confirm()` is a documented non-destructive transition.**
- [ ] **Step 7: Commit** the destructive-action and mutation-feedback migration.

### Task 3: Catalog, Customer, User, Sales, and Command Lists

**Files:**
- Modify: `front-end/src/pages/PDV.jsx`, `Products.jsx`, `Customers.jsx`, `Users.jsx`, `Orders.jsx`, `Comandas.jsx`, `Mesas.jsx`, `MesasCadastro.jsx`
- Test: existing `front-end/tests/e2e/pdv_mobile.cy.js`, `clientes.cy.js`, `comanda_unificada.cy.js`, `comanda_pagamento_separado.cy.js`, `fluxo_principal.cy.js`; add catalog/user cases to `feedback_ui.cy.js` or the closest existing spec.

**Interfaces:**
- Consumes: `EstadoLista` from Task 1 and existing page-owned loading/error/retry state.
- Produces: these persistent record lists render a local skeleton while initially loading, an accessible empty state with a contextual permitted action, and a retryable API/network error. Existing list filters and pagination remain intact.

- [ ] **Step 1: Add failing tests** for initial skeleton, valid empty response with contextual action, and failed request with a visible retry button on the PDV catalog and representative customer/user/order lists.
- [ ] **Step 2: Run the targeted Cypress specs** and confirm that empty, loading, and error states are distinguishable.
- [ ] **Step 3: Integrate `EstadoLista`** into the listed list owners using their current data and retry handlers; keep PDV offline-cache behavior and only show its empty state after a valid empty response.
- [ ] **Step 4: Add contextual actions** (create/add, clear filter, or permitted navigation) without weakening role checks or changing current filter/pagination state.
- [ ] **Step 5: Run all touched Cypress specs, lint the listed pages, and verify existing record actions still work on later pages.**
- [ ] **Step 6: Commit** the catalog and attendance-list states.

### Task 4: Finance, Production, Kitchen, and Dashboard Lists

**Files:**
- Modify as applicable: `front-end/src/pages/Caixa.jsx`, `ContasReceber.jsx`, `Financeiro.jsx`, `Purchases.jsx`, `FichasTecnicas.jsx`, `Production.jsx`, `Kitchen.jsx`, `Dashboard.jsx`, `PaymentSettings.jsx`
- Modify as applicable: `front-end/src/components/dashboard/CentralDoDia.jsx`, `DeliveryAnalytics.jsx`
- Test: existing `front-end/tests/e2e/dashboard_pwa.cy.js`, `formas_pagamento.cy.js`, `regressao_segura.cy.js`; add focused finance/production cases in `feedback_ui.cy.js` where no screen-specific spec exists.

**Interfaces:**
- Consumes: `EstadoLista` and mutation toast behavior from Tasks 1–2.
- Produces: owned lists distinguish initial loading, empty results, request errors, and populated results; retry preserves filters and date ranges. Dashboard summary cards and intentionally bounded lists retain their existing semantics.

- [ ] **Step 1: Add failing tests** for skeleton/empty/error/retry on representative finance and production list views, including an empty filtered result.
- [ ] **Step 2: Run the relevant E2E specs** and record which screen-specific fetch handler drives the retry.
- [ ] **Step 3: Integrate `EstadoLista`** into all listed persistent record lists; keep summaries, static choices, and deliberately capped top-five reports as bounded content.
- [ ] **Step 4: Ensure retry reuses the active date/status filters and does not use `window.location.reload()`.**
- [ ] **Step 5: Run touched E2E specs and focused lint; verify exports, totals, pagination, and batch actions still use their preexisting full datasets.**
- [ ] **Step 6: Commit** the finance and production list states.

### Task 5: Delivery Lists and Status Feedback

**Files:**
- Modify: `front-end/src/pages/Entregas.jsx`, `DeliveryAdmin.jsx`, `DeliveryEntregador.jsx`, `DeliveryPlataforma.jsx`, `RastreioEntrega.jsx`
- Modify as applicable: `front-end/src/components/DeliveryPortal.jsx`
- Test: existing `front-end/tests/e2e/deliverylink.cy.js`, `fluxo_principal.cy.js`, `regressao_segura.cy.js`, `cancelar_comanda.cy.js`; add coverage to `feedback_ui.cy.js` for Delivery owners without a screen-specific spec.

**Interfaces:**
- Consumes: `EstadoLista`, `ConfirmarAcao`, and `useToast()` from earlier tasks.
- Produces: local loading/error/empty/retry states and toast feedback for Delivery mutations, without client-side re-pagination of server-paginated order history.

- [ ] **Step 1: Add failing cases to the existing Delivery specs listed above** for pending load, empty/error/retry, destructive confirmation, and mutation success/failure feedback.
- [ ] **Step 2: Run those focused specs** and confirm that retries and confirmations exercise the current Delivery API routes.
- [ ] **Step 3: Integrate shared list states** into orders, tenants, couriers, and tracking views; preserve server page/filter/status query parameters and periodic refresh behavior.
- [ ] **Step 4: Replace destructive Delivery confirmations** and emit toasts for completed/failed mutations while retaining persistent inline operational status where needed.
- [ ] **Step 5: Run touched Delivery specs and lint; assert server-page navigation remains a single pagination layer.**
- [ ] **Step 6: Commit** the Delivery feedback migration.

### Task 6: Application-Wide Regression Audit

**Files:**
- Inspect: `front-end/src/pages/` and `front-end/src/components/`
- Modify only: relevant list/action owners found by the audit
- Test: affected Cypress specs and `front-end/tests/e2e/feedback_ui.cy.js`

**Interfaces:**
- Consumes: the shared UI primitives and screen integrations from Tasks 1–5.
- Produces: a code-level audit confirming all persistent list owners and destructive actions satisfy the spec; no unrelated business-flow changes.

- [ ] **Step 1: Search for `window.alert`, destructive `window.confirm`, unconditional empty messages, and list loading branches** across the frontend; classify remaining native confirms as non-destructive transitions only.
- [ ] **Step 2: Add targeted regression coverage** for any in-scope owner not covered by Tasks 2–5 and make only the missing integration changes.
- [ ] **Step 3: Run `npm run test:frontend -- --spec "<all touched specs>"`, `npm run lint`, and `npm run build`.**
- [ ] **Step 4: Run `npm run test:frontend:unit` and record any existing failures separately from this change.**
- [ ] **Step 5: Run `git diff --check` and review the final diff for unchanged API contracts, filters, pagination, roles, and operational flows.**
- [ ] **Step 6: Commit** the final regression coverage.
