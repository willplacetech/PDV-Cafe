# Alinhamento de Acessos por Perfil — Plano de Implementação

> **Para agentes de implementação:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa por tarefa. As etapas usam caixas de seleção.

**Objetivo:** Alinhar menus, rotas e ações por perfil, corrigir o carregamento de Comandas e conceder somente as permissões adicionais aprovadas para Cozinha e Garçom.

**Arquitetura:** Uma matriz frontend será compartilhada entre menu e guardas de rota. A API continuará sendo a autoridade: cozinha recebe apenas listagem de comandas abertas e edição de itens, com payloads operacionais allowlisted; Garçom recebe apenas o fechamento de comanda como nova permissão. Comandas fará chamadas condicionais para catálogo e mesas, evitando endpoints negados aos perfis.

**Stack:** React 19, React Router 7, Vite, Cypress, Express, Mongoose e Jest.

**Especificação:** `docs/superpowers/specs/2026-11-11-alinhamento-acessos-roles-design.md`

## Restrições Globais

- Não remover nem relaxar aprovações de gerente ou validações existentes.
- Cozinha só lê comandas com status `aberta` e só pode adicionar, alterar quantidade e remover itens; redução e remoção mantêm a aprovação existente.
- Cozinha não pode criar, alterar detalhes, mover, cancelar, receber, fechar ou reabrir comandas.
- Respostas de comandas e catálogo para Cozinha incluem somente os campos operacionais allowlisted na especificação; não incluem preços, custos, valores, pagamentos, telefone ou endereço.
- As consultas usadas pela Cozinha nas fichas técnicas (`GET /products` e `GET /production/recipes`) também retornam somente dados operacionais sem custos; as demais rotas de produção e a listagem de estoque administrativo não são autorizadas para esse perfil.
- O KDS existente mantém apenas os campos operacionais usados pela tela; Cozinha não pode alterar preço manual nem com autorização de gerente.
- Garçom ganha somente acesso a `POST /comandas/:id/fechar`; suas permissões existentes de recebimento parcial e cancelamento com aprovação permanecem, e a reabertura continua negada.
- Não alterar papéis cadastráveis, sessões, modelos persistidos, dados de negócio ou dependências; não há migração.
- Não ampliar `GET /mesas` para Gerente; o frontend não fará essa chamada quando o perfil não precisar criar ou editar mesas.
- Caixa mantém a aprovação global existente para reabertura; não substituir o interceptor global por lógica duplicada na página.
- Publicar o backend compatível antes do frontend e manter ambos os artefatos anteriores para rollback.

## Foco de Revisão

- **A carga de Comandas depende de três endpoints:** operador/garçom recebem 403 em `/products`, gerente em `/mesas` e cozinha em `/comandas`; testar as chamadas corretas por perfil e a renderização resultante na tarefa 3.
- **Acesso direto pode divergir do menu:** testar as mesmas permissões na navegação e nas rotas diretas na tarefa 1.
- **Cozinha pode tentar alterar status ou IDs fora da tela:** testar status `aberta`, `rascunho` e fechada e rotas fora do escopo na tarefa 2.
- **Dados financeiros não podem vazar nos payloads da cozinha:** verificar campos da listagem, catálogo e respostas de escrita na tarefa 2.
- **Fechamento do Garçom não deve alterar outras operações financeiras:** testar fechamento novo, recebimento parcial e cancelamento existentes e reabertura negada na tarefa 2.

---

### Tarefa 1: Unificar acesso de menus e rotas

**Arquivos:**
- Criar: `front-end/src/permissions/roleAccess.js`
- Modificar: `front-end/src/App.jsx`
- Modificar: `front-end/src/components/Layout.jsx`
- Testar: `front-end/tests/roleAccess.test.js`
- Modificar: `front-end/tests/layout.test.js`

**Interfaces:**
- `roleAccess` exporta arrays `products`, `customers`, `productionStock`, `cash`, `kitchen`, `recipeSheets`, `tableSettings` e `comandas`.
- `App.jsx` usa as arrays em `RoleRoute`; `Layout.jsx` usa as mesmas arrays nos links correspondentes.

- [x] **Passo 1: Adicionar testes da matriz e da navegação**

Em `roleAccess.test.js`, conferir as listas exatas:
- `products`, `customers`, `productionStock`, `cash`: `admin`, `gerente`.
- `kitchen`: `admin`, `operador`, `cozinha`.
- `recipeSheets`: `admin`, `cozinha`.
- `tableSettings`: `admin`.
- `comandas`: `admin`, `gerente`, `operador`, `garcom`, `cozinha`.

Em `layout.test.js`, renderizar o layout com o contexto de cada perfil e verificar que os links obedecem às mesmas permissões.

- [x] **Passo 2: Executar os testes direcionados e confirmar a falha**

Executar: `node --test front-end/tests/roleAccess.test.js front-end/tests/layout.test.js`

Esperado: falha pelos exports ausentes e pela filtragem atual dos menus.

- [x] **Passo 3: Implementar a matriz compartilhada**

Criar as arrays em `roleAccess.js`, aplicar a matriz aos itens de menu e aos guards das rotas, proteger `/cadastro/mesas` como admin-only e renderizar `FichasTecnicas` diretamente em `/producao/fichas` para admin/cozinha.

- [x] **Passo 4: Executar os testes e confirmar a aprovação**

Executar: `node --test front-end/tests/roleAccess.test.js front-end/tests/layout.test.js`

Esperado: PASS, incluindo visibilidade por perfil e todos os links administrativos restritos.

- [x] **Passo 5: Commitar a tarefa**

```powershell
git add front-end\src\permissions\roleAccess.js front-end\src\App.jsx front-end\src\components\Layout.jsx front-end\tests\roleAccess.test.js front-end\tests\layout.test.js
git commit -m "feat: unifica acesso por perfil" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Tarefa 2: Aplicar as permissões mínimas na API

**Arquivos:**
- Modificar: `back-end/routes/comandas.js`
- Modificar: `back-end/routes/products.js`
- Modificar: `back-end/routes/production.js`
- Testar: `back-end/tests/integration/rbac.test.js`
- Testar: `back-end/tests/integration/comandaUnified.test.js`

**Interfaces:**
- A listagem de Cozinha é restrita a status `aberta` e retorna os campos de comanda/itens allowlisted na especificação.
- O catálogo de `/products/pdv` para Cozinha retorna somente `_id`, `nome`, `categoria`, `tipo`, `tipoProduto`, `unidadeVenda`, `pesoPorUnidade`, `unidadePeso` e `vendidoFracionado`.
- As consultas `/products` e `/production/recipes` necessárias às fichas técnicas da Cozinha retornam somente projeções operacionais, sem custos; as demais rotas de produção e `/products/inventory-list` permanecem negadas.
- As demais roles preservam os payloads e permissões existentes, exceto o fechamento por Garçom.

- [x] **Passo 1: Adicionar testes de RBAC e allowlist**

Adicionar testes cobrindo:
- Cozinha lista apenas comandas abertas e o KDS mantém sua tela com dados operacionais, sem valores, pagamentos, telefone ou endereço.
- Cozinha adiciona/ajusta/remove itens em comanda aberta; redução e remoção ainda exigem autorização.
- Cozinha não define preço manual, mesmo com autorização de gerente.
- Cozinha não altera rascunhos/fechadas nem cria, move, altera detalhes, cancela, recebe, fecha ou reabre.
- O catálogo de Cozinha não contém preço, estoque, custo ou ficha técnica.
- A consulta de fichas técnicas não contém custo ou autoria, e Cozinha não acessa outras rotas de produção nem `/products/inventory-list`.
- Garçom fecha comanda aberta, preserva recebimento parcial e cancelamento sob as aprovações atuais e continua sem reabertura.
- Gerente permanece sem acesso a `GET /mesas`; operador permanece sem acesso a `GET /products`.

- [x] **Passo 2: Executar os testes e confirmar as falhas**

Executar: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/rbac.test.js tests/integration/comandaUnified.test.js`

Esperado: falhas nos novos casos para Cozinha e Garçom.

- [x] **Passo 3: Implementar as permissões e projeções da API**

Em `comandas.js`, permitir cozinha somente em `GET /?status=aberta` e nas rotas de inclusão, edição de quantidade e remoção de itens. Rejeitar rascunhos para cozinha, manter as verificações de gerente e serializar respostas da lista/edição com a allowlist definida na especificação. Preservar os campos operacionais usados pelo KDS, sem incluir valores ou dados de contato, e rejeitar alteração de preço manual pela Cozinha. Remover Cozinha do status de balcão. Adicionar Garçom somente ao guard de `POST /:id/fechar`.

Em `products.js`, permitir cozinha em `/pdv` e, para esse perfil, projetar apenas os campos do catálogo definidos na especificação. Manter `/products` com projeção operacional sem custos para a tela de fichas técnicas e negar à Cozinha `/products/inventory-list`. Em `production.js`, permitir à Cozinha somente `GET /recipes`, com resposta operacional sem custos ou autoria; negar as demais rotas de produção. Não alterar as respostas para os demais perfis.

- [x] **Passo 4: Executar os testes e confirmar a aprovação**

Executar: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/rbac.test.js tests/integration/comandaUnified.test.js`

Esperado: PASS, inclusive as negativas de ações não autorizadas e a ausência dos campos sensíveis.

- [x] **Passo 5: Commitar a tarefa**

```powershell
git add back-end\routes\comandas.js back-end\routes\products.js back-end\routes\production.js back-end\tests\integration\rbac.test.js back-end\tests\integration\comandaUnified.test.js docs\superpowers\specs\2026-11-11-alinhamento-acessos-roles-design.md docs\superpowers\plans\2026-11-11-alinhamento-acessos-roles.md
git commit -m "feat: limita permissões de comandas por perfil" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Tarefa 3: Corrigir e restringir a tela de Comandas

**Arquivos:**
- Modificar: `front-end/src/pages/Comandas.jsx`
- Criar: `front-end/tests/e2e/role_comandas.cy.js`

**Interfaces:**
- Ler o perfil de `AuthContext` existente; não criar novo estado de autorização.
- `admin` e `gerente` usam o catálogo `/products`; `operador`, `garcom` e `cozinha` usam `/products/pdv`.
- Consultar `/mesas` somente quando o perfil puder e precisar abrir mesas; gerente e cozinha não fazem essa chamada.

- [x] **Passo 1: Adicionar casos Cypress para os cinco perfis**

Com fixtures locais, verificar:
- operador e Garçom carregam comandas e catálogo sem chamar `/products`; ambos podem alterar itens.
- gerente carrega lista e catálogo sem chamar `/mesas`; pode fechar e cancelar com a aprovação existente, mas não criar nem editar itens.
- cozinha vê somente comandas abertas, pode editar itens, não vê dados financeiros e não tem ações de criação, detalhes, movimento, recebimento ou fechamento.
- os cinco perfis autorizados conseguem abrir `/comandas`; cozinha abre `/producao/fichas`; perfis não admin são redirecionados ao abrir `/cadastro/mesas`.
- Garçom envia `POST /comandas/:id/fechar` no fluxo de fechamento.
- admin mantém a tela completa.

- [x] **Passo 2: Executar o spec e confirmar as falhas**

Com Vite disponível em `http://localhost:5173`, executar: `npm --prefix front-end run test:frontend -- --spec tests/e2e/role_comandas.cy.js`

Esperado: falha para o carregamento atual de operador/Garçom, e para os acessos ainda não implementados de gerente/cozinha.

- [x] **Passo 3: Corrigir as chamadas e os controles por perfil**

Em `Comandas.jsx`, selecionar o endpoint de catálogo pelo perfil; omitir a consulta de mesas para gerente/cozinha; ocultar criação e alterações de itens para gerente; ocultar criação, metadados, movimento, fechamento e valores financeiros para cozinha. Não renderizar nem calcular componentes financeiros com campos ausentes na projeção de cozinha. Preservar cancelamento do Gerente com a aprovação atual, permissões financeiras atuais do Garçom, adição/ajuste/remoção de itens para cozinha e o fluxo atual de aprovação em ações destrutivas.

- [x] **Passo 4: Executar o spec e confirmar a aprovação**

Executar: `npm --prefix front-end run test:frontend -- --spec tests/e2e/role_comandas.cy.js`

Esperado: PASS para operador, Garçom, gerente, cozinha e admin.

- [x] **Passo 5: Commitar a tarefa**

```powershell
git add front-end\src\pages\Comandas.jsx front-end\tests\e2e\role_comandas.cy.js
git commit -m "fix: corrige acesso por perfil em comandas" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Tarefa 4: Alinhar as demais telas permitidas ao Gerente e à Cozinha

**Arquivos:**
- Modificar: `front-end/src/pages/Products.jsx`
- Modificar: `front-end/src/pages/Customers.jsx`
- Modificar: `front-end/src/pages/Production.jsx`
- Modificar: `front-end/src/pages/FichasTecnicas.jsx`
- Criar: `front-end/tests/e2e/role_access.cy.js`
- Teste de regressão: `front-end/tests/e2e/autorizacao_gerente.cy.js`

**Interfaces:**
- Todas as telas usam o usuário já fornecido por `AuthContext`.
- Reabertura de Caixa mantém a chamada existente e o retry/autorização do interceptor global de `api.jsx`; não alterar `Caixa.jsx` para duplicar esse comportamento.

- [x] **Passo 1: Adicionar testes de telas e reabertura**

Verificar gerente sem criação/exclusão de produto, sem escrita em clientes e produção, com telas permitidas acessíveis; cozinha vê fichas técnicas sem controles de escrita. Para reabertura de caixa, simular 403 com `acao: 'reabrir_caixa'` e confirmar que o interceptor solicita autorização e repete a chamada com o header aprovado.

- [x] **Passo 2: Executar os specs e confirmar as falhas**

Com Vite disponível em `http://localhost:5173`, executar: `npm --prefix front-end run test:frontend -- --spec tests/e2e/role_access.cy.js,tests/e2e/autorizacao_gerente.cy.js`

Esperado: falhas nos controles e guardas que ainda divergem da API.

- [x] **Passo 3: Aplicar os limites de ação nas telas**

Gerente mantém leitura/exportação de clientes, leitura e edição de produtos via aprovação, apenas estoque de insumos em Produção e as ações já permitidas de Caixa. Cozinha mantém as fichas técnicas somente para leitura. Admin mantém os controles atuais.

- [x] **Passo 4: Executar os specs e confirmar a aprovação**

Executar: `npm --prefix front-end run test:frontend -- --spec tests/e2e/role_access.cy.js,tests/e2e/autorizacao_gerente.cy.js`

Esperado: PASS, inclusive retry aprovado de reabertura pelo interceptor global.

- [x] **Passo 5: Commitar a tarefa**

```powershell
git add front-end\src\pages\Products.jsx front-end\src\pages\Customers.jsx front-end\src\pages\Production.jsx front-end\src\pages\FichasTecnicas.jsx front-end\tests\e2e\role_access.cy.js front-end\tests\e2e\autorizacao_gerente.cy.js
git commit -m "fix: alinha controles de telas por perfil" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### Tarefa 5: Executar regressão, build e validação de rollout

**Arquivos:**
- Verificar os arquivos das tarefas 1–4; não adicionar funcionalidades.

- [ ] **Passo 1: Executar testes unitários frontend**

Executar: `npm --prefix front-end run test:unit`

Esperado: todos os testes passam.

- [ ] **Passo 2: Executar RBAC e testes de comandas backend**

Executar: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/rbac.test.js tests/integration/comandaUnified.test.js`

Esperado: PASS, sem ampliar permissões fora das explicitadas.

- [ ] **Passo 3: Executar lint e build frontend**

Executar `npm --prefix front-end run lint` e `npm --prefix front-end run build`.

Esperado: lint sem erros e build de produção concluído.

- [ ] **Passo 4: Revisar escopo e whitespace**

Executar `git diff --check`, `git status --short` e `git diff --stat`.

Esperado: sem erros de whitespace; nenhuma dependência, migração ou dado persistido alterado; mudanças apenas nas telas, permissões e testes especificados.

- [ ] **Passo 5: Validar em staging antes de produção**

Validar com contas de admin, gerente, operador, cozinha e garçom: rotas e menus diretos, edição e fechamento, aprovações, respostas de API da cozinha sem campos financeiros e rejeição de ações fora do escopo. Publicar backend primeiro e frontend depois; manter os dois artefatos anteriores para rollback.
