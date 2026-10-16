# Paginação das Listas de Registros Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide consistent pagination for user-facing record lists throughout the application without changing existing API response contracts.

**Architecture:** Use the shared `Paginacao.jsx` control and URL-backed page/limit state. Large historical lists request server-side pages through the common API envelope; small lists may paginate already-fetched records. Filters run before pagination, and exports and bulk operations retain their full-dataset semantics.

**Tech Stack:** React 19, Vite 8, JavaScript, Cypress, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-16-estabilidade-paginacao-design.md`

## Global Constraints

- Preserve the existing creme/marrom visual identity and tokens.
- Keep React + Vite in JavaScript; do not start the TypeScript migration.
- New server-side pagination is opt-in, validated, capped at 100, and preserves legacy responses when pagination parameters are omitted.
- Loading is not an empty result; errors are not empty results.
- Static options and deliberately short operational summaries do not need pagination.
- Exports and bulk actions continue to use the full filtered dataset, not only visible rows.

## Review Focus

- A filter or search change resets the visible list to page one.
- Deleting the last row on a page does not leave an invalid empty page.
- Sorting and filtering apply to the full result before slicing the visible page or are applied by the server before returning a page.
- Selected record details remain valid if the selected row is not on the current page.
- Existing delivery API pagination is not paginated a second time on the client.

---

### Task 1: Shared Client Pagination Hook

**Files:**
- Create: `front-end/src/hooks/usePagination.js`
- Test: `front-end/tests/pagination.test.js`
- Inspect/reuse: `front-end/src/components/Paginacao.jsx`

**Interfaces:**
- Produces: `usePagination(items, initialLimit = 25)` returning `{ itensPagina, paginaAtual, limiteAtual, total, alterarPagina, alterarLimite, reiniciar }`.
- `alterarPagina(page)` and `alterarLimite(limit)` update local pagination state; changing limit resets to page one.
- If the item count shrinks below the current page, clamp to the last valid page.

- [ ] **Step 1: Write failing node tests** for slicing, empty arrays, page bounds, page-size changes, and clamping after item count shrinks.
- [ ] **Step 2: Run `node --test tests/pagination.test.js`** and confirm failures reflect the missing hook behavior.
- [ ] **Step 3: Implement the pure pagination state/slicing logic** in `usePagination.js` without mutating `items`.
- [ ] **Step 4: Run the focused tests** and verify all cases pass.
- [ ] **Step 5: Commit** the hook and tests.

### Task 2: Sales, Customer, Product, and User Lists

**Files:**
- Modify: `front-end/src/pages/Orders.jsx`
- Modify: `front-end/src/pages/Customers.jsx`
- Modify: `front-end/src/pages/Products.jsx`
- Modify: `front-end/src/pages/Users.jsx`
- Test: `front-end/tests/e2e/fluxo_principal.cy.js`
- Test: Add focused cases to existing Cypress specs for customer, product, and user lists.

**Interfaces:**
- Consumes: `usePagination` and `Paginacao` from Task 1.
- Produces: Paged record views; all current filters/sorts run against the complete loaded array before rendering a page.

- [ ] **Step 1: Add failing Cypress cases** showing navigation to another page, filter reset, and preservation of existing actions.
- [ ] **Step 2: Run the focused specs** and verify the records are currently unpaged (or the `Orders.jsx` 100-row cap hides later records).
- [ ] **Step 3: Apply shared client pagination** to record lists and render `Paginacao` adjacent to each list.
- [ ] **Step 4: Remove the arbitrary `pedidos.slice(0, 100)` display cap** while preserving full-array filters, exports, and detail actions.
- [ ] **Step 5: Run all touched Cypress specs and lint the four touched pages.**
- [ ] **Step 6: Commit** this group.

### Task 3: Finance, Cash, Stock, Production, and Purchasing Lists

**Files:**
- Modify as applicable: `front-end/src/pages/Financeiro.jsx`
- Modify as applicable: `front-end/src/pages/Caixa.jsx`
- Modify as applicable: `front-end/src/pages/ContasReceber.jsx`
- Modify as applicable: `front-end/src/pages/Purchases.jsx`
- Modify as applicable: `front-end/src/pages/Production.jsx`
- Modify as applicable: `front-end/src/pages/FichasTecnicas.jsx`
- Test: Add or extend the corresponding existing Cypress specs under `front-end/tests/e2e/`.

**Interfaces:**
- Consumes: `usePagination` and `Paginacao` from Task 1.
- Produces: Paginated persistent record lists while preserving date/status filters and record-level actions.

- [ ] **Step 1: Identify each unbounded record list and its current filter/sort/export behavior** in the named pages; exclude summaries and fixed option lists.
- [ ] **Step 2: Add one failing Cypress pagination case per migrated list** plus filter-reset coverage for filtered lists.
- [ ] **Step 3: Apply shared client pagination after each list's existing filtering and sorting.**
- [ ] **Step 4: Verify exports, totals, and bulk actions still use the full filtered collection.**
- [ ] **Step 5: Run touched Cypress specs and lint the changed pages.**
- [ ] **Step 6: Commit** this group.

### Task 4: Command and Delivery Lists

**Files:**
- Modify as applicable: `front-end/src/pages/Comandas.jsx`
- Modify as applicable: `front-end/src/pages/Entregas.jsx`
- Modify as applicable: `front-end/src/pages/DeliveryAdmin.jsx`
- Modify as applicable: `front-end/src/pages/DeliveryPlataforma.jsx`
- Modify as applicable: `front-end/src/pages/DeliveryEntregador.jsx`
- Test: Existing command and delivery Cypress specs under `front-end/tests/e2e/`.

**Interfaces:**
- Consumes: Existing delivery API pagination for `Entregas.jsx` and `DeliveryAdmin.jsx`; shared client pagination from Task 1 only for unpaged lists.
- Produces: One pagination layer per list, preserving status/date filters and delivery refresh behavior.

- [ ] **Step 1: Write failing Cypress coverage** for page navigation and filter reset on each unpaged record list.
- [ ] **Step 2: Confirm the existing server-paginated delivery lists are not client-paginated again.**
- [ ] **Step 3: Apply shared pagination only to the unpaged command/platform/courier record lists.**
- [ ] **Step 4: Verify refresh, status updates, selected command, and delivery actions against records on later pages.**
- [ ] **Step 5: Run the affected Cypress specs and lint changed pages.**
- [ ] **Step 6: Commit** this group.

### Task 5: Application-Wide List Coverage

**Files:**
- Inspect: Remaining route pages in `front-end/src/pages/`
- Modify: Only additional persistent-record list owners discovered during inventory.
- Test: Corresponding Cypress specs for any additional list owner.

**Interfaces:**
- Consumes: Shared pagination hook and component from Task 1.
- Produces: An explicit inventory proving each user-facing persistent record list is paginated or deliberately excluded as a bounded summary/static option.

- [ ] **Step 1: Search all remaining page components for unbounded `.map()` record lists and add each owner to a test checklist.**
- [ ] **Step 2: For each additional record list, add a failing test for page navigation and apply the shared pagination control.**
- [ ] **Step 3: Verify that no list is double-paginated or silently truncated.**
- [ ] **Step 4: Run the full frontend unit suite, relevant Cypress coverage, build, and `git diff --check`.**
- [ ] **Step 5: Commit** the coverage-complete migration.

## Status da execução — 2026-10-16

- Paginação server-side opt-in nas listas grandes: Produtos, Clientes, Vendas, Usuários, Compras, Estoque/Movimentos, Entregas, Contas a Pagar, Contas a Receber e Auditoria.
- `Contas a Receber` usa páginas independentes por aba, filtros sincronizados na URL, totais globais calculados no servidor, seleção preservada entre páginas e operações em lote; exportação CSV e relatório do cliente consultam o conjunto filtrado completo.
- Histórico de Vendas e Auditoria estão disponíveis no menu administrativo; listas pequenas fixas (mesas, categorias e entregadores) continuam sem paginação.
- As APIs mantêm compatibilidade com respostas legadas quando os parâmetros de paginação não são enviados; filtros são aplicados antes do corte da página.
- Verificação final: backend 31 suítes/334 testes aprovados; cobertura backend executada (69,12% statements, 53,76% branches, 73,14% functions, 73,04% lines); frontend 104 testes unitários aprovados; lint, build e `git diff --check` aprovados. Integrações de clientes/pedidos e agregados financeiros também passaram.
- Nenhuma alteração foi commitada.
