# Cardápio digital com autoatendimento QR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar pedidos públicos por QR de mesa, salvando o Cliente de forma privada e encaminhando comandas abertas ao PDV e KDS.

**Architecture:** O backend cria e valida tokens persistentes de mesa e expõe endpoints públicos dedicados para cardápio e pedidos, usando preços e estoque do banco e as regras atuais de comanda. O frontend oferece o cardápio público, gera QR localmente no cadastro de mesas e usa o polling existente para destacar pedidos QR na equipe.

**Tech Stack:** Node.js 22, Express, Mongoose/MongoDB, Jest/Supertest, React 19, Vite, Cypress, `qrcode` para geração local de QR.

**Spec:** [2026-10-22-cardapio-autoatendimento-design.md](../specs/2026-10-22-cardapio-autoatendimento-design.md)

## Global Constraints

- A comanda operacional usa `status: 'aberta'`, `statusPagamento: 'pendente'` e `origem: 'qr'`.
- A mesa é determinada exclusivamente pelo token persistido no backend; campos de mesa enviados pelo cliente não são fonte de autoridade.
- Preço, nome e disponibilidade dos produtos vêm do banco; valores enviados pelo cliente são ignorados.
- Nome e telefone são necessários; nome tem no máximo 120 caracteres; telefone é normalizado e validado com 10 a 13 dígitos.
- `consentimentoWhatsApp === true` é obrigatório no frontend e validado no backend; salvar por pedido com timestamp do servidor.
- Telefone não pode aparecer em respostas públicas, URLs, links QR, logs de requisição ou erros públicos.
- Nome e telefone ficam em `sessionStorage` durante a sessão e são removidos após confirmação de pedido.
- Um Cliente localizado pelo telefone é reutilizado e seu nome cadastrado não é sobrescrito.
- Reutilizar o polling atual; não adicionar Socket.IO.
- QR é gerado localmente; não enviar tokens ou dados do cliente a serviços terceiros.
- Não implementar CPF, pagamento online ou envio automático de WhatsApp.
- Baixar estoque e criar Cliente/comanda na mesma transação; nenhuma falha pode deixar alterações parciais.
- Mesas inativas não podem carregar cardápio nem enviar pedidos.
- Antes de produção, o responsável por privacidade/jurídico deve validar tornar o consentimento de WhatsApp obrigatório para concluir a compra.

## Review Focus

- **Token ausente, adulterado, duplicado ou de mesa inativa:** garantir geração persistente/única e recusa pública; cobrir em Task 1 e Task 2.
- **Payload público inválido, campos desconhecidos ou quantidades/observações fora dos limites:** garantir 400 sem escrita; cobrir em Task 2.
- **Retry concorrente com a mesma chave de idempotência:** garantir somente uma comanda e uma baixa de estoque; testar replay concorrente e conflito em Task 2.
- **Preço/estoque alterados depois que o menu foi carregado:** recalcular no servidor e abortar sem efeitos parciais se indisponível; cobrir em Task 2.
- **Sessão sem `sessionStorage`, telefone inválido ou consentimento removido/adulterado no browser:** mostrar erro, bloquear envio e não perder o formulário; cobrir em Task 3.

---

### Task 1: Persistir tokens seguros nas mesas

**Files:**
- Create: `back-end/utils/mesaTokens.js`
- Modify: `back-end/models/MesasSettings.js`
- Modify: `back-end/routes/mesas.js`
- Test: `back-end/tests/integration/autoAtendimento.test.js`

**Interfaces:**
- Produces: `gerarTokenMesa(): string`, com 32 bytes aleatórios em base64url; `garantirTokensMesas(settings): Promise<MesasSettings>`, preservando tokens existentes e atribuindo token único às mesas sem token.
- O `GET /api/mesas` autenticado deve sempre retornar tokens das mesas; o `PUT /api/mesas` não aceita token fornecido pelo cliente e preserva o token existente quando a mesa mantém o mesmo `id`.

- [ ] **Step 1: Escrever testes de persistência e autorização**

Criar teste em `back-end/tests/integration/autoAtendimento.test.js` que confirme: GET autenticado sem configuração cria/persiste mesas padrão com tokens; cada token tem alta entropia/formato base64url e é único; GET repetido preserva os tokens; PUT de edição preserva tokens por `id`; PUT não aceita token forjado; chamada sem autenticação continua recusada.

- [ ] **Step 2: Executar os testes novos para confirmar falha**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Expected: FAIL nos casos de token ausente e geração/persistência ainda não implementadas.

- [ ] **Step 3: Implementar geração e persistência idempotente**

Adicionar `token` ao schema de mesa e um gerador com `crypto.randomBytes(32).toString('base64url')`. Garantir token em GET e PUT, salvar a configuração padrão quando ainda não existe, não sobrescrever tokens persistidos e gerar token novo para mesas novas, ignorando `token` recebido no body.

- [ ] **Step 4: Executar os testes para confirmar sucesso**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Expected: PASS nos testes de token e autorização.

- [ ] **Step 5: Commitar**

```bash
git add back-end/utils/mesaTokens.js back-end/models/MesasSettings.js back-end/routes/mesas.js back-end/tests/integration/autoAtendimento.test.js
git commit -m "feat: persistir tokens seguros por mesa"
```

### Task 2: Criar endpoints públicos e persistir pedido QR

**Files:**
- Create: `back-end/routes/autoAtendimento.js`
- Modify: `back-end/server.js`
- Modify: `back-end/models/Comanda.js`
- Test: `back-end/tests/integration/autoAtendimento.test.js`

**Interfaces:**
- Consumes: tokens persistidos da Task 1; helpers existentes `precoPorUnidade`, `calcularPrecoComDesconto`, `calcularPrecoGrupo` e `ajustarEstoque`.
- Produces:
  - `GET /api/pedidos/auto-atendimento/:mesaToken` → `{ mesa: { numero, nome }, produtos: [{ produtoId, nome, categoria, preco, unidadeVenda }] }`.
  - `POST /api/pedidos/auto-atendimento` com `{ mesaToken, clienteNome, clienteTelefone, consentimentoWhatsApp, itens: [{ produtoId, quantidade, observacao }] }` → confirmação segura `{ comandaId, numero, status, mesa }`.
  - Comanda com `origem: 'qr'`, `status: 'aberta'`, `statusPagamento: 'pendente'`, Cliente associado e consentimento `{ aceito: true, registradoEm }`.

- [ ] **Step 1: Escrever testes de contrato, validação e confiança no servidor**

No arquivo de integração, adicionar testes para: GET público de token válido lista somente produto de venda ativo e campos públicos; token inválido/inativo retorna 404; POST sem nome/telefone ou com telefone fora de 10 a 13 dígitos retorna 400; consentimento ausente/falso retorna 400; itens inválidos retornam 400; campos extras `mesa`, `preco` e `nomeProduto` são ignorados e não substituem banco/token; outras chaves não previstas retornam 400; confirmação não contém telefone nem dados privados.

- [ ] **Step 2: Executar os testes para confirmar falha**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Expected: FAIL porque endpoints ainda não existem.

- [ ] **Step 3: Implementar schema da comanda e endpoints públicos**

Adicionar campos opcionais `origem`, `consentimentoWhatsApp.aceito`, `consentimentoWhatsApp.registradoEm` e `observacao` por item, preservando documentos antigos. Reutilizar os campos `idempotencyKey` e `idempotencyHash` e o índice parcial existente em `Comanda`, usando um valor estável de `atendente` para limitar a chave ao fluxo QR. Montar a rota em `/api/pedidos`. Usar `express-rate-limit` (já instalado) para limitar POST público a 60 requisições por IP a cada 15 minutos. Validar nome (1–120 caracteres), telefone normalizado (10–13 dígitos), lista de 1–50 itens, quantidade inteira de 1–99 e observação de até 250 caracteres. Ignorar explicitamente `mesa`, `preco` e `nomeProduto` enviados como campos extras, e rejeitar outras chaves não previstas.

- [ ] **Step 4: Implementar transação de criação**

Usar o token para resolver a mesa ativa; ignorar valores de preço, nome de produto e mesa do body. Exigir header `Idempotency-Key` válido; calcular hash do payload normalizado, procurar a chave persistida e retornar a confirmação original em replay idêntico ou 409 em conteúdo divergente. Persistir a chave e o hash na comanda sob índice único parcial. Se duas transações concorrentes disputarem a mesma chave, abortar a perdedora e então consultar a comanda vencedora para aplicar a mesma regra de replay/conflito, sem repetir a baixa de estoque. Normalizar telefone; reutilizar Cliente existente sem sobrescrever seu nome cadastrado, ou criar Cliente com nome e telefone enviados. Montar itens com snapshots e preços do banco, aplicar `ajustarEstoque` e criar Cliente/comanda/baixa na mesma sessão MongoDB. Converter erros de validação/estoque em respostas 4xx seguras, sem telefone ou stack trace.

- [ ] **Step 5: Testar efeitos, privacidade, KDS e idempotência**

Adicionar assertions para: mesa vinculada ao token embora body envie outra; preço final de banco mesmo que body envie valor falso; Cliente reaproveitado pelo telefone preserva o nome existente; estoque decrementado uma vez; falha de estoque não cria Cliente/comanda parcial; consentimento registrado com timestamp server-side; duas requisições concorrentes com mesma chave criam uma comanda e baixam estoque uma vez; payload divergente com a mesma chave retorna 409; resposta pública não contém telefone.

- [ ] **Step 6: Executar testes de integração para confirmar sucesso**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Expected: PASS para endpoints públicos, transações, segurança e idempotência.

- [ ] **Step 7: Commitar**

```bash
git add back-end/routes/autoAtendimento.js back-end/server.js back-end/models/Comanda.js back-end/tests/integration/autoAtendimento.test.js
git commit -m "feat: criar pedidos públicos por QR"
```

### Task 3: Implementar formulário e cardápio público

**Files:**
- Create: `front-end/src/pages/CardapioAutoAtendimento.jsx`
- Create: `front-end/src/services/cardapioAutoAtendimento.js`
- Modify: `front-end/src/App.jsx`
- Test: `front-end/tests/e2e/cardapio_autoatendimento.cy.js`

**Interfaces:**
- Consumes: contratos públicos da Task 2.
- Produces: rota React pública `/cardapio/:mesaToken`; funções `carregarCardapio(mesaToken)` e `enviarPedidoAutoAtendimento(payload, idempotencyKey)` no serviço frontend.

- [ ] **Step 1: Escrever Cypress tests do fluxo público**

Criar testes interceptando apenas a API do cardápio. Verificar que rota abre sem login; nome e telefone são a primeira tela; nome/telefone inválidos bloqueiam avanço; dados temporários de uma sessão existente preenchem o formulário sem pular a primeira tela; cardápio permite quantidade/observação; checkbox é obrigatório; POST envia `consentimentoWhatsApp: true`, token, cliente e itens sem preço; confirmação limpa a sessão e não mostra telefone; falha mantém dados e carrinho.

- [ ] **Step 2: Executar Cypress para confirmar falha**

Run com o Vite disponível em `http://localhost:5173`: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: FAIL porque a rota/cardápio ainda não foram implementados.

- [ ] **Step 3: Implementar serviço público**

Criar funções `carregarCardapio(mesaToken)` e `enviarPedidoAutoAtendimento(payload, idempotencyKey)` para GET e POST. Enviar `Idempotency-Key` UUID no header. Guardar somente nome/telefone em `sessionStorage` sob chave específica do cardápio; normalizar dígitos para validação (10–13), aplicar máscara brasileira e tratar indisponibilidade de storage com mensagem visível.

- [ ] **Step 4: Implementar página pública e rota**

Adicionar rota fora de `PrivateRoute`, carregada sob demanda. Mostrar primeiro formulário de identificação, depois cardápio e resumo; observações limitadas; exigir o texto exato do checkbox; enviar somente os campos do contrato, sem preço/mesa. Em sucesso, limpar dados temporários e mostrar número/status sem telefone; em erro, exibir mensagem em português e manter dados para retry.

- [ ] **Step 5: Executar Cypress para confirmar sucesso**

Run com o Vite disponível em `http://localhost:5173`: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: PASS para acesso público, validação, consentimento, envio, erro e privacidade.

- [ ] **Step 6: Commitar**

```bash
git add front-end/src/pages/CardapioAutoAtendimento.jsx front-end/src/services/cardapioAutoAtendimento.js front-end/src/App.jsx front-end/tests/e2e/cardapio_autoatendimento.cy.js
git commit -m "feat: adicionar cardápio público de autoatendimento"
```

### Task 4: Gerar e exibir QR local por mesa

**Files:**
- Create: `front-end/src/components/mesas/MesaCardapioQr.jsx`
- Modify: `front-end/src/pages/MesasCadastro.jsx`
- Modify: `front-end/package.json`
- Modify: `front-end/package-lock.json`
- Test: `front-end/tests/e2e/cardapio_autoatendimento.cy.js`

**Interfaces:**
- Consumes: `mesa.token` persistido pela Task 1 e rota pública da Task 3.
- Produces: para mesa ativa, link `<window.location.origin>/cardapio/<token>`, QR PNG gerado localmente e ação para imprimir; nenhuma chamada externa de QR.

- [ ] **Step 1: Escrever teste de apresentação e persistência do QR**

Estender Cypress para confirmar link/QR de cada mesa ativa, ausência de link para mesa inativa, token preservado após salvar edição e impressão usa o link esperado sem enviar requisição a domínio externo.

- [ ] **Step 2: Executar Cypress para confirmar falha**

Run com o Vite disponível em `http://localhost:5173`: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: FAIL porque a tela ainda não mostra o QR.

- [ ] **Step 3: Adicionar dependência e componente de QR local**

Adicionar `qrcode` como dependência direta do frontend. O componente recebe mesa e origem, chama `QRCode.toDataURL(link)` e exibe `<img>` acessível, link e botão de impressão. Não usar endpoint/serviço remoto.

- [ ] **Step 4: Integrar ao cadastro de mesas**

Renderizar QR somente após confirmação de token persistido pelo backend, preservar nome/número/capacidade/status atuais e manter a ação de impressão limitada ao elemento/link daquela mesa.

- [ ] **Step 5: Executar Cypress para confirmar sucesso**

Run com o Vite disponível em `http://localhost:5173`: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: PASS para QR/link, mesas ativas e inativas e impressão.

- [ ] **Step 6: Commitar**

```bash
git add front-end/src/components/mesas/MesaCardapioQr.jsx front-end/src/pages/MesasCadastro.jsx front-end/package.json front-end/package-lock.json front-end/tests/e2e/cardapio_autoatendimento.cy.js
git commit -m "feat: gerar QR local para cardápio das mesas"
```

### Task 5: Atualizar PDV e destacar pedidos QR no KDS

**Files:**
- Modify: `front-end/src/pages/Comandas.jsx`
- Modify: `front-end/src/pages/Kitchen.jsx`
- Modify: `back-end/routes/comandas.js`
- Test: `back-end/tests/integration/autoAtendimento.test.js`
- Test: `front-end/tests/e2e/cardapio_autoatendimento.cy.js`

**Interfaces:**
- Consumes: comanda QR da Task 2 (`origem`, cliente, mesa, observação por item).
- Produces: polling de 15 segundos na lista do PDV; KDS apresenta todos os itens QR e rótulo `QR — <Nome> (Mesa <número>)`; outros pedidos preservam filtro `aFazer`.

- [ ] **Step 1: Escrever testes de visibilidade e filtro do KDS**

Adicionar integração backend com comanda QR contendo itens `aFazer: false` e comanda comum contendo item não-A-Fazer; a cozinha deve retornar todos os itens QR e somente itens permitidos das comandas comuns. Estender Cypress para validar os rótulos de origem e observações em KDS/PDV.

- [ ] **Step 2: Executar testes para confirmar falha**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Run: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: FAIL para filtro e indicação visual ainda ausentes.

- [ ] **Step 3: Ajustar consulta autenticada do KDS e renderização**

Manter comandas abertas. Para `origem === 'qr'`, retornar todos os itens; para as demais, manter `aFazer`. Mostrar `QR — Nome (Mesa X)` com destaque visual, quantidade e observação; não renderizar `clienteTelefone`.

- [ ] **Step 4: Atualizar lista de comandas do PDV**

Adicionar polling de 15 segundos com limpeza do timer. Cada atualização mantém a comanda selecionada se ainda existir e inclui novas comandas abertas sem perder estado de seleção. Identificar a origem QR no resumo da comanda.

- [ ] **Step 5: Executar testes para confirmar sucesso**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Run: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: PASS para KDS, polling e destaque; pedidos não-QR continuam no comportamento anterior.

- [ ] **Step 6: Commitar**

```bash
git add back-end/routes/comandas.js back-end/tests/integration/autoAtendimento.test.js front-end/src/pages/Comandas.jsx front-end/src/pages/Kitchen.jsx front-end/tests/e2e/cardapio_autoatendimento.cy.js
git commit -m "feat: destacar pedidos QR no PDV e KDS"
```

### Task 6: Executar verificação integrada e cenários de aceitação

**Files:**
- Verify: `back-end/tests/integration/autoAtendimento.test.js`
- Verify: `front-end/tests/e2e/cardapio_autoatendimento.cy.js`
- Verify: `docs/superpowers/specs/2026-10-22-cardapio-autoatendimento-design.md`

- [ ] **Step 1: Executar testes backend focados**

Run: `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js`
Expected: todos os testes do autoatendimento passam.

- [ ] **Step 2: Executar testes frontend E2E focados**

Run com o Vite disponível em `http://localhost:5173`: `npm --prefix front-end run test:frontend -- --spec tests/e2e/cardapio_autoatendimento.cy.js`
Expected: todos os casos de formulário, pedido, QR e exibição passam.

- [ ] **Step 3: Executar testes unitários e build**

Run: `npm --prefix back-end run test:unit`
Expected: testes unitários do backend passam.

- [ ] **Step 4: Executar testes unitários do frontend**

Run: `npm --prefix front-end run test:unit`
Expected: testes unitários do frontend passam.

- [ ] **Step 5: Executar build do frontend**

Run: `npm --prefix front-end run build`
Expected: build conclui. Estado conhecido antes da implementação: `front-end/src/styles/theme.css` contém `PLACEHOLDER`, que faz o build falhar no Lightning CSS, e o lint reporta problemas preexistentes em `TrocoAuxiliar.jsx` e `api.jsx`. Não alterar esses problemas fora de escopo sem solicitar; reportar se ainda bloquearem validação.

- [ ] **Step 6: Validar os três cenários de segurança em ambiente de teste**

Usar `curl.exe` ou Supertest contra banco isolado:
1. POST sem nome/telefone → HTTP 400.
2. POST com mesa adulterada no body → comanda vinculada à mesa do token.
3. POST com preço adulterado → valor calculado com preço do banco.
Expected: nenhum teste usa produção; respostas não contêm telefone.

- [ ] **Step 7: Revisar worktree e completar verificação**

Run: `git diff --check; git status --short --branch`
Expected: nenhum erro de whitespace; listar apenas alterações da feature e documentação. Não realizar deploy nesta tarefa.
