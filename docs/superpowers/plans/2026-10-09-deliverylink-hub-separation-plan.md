# DeliveryLinkHub separation and PDV delivery configuration plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Sabor de Abraço delivery operations inside the PDV while preparing a separate DeliveryLinkHub project that is fully independent from the current store backend.

**Architecture:** The existing PDV keeps operational delivery data, configuration, courier access and public tracking locally. The Hub generation task creates a separate Express + React + MongoDB product with its own tenant, admin, and delivery flows, but the current Sabor installation never calls it or shares sessions, credentials, or data. The plan preserves the present operational flow by redirecting legacy admin routes to the local Entregas experience without breaking the current structure.

**Tech Stack:** React/React Router, Express.js, MongoDB/Mongoose, Node.js, Jest/Vitest-style frontend backend tests, and a standalone Node generator script plus a template directory.

**Spec:** `docs/superpowers/specs/2026-10-09-deliverylink-hub-separation-design.md`

## Global Constraints

- The Sabor continues being the source of truth of its orders, history, couriers and delivery settings in the current backend and database.
- The Sabor operation cannot call, authenticate or depend on the availability of the DeliveryLinkHub.
- The settings that belong to the operation of the Sabor stay in the Entregas tab, using the current PDV session and tenant link.
- The default fee is an initial value for manual orders and can be adjusted per order. Orders received from PDV commands keep the fee informed in the command without silent replacement.
- The courier screen and public tracking remain in the Sabor app and use the local backend. `/pedido/:token` continues public and consults only local tracking data.
- `/admin`, `/DeliveryAdmin` and `/plataforma` redirect to `/entregas`; the management access remains limited by local PDV permissions.
- The Hub is another application and database, without import or synchronization of Sabor data.
- The script must generate the project only when the operator chooses a local destination; it must not install dependencies, create secrets, commit, push, or deploy.

## Review Focus

- Redirect guard: a user hitting `/admin`, `/DeliveryAdmin`, or `/plataforma` should be redirected to `/entregas` without losing local permissions checks.
- Local configuration: only operational delivery fields from the tenant are saved, without deleting unrelated tenant fields.
- Default fee behavior: manual orders inherit the current default fee but a new order can override it; PDV command orders preserve their own fee.
- External project generation: the script must validate destination safety and fail explicitly on invalid paths or Git errors.
- No cross-product coupling: the generated Hub template must not contain Sabor-specific endpoints, connection strings, or credentials.

---

### Task 1: Make delivery settings editable inside the PDV Entregas module

**Files:**
- Modify: `front-end/src/pages/Entregas.jsx`
- Modify: `front-end/src/pages/DeliveryEntry.jsx`
- Modify: `back-end/routes/delivery.js`
- Modify: `back-end/models/Tenant.js`
- Test: `back-end/tests/integration/deliveryRoutes.test.js`
- Test: `front-end/tests/e2e/deliverylink.cy.js`

**Interfaces:**
- Consumes: the existing `GET /entregas/configuracao` and `PUT /entregas/configuracao` endpoints, plus the tenant payload already returned by the PDV.
- Produces: a local tenant configuration form that stores only `nome`, `telefone`, `endereco`, `taxaEntregaPadrao`, `tempoEstimadoPadraoMin`, and `mensagemWhatsApp` in the current tenant record, while preserving unrelated fields.

- [ ] **Step 1: Write the failing test for the tenant configuration contract**

```js
it('updates only the delivery-operational tenant fields and preserves unrelated settings', async () => {
  const response = await request(app)
    .put('/entregas/configuracao')
    .set('Cookie', tenantCookie)
    .send({
      nome: 'Sabor de Abraço',
      telefone: '(11) 99999-0000',
      endereco: 'Rua das Flores, 111',
      taxaEntregaPadrao: 6.5,
      tempoEstimadoPadraoMin: 25,
      mensagemWhatsApp: 'Olá! Acompanhe sua entrega: {link}'
    });

  expect(response.status).toBe(200);
  expect(response.body.nome).toBe('Sabor de Abraço');
  expect(response.body.telefone).toBe('(11) 99999-0000');
  expect(response.body.endereco).toBe('Rua das Flores, 111');
  expect(response.body.configuracao.tempoEstimadoPadraoMin).toBe(25);
  expect(response.body.configuracao.mensagemWhatsApp).toContain('{link}');
  expect(response.body.slug).toBeDefined();
});
```

- [ ] **Step 2: Run the focused test to confirm it fails before implementation**

Run: `npm test -- --runInBand back-end/tests/integration/deliveryRoutes.test.js`
Expected: FAIL because the route still writes only the legacy `configuracao` subdocument and the Entregas form does not submit the allowed fields.

- [ ] **Step 3: Implement the local configuration contract in `back-end/routes/delivery.js` and `back-end/models/Tenant.js`**

Update the tenant update route to accept an explicit allowlist of operational fields and ignore any non-supported keys; keep the `configuracao` subdocument in place while serializing `nome`, `telefone`, `endereco`, and `taxaEntregaPadrao` into the tenant root when required by the current contract. Preserve unrelated fields and validate the values with the same existing pattern used by the delivery routes.

- [ ] **Step 4: Run the targeted backend tests to verify the contract passes**

Run: `npm test -- --runInBand back-end/tests/integration/deliveryRoutes.test.js`
Expected: PASS and no regression in tenant creation or existing delivery routes.

- [ ] **Step 5: Implement the Entregas interface form and default-fee behavior in `front-end/src/pages/Entregas.jsx`**

Add the commerce-detail form directly to the Entregas screen, prefill it from `comercio` and save only the approved keys. Keep `taxaEntrega` in manual order creation as the default value prefilled in the form, but do not overwrite the fee already encoded in PDV command orders.

- [ ] **Step 6: Run the focused frontend validation for the delivery form**

Run: `npm test -- --runInBand front-end/tests/e2e/deliverylink.cy.js`
Expected: PASS or, if the project still requires the existing browser suite, a targeted subset covering the delivery configuration flow must pass.

- [ ] **Step 7: Commit**

```bash
git add front-end/src/pages/Entregas.jsx front-end/src/pages/DeliveryEntry.jsx back-end/routes/delivery.js back-end/models/Tenant.js back-end/tests/integration/deliveryRoutes.test.js front-end/tests/e2e/deliverylink.cy.js
git commit -m "feat: localize delivery config in Entregas"
```

### Task 2: Redirect legacy Delivery admin routes and preserve the local permission model

**Files:**
- Modify: `front-end/src/App.jsx`
- Modify: `front-end/src/pages/DeliveryAdmin.jsx`
- Modify: `front-end/src/pages/DeliveryPlataforma.jsx`
- Modify: `back-end/routes/delivery.js`
- Test: `front-end/tests/e2e/deliverylink.cy.js`

**Interfaces:**
- Consumes: the current `PrivateRoute`, `RoleRoute`, and `DeliveryEntry` routing model.
- Produces: a route map where `/admin`, `/DeliveryAdmin`, and `/plataforma` always redirect to `/entregas` without leaving the local PDV access control.

- [ ] **Step 1: Write the failing route regression test**

```js
it('redirects legacy delivery management routes to /entregas under the local PDV auth model', async () => {
  await renderWithRouter('/admin');
  expect(window.location.pathname).toBe('/entregas');

  await renderWithRouter('/plataforma');
  expect(window.location.pathname).toBe('/entregas');
});
```

- [ ] **Step 2: Run the route test to confirm it fails before implementation**

Run: `npm test -- --runInBand front-end/tests/e2e/deliverylink.cy.js`
Expected: FAIL because the routes still render the standalone admin pages instead of redirecting.

- [ ] **Step 3: Implement the redirect behavior in `front-end/src/App.jsx`**

Replace the legacy standalone route rendering with explicit redirects to `/entregas` and keep all permission checks inside the local PDV flow. The public tracking route `/pedido/:token` remains active and independent from the admin path.

- [ ] **Step 4: Run the targeted frontend route tests**

Run: `npm test -- --runInBand front-end/tests/e2e/deliverylink.cy.js`
Expected: PASS with both legacy routes redirecting to `/entregas` and the local login flow still preserved.

- [ ] **Step 5: Commit**

```bash
git add front-end/src/App.jsx front-end/src/pages/DeliveryAdmin.jsx front-end/src/pages/DeliveryPlataforma.jsx front-end/tests/e2e/deliverylink.cy.js
git commit -m "feat: redirect legacy delivery admin routes to Entregas"
```

### Task 3: Add the DeliveryLinkHub generator template and validation script

**Files:**
- Create: `scripts/create-deliverylink-hub.js`
- Create: `scripts/deliverylink-hub-template/**`
- Create: `scripts/tests/create-deliverylink-hub.test.js`

**Interfaces:**
- Consumes: a chosen local destination path, a target repo folder, and Git availability on the machine.
- Produces: a complete Hub project directory with `.env.example`, installation instructions, a template app skeleton, and no production credentials or data copied from the Sabor codebase.

- [ ] **Step 1: Write the failing generator test**

```js
it('rejects an invalid destination and reports the error without creating partial files', async () => {
  const destination = path.join(tmpDir, 'not-empty');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'tmp.txt'), 'x');

  await expect(createDeliveryHub({ destination })).rejects.toThrow(/destination/i);
  expect(fs.existsSync(path.join(destination, 'package.json'))).toBe(false);
});
```

- [ ] **Step 2: Run the generator test to confirm it fails before implementation**

Run: `npm test -- --runInBand scripts/tests/create-deliverylink-hub.test.js`
Expected: FAIL because the generator and template do not exist yet.

- [ ] **Step 3: Implement the generator skeleton in `scripts/create-deliverylink-hub.js`**

Build the Node-based script to validate the destination, guard against partial writes, copy the template successfully, configure Git remote `origin` to `willplacetech/DeliveryLinkHub`, and fail explicitly if any step does not complete. Do not create `.env`, do not install dependencies, and do not commit or push.

- [ ] **Step 4: Create the standalone template in `scripts/deliverylink-hub-template/`**

This template must include a Vite frontend, Express API, MongoDB config placeholders, example environment file, a first-admin bootstrap flow, and README instructions. It should have no references to the Sabor app, its sessions, or the current DB configuration.

- [ ] **Step 5: Run the generator test to verify the script passes**

Run: `npm test -- --runInBand scripts/tests/create-deliverylink-hub.test.js`
Expected: PASS, with invalid destination cases rejected and valid copies created only after successful validation.

- [ ] **Step 6: Commit**

```bash
git add scripts/create-deliverylink-hub.js scripts/deliverylink-hub-template scripts/tests/create-deliverylink-hub.test.js
git commit -m "feat: add DeliveryLinkHub generator template"
```

### Task 4: Regression validation for the preserved PDV workflow

**Files:**
- Modify: `back-end/tests/integration/deliveryRoutes.test.js`
- Modify: `front-end/tests/e2e/deliverylink.cy.js`
- Modify: `docs/deliverylink.md` and/or `README.md`

**Interfaces:**
- Consumes: the API contract and route behavior established in Tasks 1-3.
- Produces: end-to-end proof that the local PDV flow remains intact while standalone admin redirects and the external template generation behave correctly.

- [ ] **Step 1: Write the final regression test covering the preserved delivery workflow**

```js
it('keeps the PDV delivery workflow functional while the legacy admin routes redirect away', async () => {
  const pedido = await createManualDeliveryOrder({ taxaEntrega: 6.5 });
  expect(pedido.status).toBe('pronto');
  expect(pedido.taxaEntrega).toBe(6.5);

  await navigate('/admin');
  expect(currentPath()).toBe('/entregas');
});
```

- [ ] **Step 2: Run the consolidated regression suite**

Run: `npm test -- --runInBand back-end/tests/integration/deliveryRoutes.test.js front-end/tests/e2e/deliverylink.cy.js`
Expected: PASS, proving the PDV path is intact and the standalone route redirection does not break the login/session flow.

- [ ] **Step 3: Update the project reference documentation**

Document the new architecture boundary: PDV local delivery settings and tracking stay in the current app; the Hub is generated separately, and no runtime calls are made between the two products.

- [ ] **Step 4: Commit**

```bash
git add back-end/tests/integration/deliveryRoutes.test.js front-end/tests/e2e/deliverylink.cy.js docs/deliverylink.md README.md
git commit -m "docs: document delivery separation and local validation"
```

---

## Self-review summary

This plan covers the exact separation requested by the spec and keeps the changes bounded to the existing delivery flow: the PDV retains all operational delivery behavior, the Hub is generated as a separate product, and the legacy admin entry points are redirected without breaking the existing local auth model. The plan intentionally avoids a direct runtime dependency between the two systems and keeps all changes reversible within the current codebase.
