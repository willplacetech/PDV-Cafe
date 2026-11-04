# White-label PDV Fase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolar todos os dados e operações do PDV por Tenant e fornecer identidade, recursos por plano e permissões configuráveis no backend e no frontend.

**Architecture:** Estender o `Tenant` e os modelos existentes, migrar dados legados por mapeamento explícito e aplicar contexto de tenant nas rotas do PDV. Acrescentar autorização por role e plano como middlewares server-side; o frontend só reflete permissões/identidade já verificadas pelo servidor.

**Tech Stack:** Node.js, Express, Mongoose/MongoDB, Jest, Supertest, React 19, Vite 8, Vite PWA.

**Spec:** [docs/superpowers/specs/2026-11-04-white-label-fase-a-design.md](../specs/2026-11-04-white-label-fase-a-design.md)

## Global Constraints

- Toda permissão e proteção validada no backend (nunca só no front).
- Não reescreva lógica existente — estenda. Use os modelos e middlewares já existentes.
- `Tenant.plano` mantém os valores legados `teste|mensal`; `planoRecursos` usa `essencial|pro|delivery` e não é inferido da cobrança.
- Um ID pertencente a outro tenant responde 404/403 e nunca revela dados.
- Todo modelo de domínio do PDV passa a ter `tenantId` obrigatório para novas gravações.
- Roles legadas `operador`, `cozinha` e `garcom` permanecem reconhecidas durante a migração e recebem permissões de transição explícitas e não mais amplas que as rotas que já podiam usar.
- Cache máximo de 30 segundos, invalidado após PUT no processo atual.
- Logo por URL HTTPS ou caminho local; upload binário fica fora desta fase.
- Antes de cada commit: `npm run build` (front) e `node --check` em cada arquivo backend alterado.
- Nenhum merge até todos os critérios da Fase A passarem.

## Review Focus

- **Migração ambígua ou parcialmente aplicada:** dry-run e segundo run precisam ser seguros; tarefa 1.
- **IDs/referências cruzadas entre tenants e rotas sem escopo, incluindo agregações:** devem falhar sem vazamento; tarefas 2–5.
- **Roles de token antigas, role legado e usuário sem cadastro de permissão:** autoridade deve vir do estado atual do servidor e falhar de modo conservador; tarefa 6.
- **Slug/branding/manifesto com tenant errado ou URL de logo insegura:** identidade pública precisa ser limitada e validada; tarefa 7.
- **CORS/contrato de sessão e regressões Delivery ou frontend preexistente:** manter consumidores existentes sem relaxar isolamento; tarefas 0, 7 e 8.

---

### Task 0: Restaurar baseline do build frontend

**Files:**
- Modify: `front-end/src/pages/ContasReceber.jsx` (sintaxe JSX indicada pelo build)
- Modify: `front-end/src/pages/Comandas.jsx` (sintaxe JSX indicada pelo build)
- Modify: `front-end/src/pages/Configuracoes.jsx` (sintaxe JSX indicada pelo build)
- Modify: `front-end/src/pages/Entregas.jsx` (sintaxe JSX indicada pelo build)
- Modify: `front-end/src/pages/PDV.jsx` (sintaxe JSX indicada pelo build)
- Test: build de produção do frontend

**Interfaces:**
- Consome: nenhuma interface nova.
- Produz: build atualizável para validar a fase; nenhuma alteração de comportamento nos cinco arquivos.

- [ ] Reproduzir `npm run build` e localizar cada token inválido nas cinco páginas.
- [ ] Corrigir somente os erros de parse, sem refatorar ou alterar regra de negócio, navegação ou conteúdo.
- [ ] Executar `npm run build`; esperado: exit code 0.
- [ ] Executar `npm --prefix front-end run test:unit`; esperado: todas as suítes passam.

### Task 1: Estender Tenant e preparar migração segura

**Files:**
- Modify: `back-end/models/Tenant.js`
- Modify: `back-end/models/User.js`
- Modify: modelos de domínio tenant-scoped: `Product.js`, `Order.js`, `Comanda.js`, `Customer.js`, `Purchase.js`, `Despesa.js`, `StockMovement.js`, `Production.js`, `Recipe.js`, `HistoricoCusto.js`, `FechamentoCaixa.js`, `OperacaoFinanceira.js`, `Auditoria.js`, `MesasSettings.js`, `PaymentSettings.js`, `RuntimeSettings.js`, `Configuracoes.js`, `RecipeAudit.js` e `Reserva.js`
- Create: `back-end/scripts/migrar-tenant-pdv.js`
- Create: teste de migração em `back-end/tests/integration/tenantMigration.test.js`
- Modify: `back-end/package.json` somente para adicionar comando de migração explícito
- Test: `back-end/tests/integration/tenantMigration.test.js`

**Interfaces:**
- Produz: Tenant com `logoUrl`, `corPrimaria`, `corSecundaria`, `appName` e `planoRecursos` sem alterar o enum legado `plano`; todos os documentos do PDV aceitam `tenantId`.
- Produz: comando `npm --prefix back-end run tenant:migrate -- --map <arquivo> [--dry-run]`, que exige mapeamento explícito e informa contagens por coleção.

- [ ] Testar em banco temporário os modos dry-run, abortar mapa incompleto/ambíguo sem escrita e reaplicar migração sem duplicar associação.
- [ ] Executar `npm --prefix back-end run test:integration -- tests/integration/tenantMigration.test.js`; esperado: falha pelos contratos ainda não implementados.
- [ ] Implementar preflight de coleções, referências e colisões de índices; validar `tenantId`, slug, cores, URL do logo e `planoRecursos`; dry-run não grava.
- [ ] Só criar índices únicos compostos depois do preflight; manter unicidade global até a migração provar que é seguro substituir cada índice por `{ tenantId, campoUnico }`. `User.username` permanece globalmente único nesta fase; e-mail também preserva a unicidade atual.
- [ ] Executar teste focalizado; esperado: mapeamento inválido não altera nenhum documento, e migração válida e repetida associa cada documento a exatamente um tenant.
- [ ] Executar `node --check` em cada modelo e script backend alterado.

### Task 2: Resolver tenant autenticado e proteger ausência de sessão

**Files:**
- Create: `back-end/middleware/exigirTenant.js`
- Modify: `back-end/middleware/auth.js`
- Modify: `back-end/server.js`
- Create: `back-end/tests/integration/tenantAuth.test.js`
- Modify: `back-end/tests/integration/authRevocation.test.js` e testes de contrato que dependam do status de autenticação
- Test: `back-end/tests/integration/tenantAuth.test.js`

**Interfaces:**
- Produz: `exigirTenant(req,res,next)`, que carrega Tenant ativo a partir de `req.user.tenantId`, define `req.tenant` e `req.tenantId`, e responde 403 se tenant ausente/inativo.
- Produz: ausência de token retorna 403 nas rotas protegidas; token expirado/inválido continua 401. Login/PWA público e rotas dedicadas de plataforma/Delivery não são submetidos ao middleware operacional do PDV.

- [ ] Testar sem token, token inválido, usuário sem tenant, tenant inativo, tenant válido e adulteração de `tenantId` no body/query/header.
- [ ] Executar a suíte de autenticação atual para registrar todas as expectativas de status que precisarão acompanhar a regra explícita da especificação.
- [ ] Implementar resolução autoritativa por associação atual do usuário no banco; não aceitar tenant informado pelo cliente como fonte de autorização.
- [ ] Aplicar middleware nas rotas protegidas do PDV sem mudar a pilha de autenticação das rotas próprias de plataforma e Delivery.
- [ ] Executar testes de autenticação e Delivery; esperado: os casos tenant-scoped rejeitam contexto ausente e os fluxos Delivery permanecem compatíveis.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 3: Escopar catálogo, vendas, comandas e clientes

**Files:**
- Modify: `back-end/routes/products.js`, `orders.js`, `comandas.js`, `customers.js`, `autoAtendimento.js`
- Modify: `back-end/utils/movimentarEstoqueVenda.js` se as referências de estoque exigirem contexto explícito
- Modify: `back-end/models/Product.js`, `Order.js`, `Comanda.js`, `Customer.js` conforme Task 1
- Create: `back-end/tests/integration/tenantSales.test.js`
- Test: `back-end/tests/integration/tenantSales.test.js`

**Interfaces:**
- Consome: `req.tenantId` de Task 2.
- Produz: leitura, escrita, mutação, idempotência e referências cruzadas dessas rotas escopadas por tenant; IDs de tenant alheio retornam 404.

- [ ] Criar dois tenants com produtos, clientes, pedidos e comandas distintos; testar listagem, busca, paginação, contagem, criação, edição, cancelamento e exclusão.
- [ ] Testar que pedidos/comandas de A não aceitam produto/cliente de B, inclusive IDs enviados diretamente.
- [ ] Escopar por tenant cada consulta, lookup, agregação, update/delete e chamada de utilitário; novas gravações usam exclusivamente `req.tenantId`.
- [ ] Executar a suíte nova e as regressões de pedidos/comandas/produtos/clientes; esperado: isolamento bidirecional e fluxos existentes passando.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 4: Escopar estoque, produção, compras e cardápio

**Files:**
- Modify: `back-end/routes/estoque.js`, `insumos.js`, `production.js`, `purchases.js`, `receitas.js`, `mesas.js`, `reservas.js`, `fiscal.js`
- Modify: `back-end/models/StockMovement.js`, `Production.js`, `Purchase.js`, `Recipe.js`, `RecipeAudit.js`, `HistoricoCusto.js`, `Reserva.js`, `MesasSettings.js`
- Create: `back-end/tests/integration/tenantOperations.test.js`
- Test: `back-end/tests/integration/tenantOperations.test.js`

**Interfaces:**
- Consome: `req.tenantId` e modelos da Task 1.
- Produz: operações de estoque/produção/compra, ficha técnica, mesas, reservas e fiscal limitadas ao tenant, com validação tenant-to-tenant das referências.

- [ ] Criar insumo e produto produzido em A e B; testar que consultas, compra/produção, movimentos, alteração de custo, reserva e configuração de mesas de um tenant não leem nem atualizam o outro.
- [ ] Testar tentativa de compra, ficha técnica ou reserva que referencie documento de outro tenant; esperado: rejeição sem escrita parcial.
- [ ] Escopar agregações e operações de lote, repassando a sessão Mongo existente; preservar transações e snapshots de custo.
- [ ] Executar testes de integração novos e regressões de estoque, produção, compras, mesas, reservas e fiscal.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 5: Escopar financeiro, relatórios e auditoria existente

**Files:**
- Modify: `back-end/routes/caixa.js`, `contasReceber.js`, `despesas.js`, `contabil.js`, `dashboard.js`, `auditoria.js`, `paymentSettings.js`
- Modify: `back-end/models/FechamentoCaixa.js`, `Despesa.js`, `OperacaoFinanceira.js`, `Auditoria.js`, `PaymentSettings.js`, `Configuracoes.js`, `RuntimeSettings.js`
- Modify: `back-end/utils/operacaoFinanceira.js` e utilitários de período que precisem carregar tenant
- Create: `back-end/tests/integration/tenantFinance.test.js`
- Test: `back-end/tests/integration/tenantFinance.test.js`

**Interfaces:**
- Consome: `req.tenantId`.
- Produz: relatórios/DRE/dashboard e configurações financeiras tenant-scoped; configurações e índices não são globais entre comércios.

- [ ] Criar dados financeiros equivalentes em dois tenants e testar DRE, dashboard, pagamentos, despesas, recebíveis, caixa, taxas e auditoria sem mistura.
- [ ] Testar lookup por ID, contagem, agregação e operações idempotentes financeiras contra ID/registro de outro tenant.
- [ ] Escopar queries e escritas com `tenantId`, inclusive exportações, contagens de dashboard e fontes de pagamento de comanda; manter filtros e cálculos atuais.
- [ ] Executar novas integrações e regressões financeira, dashboard, DRE, caixa e autorização.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 6: Implementar permissões por role no backend

**Files:**
- Create: `back-end/models/Permissao.js`
- Create: `back-end/utils/catalogoPermissoes.js`
- Create: `back-end/middleware/exigirPermissao.js`
- Modify: `back-end/routes/auth.js`, `configuracoes.js` e rotas de negócio dos Tasks 3–5 para proteger cada ação sensível
- Create: `back-end/tests/integration/tenantPermissions.test.js`
- Modify: `back-end/tests/setup.js` somente para inicializar índices do modelo novo
- Test: `back-end/tests/integration/tenantPermissions.test.js`

**Interfaces:**
- Produz: `exigirPermissao('modulo:acao')`; resolve Tenant/role atual, permite admin por regra fixa e aplica defaults conservadores para roles legadas.
- Produz: catálogo estável de ações e coleção com índice único `{ tenantId, role }`; cache até 30 s invalidado após PUT no processo.

- [ ] Testar matriz padrão para `admin`, `gerente`, `atendente`, `caixa`, `entregador`, `operador`, `cozinha` e `garcom`; testar role desconhecida e permissão ausente como negadas.
- [ ] Testar `GET/PUT /api/configuracoes/permissoes`: só role autorizada pode editar; tentativa de editar ou esvaziar admin falha; payload não pode definir tenant alheio nem ação fora do catálogo.
- [ ] Testar atendente sem `usuarios:gerir` recebe 403, role atual substitui claim antiga do JWT e alteração de role incrementa `tokenVersion`.
- [ ] Implementar catálogo e middleware consultando estado server-side, invalidando cache local e nunca gravando permissões no JWT.
- [ ] Aplicar `exigirPermissao` em cada ação sensível do catálogo de rotas; manter `auth.allowRoles` apenas nas fronteiras de plataforma/sistema que não são delegadas ao tenant.
- [ ] Executar testes novos e todas as suítes RBAC/autenticação; esperado: negar por padrão e não elevar privilégios de `operador`, `cozinha` ou `garcom`.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 7: Planos, identidade tenant-scoped e PWA

**Files:**
- Modify: `back-end/models/Tenant.js`, `back-end/routes/delivery.js`, `back-end/routes/configuracoes.js`, `back-end/server.js`
- Create: `back-end/utils/recursosTenant.js`
- Create: `back-end/routes/brandingPublico.js` ou módulo público equivalente montado em `server.js`
- Modify: `front-end/src/config/branding.js`, `front-end/src/pages/Aparencia.jsx`, `front-end/src/pages/Configuracoes.jsx`, `front-end/src/pages/Login.jsx`, `front-end/src/App.jsx`, `front-end/src/context/ConfiguracoesContext.jsx`, `front-end/src/components/Layout.jsx`, `front-end/src/styles/theme.css`, `front-end/vite.config.js`
- Create: `back-end/tests/integration/tenantBranding.test.js`, `back-end/tests/integration/tenantFeatures.test.js`
- Test: testes de marca/manifesto e plano no backend; unit tests do frontend para seleção e troca de tenant

**Interfaces:**
- Produz: `pode(recurso, tenant)` e middleware de recurso; campos `planoRecursos` são administráveis somente pelas rotas `admin_plataforma`.
- Produz: endpoints públicos por slug para branding e manifesto; identidade protegida por `exigirTenant` + `configuracoes:gerir`.

- [ ] Testar duas marcas por slug, tenant desativado, campos públicos mínimos, cores/URLs inválidas, tentativa de atualizar outro tenant e manifesto com start URL de slug próprio.
- [ ] Testar plano essencial/pro/delivery e ausência de `planoRecursos`; recurso core continua disponível e `delivery` sem plano explicitamente autorizado falha fechado.
- [ ] Implementar atualização de Tenant somente para `admin_plataforma`; preservar `plano` legado, `pdvIntegrado`, criação de tenant e contas existentes do Delivery.
- [ ] Substituir branding global de runtime por leitura pública por slug e escrita autenticada no Tenant; manter `/configuracoes/branding` só como ponte autenticada de instalação única, sem fallback global depois da migração.
- [ ] Integrar slug pré-login via `?tenant=<slug>`, conferir associação retornada por `/auth/me`, limpar branding ao trocar de slug e não confiar em tenantId do cliente.
- [ ] Atualizar CSS variables, nome/ícones/metadados e `<link rel="manifest">`; servir manifesto por tenant com escopo/start URL daquele slug e manter fallback local de desenvolvimento.
- [ ] Testar que POST/GET de uma rota Delivery sob plano sem `delivery` retorna 403, e que o plano legado `teste|mensal` continua preservado.
- [ ] Executar testes frontend direcionados, build, integrações de branding/features e regressões Delivery.
- [ ] Executar `node --check` em cada arquivo backend alterado.

### Task 8: Fechar cobertura, contrato HTTP e validação da fase

**Files:**
- Modify: `back-end/tests/integration/tenantIsolation.test.js` (ou consolidar fixtures reutilizáveis de tenants sem substituir testes dos domínios)
- Modify: testes de API que afirmam status 401 para requisições protegidas sem token
- Modify: `CHANGELOG.md` e versão da PWA conforme convenção existente do projeto
- Test: suíte backend, suíte unitária frontend, build e verificação sintática do backend alterado

**Interfaces:**
- Consome: todas as interfaces dos Tasks 1–7.
- Produz: evidência de cobertura de todas as rotas de negócio e verificação final da Fase A; não integra as Fases B/C.

- [ ] Manter inventário de cada mount do `server.js` e associar toda rota a: público, tenant, plataforma, sistema ou courier; falhar teste se uma nova rota de negócio não estiver classificada.
- [ ] Executar teste de matriz A/B para métodos de leitura e escrita e teste sem token (403), tenant atendente sem `usuarios:gerir` (403) e tenant A acessando ID de B (404/403).
- [ ] Executar o E2E venda → baixa de produto/insumo → custo histórico/CMV → DRE e dashboard; preservar `back-end/tests/integration/salesStockDre.test.js`, que é arquivo não rastreado trazido de `Generico` e não deve ser adicionado sem autorização explícita.
- [ ] Atualizar changelog/versão somente para esta fase, sem remover changelog existente.
- [ ] Executar `npm test`, `npm run test:frontend:unit`, `npm run build` e `node --check` em cada arquivo backend alterado; corrigir toda falha introduzida nesta branch e documentar claramente falhas preexistentes.
- [ ] Rever diff por possíveis queries sem `tenantId`, logs que exponham dados e alterações não relacionadas.
- [ ] Preparar commit de validação somente depois que os critérios da Fase A passarem; sem merge/deploy nesta tarefa.
