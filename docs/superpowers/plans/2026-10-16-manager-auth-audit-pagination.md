# Manager Authorization, Audit UI, and Server Pagination Plan

> **For agentic workers:** execute tasks in order with tests and an independent review after each task. Preserve existing worktree changes.

**Goal:** Complete the DB-backed manager-authorization toggle, expose the audit and health endpoints/UI, and add backward-compatible server-side pagination to user-facing record lists.

**Architecture:** The backend remains authoritative for authorization enforcement: a shared settings reader defaults to `true`, caches for 30 seconds, and is invalidated after updates. The support override always wins. Audit functionality uses the existing paginated router as the canonical admin API while preserving the legacy auth audit response. List routes gain opt-in pagination metadata; legacy/full-data callers continue receiving complete arrays unless explicitly migrated.

**Tech Stack:** Express, MongoDB/Mongoose, React, Vite, Cypress, Jest, Node test runner.

**Sources:** User requirements received 2026-10-16; `back-end/routes/configuracoes.js`, `back-end/middleware/exigirAutorizacao.js`, `back-end/routes/auditoria.js`, `back-end/routes/products.js`, and existing frontend consumers.

## Global Constraints

- Manager authorization defaults to `true` for new installations and backend middleware is authoritative.
- When the setting is enabled, preserve existing per-action JWT verification; when disabled, middleware skips only that manager-token check.
- `FORCAR_AUTORIZACAO_GERENTE=true` forces the value to enabled and prevents changes; the support override takes precedence over the DB.
- Disabling requires an admin and a trimmed reason of at least 10 characters; enabling does not require a reason. Every successful change writes an audit record with actor, value, optional reason, timestamp, and IP.
- Cache setting reads for at most 30 seconds and invalidate the local cache on successful PATCH; on database failure, fail closed by requiring authorization.
- Frontend state/banner improves UX but never controls backend enforcement.
- The warning banner is visible across authenticated screens only when authorization is disabled and support override is absent.
- Preserve the legacy full-array API contract for callers that need full datasets; introduce explicit opt-in pagination envelopes and never page PDV sale catalog, active command workflows, calculations, or exports without an all-matching strategy.
- Pagination responses include stable ordering, `dados`, `total`, `pagina`, `limite`, and `totalPaginas`; validate/coerce page and cap page size at 100.

## Task 1: Secure Manager Authorization Toggle

**Files:** `back-end/utils/managerAuthorizationSettings.js` (new), `back-end/routes/configuracoes.js`, `back-end/middleware/exigirAutorizacao.js`, `back-end/tests/integration/managerAuthorizationSettings.test.js` (new), `front-end/src/App.jsx`, `front-end/src/pages/Configuracoes.jsx`, `front-end/src/components/Layout.jsx`, `front-end/src/context/ConfiguracoesContext.jsx`, focused Cypress tests.

- Add shared async settings read with 30-second in-process cache, fail-closed `true`, explicit invalidation, and support override precedence.
- GET returns the persisted boolean (or forced `true`) and lock flag; PATCH validates strict boolean and requires a 10-character trimmed reason only for `false`, persists and audits the authenticated admin, invalidates cache after persistence, and rejects changes during support override.
- Keep this settings mutation admin-only; do not require the very manager token it controls for the only admin-managed transition. This follows the UI requirement that enabling is a simple confirmation and prevents a policy deadlock.
- Skip manager approval in middleware only when the backend reader resolves `false`; preserve current token validation otherwise.
- Mount `ConfiguracoesProvider`, add its admin route/menu link, wire async toggle state, and render a global warning banner while disabled. Support lock UI states plainly.
- Tests must establish true default, persisted false, reason validation, forced override, cache lifetime/invalidation, no-token guarded action `403` when true / passes when false, and frontend route/banner/toggle transitions.

## Task 2: Health and Paginated Audit UI

**Files:** `back-end/server.js`, `front-end/src/App.jsx`, `front-end/src/components/Layout.jsx`, new `front-end/src/pages/Auditoria.jsx`, backend/frontend tests.

- Add explicit `GET /health` before SPA fallback, report service/database readiness without exposing secrets.
- Mount `routes/auditoria.js` at `/api/auditoria`; retain `/api/auth/auditoria` response shape for compatibility.
- Add admin-only route/menu entry for an audit table with filters, pagination metadata, and retryable loading/error/empty states; use server-side page and filters.
- Test health readiness, route mount/auth denial, audit filters/pagination, and screen loading/error/retry.

## Task 2a: Dashboard and Central do Dia Loading States

**Files:** `front-end/src/pages/Dashboard.jsx`, `front-end/src/components/dashboard/CentralDoDia.jsx`, `DeliveryAnalytics.jsx`, focused dashboard/Central do Dia E2E tests.

- Give summary cards, chart, urgency list, and the named dashboard async cards explicit loading states rather than flashing zeros or empty-data messaging before their requests settle.
- Distinguish successful zero/empty responses from request errors; provide local retry for the owning request without a document reload.
- Preserve date filters, existing totals, and bounded dashboard reports.
- Test delayed success, valid empty data, failed request/retry, and unchanged loaded values.

## Task 3: Product Catalog Pagination

**Files:** `back-end/routes/products.js`, existing `back-end/tests/integration/productsCompatibility.test.js`, `front-end/src/pages/Products.jsx`, related E2E tests.

- Preserve an unpaginated array by default. For explicit `pagina` or `limite`, apply bounded DB skip/limit after search/category/type filters and return the agreed metadata envelope.
- Accept the established search alias only if validated; reject structured query values and cap limits at 100.
- Migrate only the admin product listing to the opt-in paginated query; keep PDV and full-catalog consumers, exports, summaries, and side panels complete.
- Test legacy array compatibility, filtering before pagination, stable ordering, limits, totals, malformed input, and PDV catalog preservation.

## Task 4: Customers and Purchases Pagination

**Files:** `back-end/routes/customers.js`, `back-end/routes/purchases.js`, `front-end/src/pages/Customers.jsx`, `front-end/src/pages/Purchases.jsx`, backend/frontend tests.

- Add opt-in pagination envelopes while preserving default arrays.
- Migrate only list views; keep customer selectors and CSV/XML exports complete through their existing full-array requests or explicit export requests.
- Remove the purchases’ silent 200-record history ceiling only for the paginated contract; retain legacy array shape and explicit paging behavior for migrated view.
- Verify filtering, export coverage, and older purchase reachability.

## Task 5: Orders, Expenses, and Financial List Pagination

**Files:** `back-end/routes/orders.js`, `back-end/routes/despesas.js`, `front-end/src/pages/Orders.jsx`, `front-end/src/pages/Financeiro.jsx`, `front-end/src/pages/ContasReceber.jsx`, tests.

- Add opt-in paging only after status/date filters have been applied consistently in the DB query or a separately computed all-match result.
- Preserve totals, summaries, exports, and receivable calculations over the full filtered data, not the visible page.
- Keep default full-array contracts until each consumer explicitly opts in.
- Test query filtering, stable ordering, accurate metadata and aggregate/export invariance.

## Task 6: Pagination Coverage Audit and Final Verification

**Files:** remaining list endpoints and owners discovered by scoped inventory, corresponding tests.

- Inventory all remaining record-list views and classify each as paginated UI list, bounded summary, operational full-data list, or export/calculation source.
- Add opt-in server pagination only to eligible large record-list views; keep operational/full-data and bounded-summary behavior intact, documenting their classification in tests.
- Run backend unit/integration tests, frontend unit tests, relevant Cypress specs, lint, production build, and `git diff --check`.

## Sequencing and review

Tasks 1–2 are separate admin/backend subsystems; Tasks 3–6 are dependent list migrations. Implement serially in this worktree to avoid conflicting edits; each task has a focused implementation and independent review before the next begins. Do not deploy, push, merge, or commit secrets.
