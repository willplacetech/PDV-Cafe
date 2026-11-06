# Auditoria e roadmap de segurança — branch `Generico`

**Data:** 2026-11-05
**Branch/HEAD:** `Generico` / `1e3f069` (rechecagem local não commitada)
**Escopo:** revalidação local de evidências e planejamento; nenhum deploy ou alteração operacional remota foi realizado.

## Limite da verificação

A auditoria anterior deixou apenas a classificação agregada (1 atendido, 24 parciais, 13 sem evidência suficiente e 2 não aplicáveis), sem os textos e status individuais. A captura reenviada nesta solicitação fornece os 40 enunciados; a matriz atualizada ao final registra uma nova revisão no HEAD indicado, sem presumir que os status atuais sejam os status históricos.

O plano [2026-10-06-seguranca-integridade.md](./superpowers/plans/2026-10-06-seguranca-integridade.md) é uma referência distinta: contém 33 tarefas técnicas. Seus checkboxes registram 9 concluídas e 24 abertas; esses estados históricos não são uma verificação individual dos 40 controles. Este documento separa as evidências atuais do que ainda depende da lista original ou de acesso operacional.

## Resultado executivo

- **Dependências de produção:** `npm --prefix back-end audit --omit=dev` e `npm --prefix front-end audit --omit=dev` — 0 vulnerabilidades em cada pacote.
- **Dependências completas:** backend — 19 alertas (3 low, 16 moderate); frontend — 9 alertas (2 low, 7 moderate). Os alertas reportados estão em dependências de desenvolvimento. O `npm audit fix --force` propõe downgrades incompatíveis (Jest 25, `vite-plugin-pwa` 1.1 e ESLint 9); não foi aplicado.
- **Baseline frontend inicial:** build passou; 105/112 testes unitários passaram e o lint reportou 44 erros.
- **Fase 0 frontend (rechecagem em 2026-11-06):** `npm run test:unit` — 116/116 testes passaram; `npm run lint` — passou sem erros; `npm run build` — passou.
- **Baseline backend inicial:** a primeira execução de integração registrou 20/41 suítes e 161/414 testes com falha; 253 passaram. Na rechecagem de 2026-11-06, `npm run test:unit` — 110/110 passaram — e `npm run test:integration` — 41/41 suítes e 419/419 passaram.
- **Segurança operacional:** configuração real do Render, TLS, backups/restauração, retenção de dados e ingestão do Sentry não podem ser comprovados somente pelo checkout.
- **Revisão dos 40 requisitos:** 1 atendido, 19 parciais, 1 pendente, 2 não aplicáveis e 17 não verificáveis; foi identificado um achado acionável HIGH de isolamento por tenant em consultas públicas.

## Evidências atuais e lacunas

| Área | Evidência verificada | Situação / próximo passo |
|---|---|---|
| Dependências runtime | Os dois `npm audit --omit=dev` retornaram zero vulnerabilidades. | Atendido para os lockfiles locais nesta data; repetir em CI/deploy. |
| Dependências de desenvolvimento | Auditorias completas retornaram 19 alertas backend e 9 frontend, todos low/moderate conforme a saída do npm. | Pendente: atualizar dependências com mudanças compatíveis e validar a cadeia de build/testes; não usar `--force` sem revisão. |
| Sessão/autenticação | Há cookies HttpOnly, `Secure` em produção, política SameSite, validação de `TRUST_PROXY_HOPS` e geração/validação da chave JWT. | Evidência local parcial; conferir domínios, TLS e variáveis no ambiente real. |
| Headers e limites | Express usa Helmet; há limites para login, QR, delivery público e criação pública de pedidos/reservas. O `render.yaml` não declara headers de segurança para o site estático. Os limites padrão são locais à instância. | Pendente: configurar headers no frontend estático; assegurar cobertura das rotas públicas e usar store compartilhado antes de escalar horizontalmente. |
| Logs e erros | O middleware de erro registra `err.message` e `err.stack`; erros de cliente também registram mensagem. A resposta também repassa `err.message` para status abaixo de 500 e 503. | Pendente: sanitizar/redigir mensagens e dados sensíveis nos logs e usar allowlist de mensagens públicas; manter detalhes técnicos apenas em canal restrito. |
| CI da branch | `.github/workflows/testes.yml` atualizado localmente para disparar em push para `Generico`, PR direcionado a `Generico` e execução manual (`workflow_dispatch`). | A execução remota ainda não foi feita: o workflow permanece apenas no worktree local. A execução Cypress local de 2026-11-06 registrou 106/155 testes aprovados, 47 falhos e 2 ignorados, em 13 de 28 specs; publicar o workflow continua necessário para obter evidência da CI. |
| Qualidade da aplicação | Frontend: 116/116 testes unitários, lint e build passaram na rechecagem anterior; backend: 110/110 testes unitários, 419/419 testes de integração e cobertura passaram. Cypress completo em 2026-11-06: 28 specs, 106 passaram, 47 falharam e 2 foram ignorados; 13 specs ainda apresentam falhas. `vendas_offline.cy.js` passou 3/3 e `ui_loading.cy.js` 3/3 na suíte; `deliverylink.cy.js` passou 14/14. Também se confirmou o desencontro entre props/valores das abas do Dashboard e os estados renderizados pela página. | Os baselines unitário/backend permanecem verdes; os testes E2E ainda bloqueiam a CI. Reconciliar navegação e conteúdo esperado do Dashboard antes de adaptar testes; corrigir falhas demonstradas sem enfraquecer asserções e publicar o workflow somente após obter uma execução local estável. |
| Segredos | Busca textual no código encontrou placeholders e valores de teste, incluindo a constante legada usada para rejeição; não encontrou credencial de produção evidente. | Evidência limitada: a busca não substitui scanner de segredos nem análise do histórico Git; executar ambos antes de liberar. |
| Privacidade/retenção | Não foi localizada política publicada de privacidade/retenção no código ou documentação consultada. Há menções a validação jurídica antes de produção. | Pendente de responsável jurídico/privacidade: definir finalidade, base legal, retenção, descarte e atendimento a solicitações. |
| Backup/restauração | O runbook manda o operador confirmar backup recuperável; não há evidência de exercício de restauração nesta auditoria. | Pendente externo: executar restauração em ambiente descartável, registrar data, escopo, duração e resultado. |
| Produção/infraestrutura | `render.yaml` documenta variáveis e proxy, mas não prova configuração efetiva do painel, Atlas, DNS/TLS ou Sentry. | Pendente de evidência do operador; não declarar controles externos atendidos com base apenas no YAML. |

## Roadmap priorizado

As prioridades são uma ordem de execução sugerida, não uma classificação dos 40 controles ausentes.

### Fase 0 — Restabelecer baseline verificável

1. **Frontend concluído nesta rechecagem:** os testes desatualizados foram alinhados aos contratos atuais sem enfraquecer suas asserções; corrigidos escapes HTML em relatórios/impressão. A regressão de rota lazy em `Comandas.jsx` foi corrigida restaurando a implementação íntegra anterior à remoção acidental do arquivo, com teste explícito do export default.
2. **Lint frontend concluído nesta rechecagem:** corrigido o formatador ausente na auditoria, removidos imports órfãos e substituídos catches silenciosos por avisos explícitos. O lint agora termina sem erros.
3. **Integração backend concluída localmente em 2026-11-06:** fixtures das suítes afetadas foram associados a tenants válidos, sem alterar o middleware de isolamento nem reduzir asserções. Reexecução completa: 41/41 suítes e 419/419 testes passaram.
4. **Workflow habilitado localmente para `Generico`:** `.github/workflows/testes.yml` agora inclui `Generico` em `push` e `pull_request`, além de `workflow_dispatch`. Os jobs backend, cobertura, lint, testes unitários e build passaram localmente. A execução Cypress local falhou (ver resultados abaixo); publicar o workflow e executar a CI remota permanece pendente.

**Verificação local:** frontend — `npm run lint` — passou; `npm run test:unit` — 116/116 passaram; `npm run build` — passou; `npm run test:frontend` (em `front-end/`, Cypress 16.1.0, Electron headless) — 28 specs, 106/155 testes passaram, 47 falharam e 2 foram ignorados; 13 specs falharam. `vendas_offline.cy.js` passou 3/3 e `ui_loading.cy.js` 3/3 na suíte completa; `deliverylink.cy.js` passou 14/14 em execução direcionada anterior. Backend (em `back-end/`) — `npm test` — 110/110 testes unitários e 41/41 suítes/419/419 testes de integração passaram; `npm run test:coverage` — passou (73,21% statements, 57,03% branches, 78,43% functions, 77,02% lines). A CI remota não foi disparada porque os arquivos permanecem locais e não commitados/publicados.

**Aceite da Fase 0:** parcial. Os testes unitários, integração, cobertura, lint e build estão verdes localmente; 13 specs Cypress ainda falham. O botão mensal “Imprimir relatório” está disponível e seu cenário passou em `ui_loading.cy.js`; permanece pendente corrigir as falhas E2E restantes sem enfraquecer as asserções. A CI remota de `Generico` precisa ser executada após publicar as alterações antes de considerar a branch pronta para implantação.

### Fase 1 — Fechar lacunas de proteção diretamente observadas

1. **S8 / logs:** remover dados brutos de erro/stack dos logs gerais; definir campos permitidos, redação de PII/segredos e retenção; testar mensagens de erro e eventos enviados ao Sentry.
2. **S7 / frontend e API pública:** declarar headers de segurança apropriados para o static site; inventariar rotas públicas e aplicar limites por operação. Usar store compartilhado quando houver mais de uma instância; manter limites e chaves configuráveis por ambiente.
3. **S2 / segredos e CI:** verificar `.env` ignorados, executar scanner de segredos no estado atual e histórico, e confirmar isolamento das credenciais/fixtures E2E.
4. **S5 / entradas:** revisar validação e limites para dados de rotas públicas, filtros, regex, números e paginação; acrescentar testes para valores inválidos e operadores inesperados.
5. **Privacidade:** publicar política e tabela de retenção aprovadas pelo responsável; mapear dados pessoais coletados, logs, backups e solicitações de titulares.

**Aceite:** testes de regressão e evidências de configuração; nenhuma rota pública sem política explícita de validação/limite; revisão de logs sem segredos ou PII desnecessária.

### Fase 2 — Concluir integridade financeira, multiusuário e operação offline

Usar a ordem e as interfaces compartilhadas do plano de 33 tarefas, sem presumir que correspondem aos 40 controles:

1. **S4, P8, P9 e P18:** sessão/dados locais, propriedade da fila offline, tratamento de conflitos e divergência de preço; preservar as dependências entre fila e identidade do usuário.
2. **P5, P10, P17 e M3:** outbox/cancelamento Delivery, atualização após despacho, inicialização isolada e observabilidade; sequenciar os eventos e workers conforme o plano.
3. **P11–P16:** descontos/recebimentos, idempotência de compras, custo ponderado, numeração atômica, trilha de auditoria e recuperação da fila de custos; validar transações e repetição concorrente.
4. **M1, M2, M4, M5 e M7:** precisão monetária, reconciliação fiscal, acessibilidade, atualização PWA e limites de isolamento multiempresa.

**Aceite:** testes de concorrência, idempotência, retry e falha parcial; nenhuma mutação duplicada ou cruzamento entre usuários/tenants; reconciliação fiscal sem reemissão automática.

### Fase 3 — Validar operação fora do código

1. Confirmar TLS/domínios e headers no serviço efetivo do Render.
2. Conferir privilégios mínimos e transações do MongoDB; provar restauração em ambiente descartável.
3. Validar presença/escopo das variáveis secretas e configuração do Sentry, verificando evento sanitizado sem dados privados.
4. Registrar limites de acesso e retenção de logs/backups, responsável pela resposta a incidentes e procedimento de rollback.

**Aceite:** evidências datadas do ambiente real, responsáveis identificados e exercício de restauração/rollback documentado. Sem essa evidência, classificar os controles externos como “não verificados”.

## Estado do backlog técnico conhecido

O plano de 33 tarefas registra como concluídas: **S1, S3, S6, P1, P2, P3, P4, P6 e P7**. Registra como abertas: **S2, S4, S5, S7, S8, P5, P8–P18 e M1–M7**. O plano deve ser atualizado somente após validar cada critério de aceite no HEAD atual. O limite/estado de rate limiting já avançou desde essa anotação, mas S7 continua incompleto pelas lacunas de headers e store compartilhado descritas acima.

## Pendências para fechar os controles externos

As evidências operacionais e documentais que não constam no checkout ainda precisam ser fornecidas/confirmadas pelos responsáveis externos. Os status individuais atuais, textos, evidências locais e próximas ações estão na matriz abaixo. Não converter automaticamente tarefas S/P/M em controles do checklist.

## Anexo — revisão ponto a ponto dos 40 requisitos

**Revisão:** somente leitura da branch `Generico`, HEAD `1fd05e93c71102fbe8d08662970579709e0ca1bd`. A captura enviada nesta conversa contém os 40 requisitos. Status locais não certificam configuração de produção, documentos externos ou conformidade jurídica. Caminhos de arquivo são relativos à raiz do repositório.

| # | Requisito | Status | Evidência local | Lacuna / próxima ação |
|---:|---|---|---|---|
| 1 | Autenticação segura | Parcial | `back-end/routes/auth.js:28-45`; `back-end/utils/authSessions.js:13-28,45-53` | Login, sessão e renovação existem; não há MFA nem evidência da configuração real de produção. Avaliar proteção adicional para contas privilegiadas e comprovar configuração do ambiente. |
| 2 | Controle de acesso | Parcial | `back-end/server.js:52-55`; `back-end/middleware/auth.js:50-73`; `back-end/middleware/exigirTenant.js:5-23` | Rotas privadas verificam sessão/papel/tenant; fluxos públicos têm consultas sem escopo (achado de segurança abaixo). Corrigir e testar isolamento entre tenants. |
| 3 | Criptografia de dados | Parcial | `back-end/models/User.js:46-59`; `back-end/utils/authSessions.js:13` | Senhas e tokens de refresh são protegidos por hash; não há evidência da criptografia dos demais dados armazenados. Confirmar criptografia em repouso e no cliente offline. |
| 4 | HTTPS / TLS | Não verificável | `back-end/utils/authSessions.js:17`; `render.yaml:1-48` | Cookie Secure em produção não comprova TLS, domínio ou certificado ativos. Verificar no serviço efetivo. |
| 5 | Hashing de senhas | Atendido | `back-end/models/User.js:46-59`; `back-end/utils/passwordPolicy.js:1-4` | Bcrypt com salt e política mínima de senha nova identificados; manter testes e política. |
| 6 | SQL injection | Não aplicável | `back-end/db.js:1-20` | Aplicação usa MongoDB/Mongoose, não SQL. Isso não dispensa validação de consultas NoSQL nem escopo por tenant. |
| 7 | XSS / CSRF | Parcial | `back-end/server.js:21-24`; `back-end/utils/sessionOrigins.js:36-44`; `front-end/src/utils/imprimirEntrega.js:1-23`; `render.yaml:31-48` | Helmet, proteção para operações com cookies e escape na impressão existem; não foram encontrados headers de segurança para o static site no Blueprint. Configurar e validar. |
| 8 | Rate limiting | Parcial | `back-end/server.js:27`; `back-end/routes/deliveryPublico.js:9-15`; `back-end/routes/reservas.js:12-19,75,97`; `back-end/routes/autoAtendimento.js:19-27,241,270` | Há limites em login e em algumas criações públicas; catálogo e check-in não têm limite próprio. Inventariar rotas e planejar store compartilhado para múltiplas instâncias. |
| 9 | Proteção de APIs | Parcial | `back-end/server.js:21,52-55`; `back-end/routes/deliveryPublico.js:20-25` | CORS/autenticação protegem rotas privadas, mas catálogo público não restringe dados por tenant. Corrigir e cobrir APIs públicas com testes. |
| 10 | Auditoria de dependências | Parcial | `.github/dependabot.yml:1-18`; `.github/workflows/npmscan.yml:1-15`; `.github/workflows/testes.yml:3-7` | Há automações declaradas, mas cobertura dos manifests/lockfiles de backend e frontend não está demonstrada nos workflows citados. Incluir e exigir resultados na branch. |
| 11 | Política de privacidade | Não verificável | Nenhuma política foi localizada no inventário local de `docs/` | Pode existir fora do checkout. Fornecer a versão publicada e verificar correspondência com as práticas do produto. |
| 12 | Bases legais | Não verificável | `docs/superpowers/specs/2026-10-22-cardapio-autoatendimento-design.md:74-76` pede validação jurídica do consentimento | Não há mapeamento local de bases legais por finalidade. Documentar avaliação aprovada pelo responsável competente. |
| 13 | Minimização de dados | Parcial | `back-end/instrument.js:3-24`; `back-end/routes/deliveryPublico.js:30-33` | Sentry remove mensagens; delivery coleta nome, telefone e endereço. Mapear campos por fluxo, justificar necessidade e revisar armazenamento offline/logs. |
| 14 | Finalidades documentadas | Parcial | `docs/superpowers/specs/2026-10-22-cardapio-autoatendimento-design.md:9-18,74-76` | Há finalidade específica descrita para pedidos/WhatsApp, mas não inventário geral de finalidades e dados. Documentar por fluxo. |
| 15 | Gerenciamento de consentimento | Parcial | `back-end/models/Comanda.js:21,26`; `back-end/routes/autoAtendimento.js:137-145,331-340`; spec `:76` | Aceite é registrado por pedido, mas obrigatório para concluir pedido e há validação jurídica pendente. Avaliar liberdade, informação, retirada e registro de alterações. |
| 16 | Política de cookies | Não verificável | `back-end/utils/authSessions.js:17`; `docs/secure-session.md:7-9` | Há cookies de sessão e documentação técnica; não foi localizada política ao usuário no checkout. Verificar publicação e adequação. |
| 17 | Direitos dos titulares | Não verificável | Nenhum procedimento foi localizado no inventário de `docs/` | Fornecer procedimento, canal, responsáveis e evidência de atendimento. |
| 18 | Exclusão de dados | Parcial | `back-end/routes/customers.js:212`; `back-end/routes/auth.js:122-130` | Existem exclusões operacionais; não foi encontrado processo de eliminação/anonimização em vendas, logs e backups. Definir fluxo e exceções legais. |
| 19 | Retenção de dados | Não verificável | `RUNBOOK.md:16` menciona verificação humana de backup; não foi localizada política de retenção | Definir prazos por tipo de dado e comprovar expurgo. |
| 20 | Contratos com operadores | Não verificável | Nenhum contrato foi localizado no checkout | Disponibilizar inventário de operadores e contratos vigentes para validação externa. |
| 21 | Termos de uso | Não verificável | Nenhum termo foi localizado no inventário local de `docs/` | Fornecer versão vigente publicada e verificar disponibilidade no produto. |
| 22 | Transparência de preços | Parcial | `front-end/src/pages/CardapioAutoAtendimento.jsx:285`; `back-end/routes/deliveryPublico.js:22-25,46-48` | Itens e valores são mostrados/calculados; não há evidência local de preço do serviço/plano comercial. Documentar preços e condições aplicáveis. |
| 23 | Cobranças transparentes | Parcial | `back-end/routes/deliveryPublico.js:46-53` | Pedido calcula total e taxa de entrega; não foram localizados termos de cobrança, pagamento, taxas adicionais ou cancelamento. Exibir condições antes da confirmação. |
| 24 | Cancelamento de assinaturas | Não verificável | Nenhum fluxo de assinatura/cancelamento foi localizado no código consultado | Confirmar modelo de oferta; se houver assinatura comercial, documentar o cancelamento. |
| 25 | Política de reembolso | Não verificável | Nenhuma política foi localizada no checkout | Fornecer política vigente e verificar comunicação ao consumidor. |
| 26 | Identificação do fornecedor | Não verificável | `WHITE_LABEL.md` descreve branding configurável, não identificação legal | Comprovar identidade e contatos exibidos ao usuário. |
| 27 | Publicidade transparente | Não verificável | Não foi encontrado conteúdo publicitário no checkout local; canais externos não foram consultados | Validar campanhas e divulgações nos canais utilizados. |
| 28 | Depoimentos autênticos | Não verificável | Nenhum depoimento foi localizado no checkout; canais externos não foram consultados | Se houver depoimentos externos, comprovar origem, autorização e autenticidade. |
| 29 | Licenças de uso | Pendente | Não foi encontrado `LICENSE`, `LICENCE` ou `COPYING` na raiz; `package.json:1` marca pacote privado | Definir a licença aplicável e documentar os termos para usuários e distribuidores. |
| 30 | Transparência sobre IA | Não aplicável | Nenhuma funcionalidade/dependência de IA foi identificada no código local consultado | Reavaliar se integrações de IA forem adicionadas. |
| 31 | Backups automatizados | Não verificável | `RUNBOOK.md:16` orienta conferência humana de backup recuperável | Código não comprova automação, execução ou teste de restauração. Obter evidência operacional e executar restauração de teste. |
| 32 | Logs seguros | Parcial | `back-end/middleware/errorHandler.js:20-39`; `back-end/instrument.js:3-24` | Sentry usa sanitização, mas middleware registra `err.message` e `err.stack`. Redigir logs, restringir acesso e testar dados sensíveis. |
| 33 | Monitoramento de ameaças | Parcial | `back-end/instrument.js:23-24`; `render.yaml:34-39` | Captura Sentry depende de configuração; não há prova de ingestão nem detecção de ameaças ativa. Verificar configuração, alertas, responsáveis e teste. |
| 34 | Resposta a incidentes | Parcial | `RUNBOOK.md:120-128` | Há triagem básica e rollback; não foi encontrado plano completo de papéis, escalonamento, contenção e exercícios. Completar e testar. |
| 35 | Notificação de incidentes | Não verificável | Nenhum procedimento foi localizado no checkout | Definir responsáveis, critérios, prazos e comprovar o fluxo de comunicação. |
| 36 | Testes de segurança | Parcial | `back-end/test/securityRegression.test.js`; `back-end/tests/integration/authSessions.test.js`; `.github/workflows/testes.yml:3-7` | Há testes de regressão; o workflow não inclui `Generico` nos gatilhos exibidos. Habilitar e exigir testes na branch, incluindo isolamento entre tenants. |
| 37 | Revisão de código | Não verificável | `.github/CODEOWNERS:1` | CODEOWNERS não comprova aprovação obrigatória, proteção da branch ou revisão deste commit. Verificar regras ativas e evidências do PR. |
| 38 | Privilégios administrativos | Parcial | `back-end/routes/auth.js:54,75,94,122`; `back-end/middleware/exigirAutorizacao.js:57-76` | Rotas administrativas têm restrição por papel/autorização adicional; RBAC de infraestrutura e banco não é comprovável localmente. Revisar privilégios externos. |
| 39 | Gestão de vulnerabilidades | Parcial | `.github/dependabot.yml:1-18`; `.github/workflows/supply-chain-watch.yml:1-42`; `.github/workflows/npmscan.yml:1-15` | Há automações declaradas; execução e cobertura dos lockfiles de backend/frontend não estão demonstradas. Incluir lockfiles e registrar triagem/resolução de alertas. |
| 40 | Auditoria de conformidade | Não verificável | Nenhum relatório de auditoria/certificação foi localizado no checkout | Fornecer escopo, norma, data, resultado e plano de remediação da auditoria externa, se existir. |

**Contagem desta revisão:** 1 Atendido, 19 Parciais, 1 Pendente, 2 Não aplicáveis e 17 Não verificáveis.

### Achado acionável

**HIGH — controle de acesso por tenant em catálogos/consultas públicas (confiança 9/10).** As rotas públicas consultam `Product` sem selecionar nem filtrar pelo tenant; o escopo automático só restringe quando há tenant ativo. Isso pode expor produtos e preços de um comércio a outro.

Evidências: `back-end/routes/deliveryPublico.js:20-25,38-44`; `back-end/routes/autoAtendimento.js:220-223,248-255,303-311`; `back-end/utils/tenantSchema.js:59-65,103-106`; montagem pública em `back-end/server.js:52-55`.

**Correção implementada localmente:** Delivery resolve o tenant ativo integrado no servidor e restringe catálogo e pedidos a ele. O QR resolve o tenant pela configuração persistida da mesa, aplica o contexto tenant-scoped a catálogo, cotação, pedido e estoque, e não aceita `tenantId` do cliente. QR legado sem vínculo é associado atomicamente quando há exatamente um tenant ativo; configurações ambíguas falham fechadas. A resolução e os fluxos públicos têm cobertura de integração para isolamento entre tenants, recusa de produtos alheios e compatibilidade legada.

**Verificação da correção:** `npm --prefix back-end run test:integration -- --runTestsByPath tests/integration/autoAtendimento.test.js tests/integration/publicRateLimit.test.js tests/integration/deliveryRoutes.test.js tests/integration/tenantSales.test.js tests/integration/tenantMigration.test.js` — 5 suítes e 85 testes passaram. Na rechecagem de 2026-11-06, `npm run test:unit` — 110/110 passaram — e `npm run test:integration` — 41/41 suítes e 419/419 passaram (ambos executados em `back-end/`). As falhas da execução intermediária foram corrigidas nos fixtures, preservando o middleware de isolamento por tenant. Isso valida o código local, mas não representa deploy nem evidência de configuração em produção.

### Rechecagem da branch `feature/pwa-offline-sincronizacao`

Uma revisão estática somente leitura da referência `179197f3f9278a830e1e7aefde78e5da18d18e42` não encontrou o mesmo problema. O endpoint público `/rastreio/:token` (`back-end/routes/delivery.js:437-440`) expõe acompanhamento do pedido, não catálogo ou estoque. Criação de pedidos Delivery exige `tenantAuth` ou `integrationAuth` (`back-end/routes/delivery.js:125-128,247-259`), e não foi localizada rota pública de catálogo/cotação/pedido QR nessa branch. A conclusão limita-se ao código verificado nessa referência; não equivale a uma auditoria integral nem comprova configuração de produção.
