# Seleção Mensal e Inventário Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir consultar o fechamento mensal do Dashboard por mês e imprimir uma folha A4 de inventário para contagem manual, sem alterar saldos.

**Architecture:** A rota existente do Dashboard aceitará `mes=AAAA-MM` para delimitar apenas as consultas e agregações do resumo mensal, preservando o mês corrente como padrão e os demais cartões atuais. A rota de produtos ganhará uma consulta autenticada e minimizada para impressão; a tela Produtos buscará o inventário completo sob demanda e abrirá um documento A4 com os dados escapados e espaços para conferência.

**Tech Stack:** React, Vite, Express, Mongoose, Jest, Supertest, Cypress.

**Spec:** `docs/superpowers/specs/2026-11-03-selecao-mensal-inventario-design.md`

## Global Constraints

- Mês usa o formato `AAAA-MM`, com o mês corrente como padrão.
- Intervalos mensais usam início inclusivo e fim exclusivo no fuso `America/Sao_Paulo`.
- Indicadores diários, urgências e relatórios sem agrupamento mensal permanecem sem filtro mensal.
- Inventário inclui produtos ativos com estoque próprio e insumos ativos; exclui inativos e produtos “Coz — na hora”.
- Inventário não altera saldos e não expõe preços, custos nem informações de clientes.
- Falhas de consulta e bloqueios de pop-up devem ser comunicados; não gerar impressão incompleta com aparência de sucesso.
- Escapar valores textuais antes de inserir no documento impresso.
- Preservar a autorização existente para consultar produtos/estoque.

## Review Focus

- **Mês válido nos limites do ano:** intervalo e rótulo continuam corretos em dezembro/janeiro; cobrir na integração do Dashboard.
- **Mês impossível ou malformado:** responder erro explícito, sem cair no mês atual; cobrir na integração do Dashboard.
- **Pedidos no limite do intervalo:** incluir o início e excluir o primeiro instante do mês seguinte; cobrir na integração do Dashboard.
- **Estoque derivado e dados privados:** normalizar produtos por peso e insumos sem expor custo; cobrir na integração do endpoint de inventário.
- **Falha ou entrada hostil na impressão:** erro não deve abrir uma folha incompleta, e nomes/categorias não podem injetar HTML; cobrir no fluxo de impressão.

---

### Task 1: Seleção de mês no endpoint do Dashboard

**Files:**
- Modify: `back-end/routes/dashboard.js`
- Test: `back-end/tests/integration/dashboardReports.test.js`

**Interfaces:**
- Consumes: `partesDataSaoPaulo`, `dataSaoPaulo`, `formatarDataPtBr`, `quantidadeNaUnidadeBase` e a estrutura atual de `relatorioMes`.
- Produces: `GET /api/dashboard?mes=AAAA-MM`; `relatorioMes` e seus agregados referem-se ao mês solicitado. Sem `mes`, permanece o mês corrente. Parâmetro malformado/impossível responde `400` JSON.

- [x] **Step 1: Escrever testes de integração que falham**

  Em `dashboardReports.test.js`, estender o helper `dashboard` para aceitar query string e adicionar testes cobrindo:
  - vendas em dois meses distintos aparecem apenas no mês selecionado;
  - pedido no início do mês é incluído e pedido no início do mês seguinte é excluído;
  - seleção `2025-12` reporta o intervalo correto, sem misturar janeiro de 2026;
  - mês ausente usa o mês corrente;
  - `mes=2025-13` e `mes=2025-2` retornam `400`.

- [x] **Step 2: Executar os testes e confirmar falha**

  Run (em `back-end`): `npx cross-env NODE_ENV=test jest --runInBand tests/integration/dashboardReports.test.js`

  Expected: falha porque o endpoint ainda não usa o mês informado e não rejeita valores inválidos.

- [x] **Step 3: Implementar a validação e os limites mensais**

  Em `dashboard.js`, adicionar helper local para validar estritamente ano e mês (`YYYY-MM`, mês 01–12) e calcular início/fim com offsets de `America/Sao_Paulo`, incluindo virada do ano. Rejeitar parâmetro presente porém inválido com `400`. Usar os limites escolhidos nas consultas `pedidosMes` e `recebimentosMes` e no rótulo de `relatorioMes`; manter `pedidosDia`, urgências, insights e comparações atuais independentes.

- [x] **Step 4: Executar os testes e confirmar sucesso**

  Run: `npx cross-env NODE_ENV=test jest --runInBand tests/integration/dashboardReports.test.js`

  Expected: todos os testes do arquivo passam, incluindo os novos limites e validação.

- [x] **Step 5: Commit**

  Commit da rota e testes com mensagem `feat: filtra fechamento do dashboard por mês`.

### Task 2: Seleção mensal do fechamento no Dashboard

**Files:**
- Modify: `front-end/src/pages/Dashboard.jsx`
- Modify: `front-end/src/pages/Financeiro.jsx`
- Create: `front-end/tests/e2e/monthly_reports.cy.js`

**Interfaces:**
- Consumes: `GET /api/dashboard?mes=AAAA-MM` da Task 1 e `relatorioMes.periodo`.
- Produces: seletor de mês no cartão de fechamento mensal; mês corrente inicial; alteração do seletor atualiza os dados impressos e exibidos sem recarregar ou alterar indicadores diários. DRE, fluxo de caixa e resumo de despesas indicam o mês consultado; comparação mantém os períodos A/B independentes.

- [x] **Step 1: Escrever teste Cypress que falha**

  Adicionar cenários autenticados que:
  - no Dashboard, interceptam a consulta mensal, verificam o valor inicial `AAAA-MM`, alteram para mês anterior e confirmam request com `mes`, rótulo e fechamento correspondentes; a área diária permanece sem filtro;
  - no Financeiro, escolhem um mês, visitam Contas a Pagar, Fluxo de Caixa e DRE, verificam o período indicado e os requests com o mesmo mês; ao visitar Comparar Meses, confirmam que os dois campos A/B continuam controlando seus próprios parâmetros.

- [x] **Step 2: Executar o teste e confirmar falha**

  Run (em `front-end`): `npx cypress run --spec tests/e2e/monthly_reports.cy.js`

  Expected: falha porque ainda não existe seletor de mês para o fechamento.

- [x] **Step 3: Implementar estado e carregamento mensal**

  Em `Dashboard.jsx`, criar estado de mês inicializado com componentes locais de ano/mês, adicionar um `input type="month"` ao cartão mensal e buscar novamente `/dashboard?mes=...` ao mudar. Preservar os demais carregamentos e apresentar erro pelo toast existente. Garantir que o fechamento impresso use o período do payload em vez de assumir o mês corrente; não imprimir dados enquanto uma nova consulta estiver pendente ou tiver falhado.

  Em `Financeiro.jsx`, preservar o seletor único existente e adicionar a indicação `Período consultado: MM/AAAA` nas visões de Contas a Pagar, Fluxo de Caixa e DRE, usando o valor selecionado. Não conectar esse estado aos campos independentes de Comparar Meses.

- [x] **Step 4: Executar o teste e lint**

  Run: `npx cypress run --spec tests/e2e/monthly_reports.cy.js`

  Expected: cenário passa.

  Run: `npm run lint`

  Expected: lint dos arquivos alterados passa; o lint completo pode reportar os dois erros preexistentes em `TrocoAuxiliar.jsx` e `api.jsx`.

- [x] **Step 5: Commit**

  Commit da tela e teste com mensagem `feat: seleciona mês no fechamento do dashboard`.

### Task 3: Consulta segura da lista de inventário

**Files:**
- Modify: `back-end/routes/products.js`
- Test: `back-end/tests/integration/productsCompatibility.test.js`

**Interfaces:**
- Consumes: permissões existentes da rota de listagem, `dadosEstoqueProduto`, regras de produtos controlados por peso e o resumo operacional de insumos.
- Produces: `GET /api/products/inventory-list`, uma lista completa ordenada com `codigo`, `nome`, `categoria`, `tipo`, `unidade` e `estoque`; nenhum preço/custo. Requer os mesmos perfis autorizados a consultar estoque.

- [ ] **Step 1: Escrever testes de integração que falham**

  Criar fixtures para produto ativo normal, produto por peso, insumo, produto inativo e produto “Coz — na hora”. Testar que o endpoint retorna só os itens elegíveis, saldo/unidade normalizados e ordenação determinística; verificar que objetos não incluem chaves de preço/custo e que pedido sem autenticação recebe `401`.

- [ ] **Step 2: Executar os testes e confirmar falha**

  Run (em `back-end`): `npx cross-env NODE_ENV=test jest --runInBand tests/integration/productsCompatibility.test.js`

  Expected: falha porque a rota de impressão ainda não existe.

- [ ] **Step 3: Implementar a consulta de inventário**

  Adicionar `GET /inventory-list` antes de rotas dinâmicas `/:id`. Aplicar autenticação e os perfis `admin`, `gerente`, `cozinha`, buscar somente itens ativos elegíveis, ordenar por categoria/nome e projetar somente os campos necessários. Usar `dadosEstoqueProduto` para itens de venda e o resumo operacional existente para insumos; excluir “Coz — na hora” por não manter estoque próprio. Não reutilizar a resposta integral do catálogo.

- [ ] **Step 4: Executar os testes e confirmar sucesso**

  Run: `npx cross-env NODE_ENV=test jest --runInBand tests/integration/productsCompatibility.test.js`

  Expected: novos contratos e compatibilidade atual passam.

- [ ] **Step 5: Commit**

  Commit da rota e testes com mensagem `feat: adiciona consulta para inventário`.

### Task 4: Impressão A4 de inventário na tela Produtos

**Files:**
- Modify: `front-end/src/pages/Products.jsx`
- Create: `front-end/tests/e2e/inventory_print.cy.js`

**Interfaces:**
- Consumes: `GET /api/products/inventory-list` da Task 3 e o padrão de toast da tela Produtos.
- Produces: ação “Imprimir inventário” que busca a lista completa sob demanda e imprime folha A4 com código, item, categoria/tipo, unidade, saldo do sistema, contagem física e diferença. A operação não persiste contagens nem altera estoques.

- [ ] **Step 1: Escrever testes Cypress que falham**

  Criar cenários para: clique imprime múltiplos itens mesmo com busca/paginação da tabela; documento inclui saldo e duas colunas vazias; valores textuais contendo markup aparecem como texto e não são executados; falha da API mostra erro e não abre documento; pop-up bloqueado mostra aviso.

- [ ] **Step 2: Executar os testes e confirmar falha**

  Run (em `front-end`): `npx cypress run --spec tests/e2e/inventory_print.cy.js`

  Expected: falha porque a ação e o documento de impressão ainda não existem.

- [ ] **Step 3: Implementar a impressão**

  Adicionar ação na tela Produtos que abre uma janela de impressão sincronamente no clique para evitar bloqueio do navegador, consulta a lista completa e fecha a janela se a consulta falhar. Escapar cada valor textual antes de montar HTML; produzir estilo de impressão A4 com cabeçalho, data, linhas legíveis e campos vazios para contagem/diferença. Comunicar bloqueio e erros pelo toast existente; não incluir preço/custo nem salvar contagens.

- [ ] **Step 4: Executar teste, lint e build**

  Run: `npx cypress run --spec tests/e2e/inventory_print.cy.js`

  Expected: cenários de impressão passam.

  Run: `npm run lint`

  Expected: lint passa sem novos erros.

  Run: `npm run build`

  Expected: build de produção termina com código zero.

- [ ] **Step 5: Commit**

  Commit da tela e teste com mensagem `feat: imprime lista de inventário`.

## Self-review

- **Cobertura da especificação:** Tasks 1–2 implementam seleção, limites, rótulo, impressão mensal e isolamento de indicadores diários. Tasks 3–4 implementam consulta autorizada minimizada, conjunto de itens, normalização, folha A4, escape, erros, ausência de escrita e validação final.
- **Passos:** cada tarefa escreve teste antes de código e fecha com verificação e commit; as interfaces das Tasks 1 e 3 estão explícitas para suas consumidoras.
- **Consistência:** frontend envia `mes=AAAA-MM`; backend expõe `GET /api/dashboard?mes=AAAA-MM`. A impressão usa `GET /api/products/inventory-list`.
- **Review focus:** cada input/condição está coberto nos passos de teste que possuem sua lógica.
- **Proporção:** quatro tarefas acompanham as duas interfaces independentes necessárias, sem propor nova central de relatórios nem mudanças fora do escopo.
