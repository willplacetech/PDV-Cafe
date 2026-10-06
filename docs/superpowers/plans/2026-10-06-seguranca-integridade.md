# Correções de segurança e integridade — plano de implementação

Atualização solicitada: preparar render.yaml para serviços de teste na branch offline, database TesteOffDelivery e provisionamento de administradores PDV/Delivery. Segredos serão configurados no Render; nenhum acesso ao banco remoto ou deploy nesta execução.

Blueprint concluído localmente: serviços novos separados, ADMIN_USERNAME=admin, senhas via sync:false, MONGO_DB_NAME=TesteOffDelivery validado no backend. Quatro testes de databaseOptions e revisão do diff passaram. Aceitação do Render e permissões MongoDB dependem do deploy de teste do usuário.

> Executar com subagent-driven-development: um implementador diferente por item, revisão da entrega e validação conjunta.

**Objetivo:** corrigir os problemas confirmados na auditoria do commit 8f053bc e implementar as melhorias locais de produção autorizadas pelo usuário.
**Arquitetura:** manter Express/Mongoose e React/PWA. Identificadores de operações, registros financeiros preservados, sincronização durável e estados explícitos de conflito. Não criar outro banco/backend.
**Spec:** auditoria solicitada pelo usuário nesta conversa, reproduções e lista de achados registrada abaixo.

## Restrições globais

- Trabalhar na feature/pwa-offline-sincronizacao; Compras deve continuar em 3d284d818b150afd89b4ff2874ff6dc9dcbd6f0a.
- Sem deploy, push, acesso a dados reais, rotação de segredos reais ou migração destrutiva.
- Preservar APIs quando possível, testar mudanças financeiras e de segurança com MongoDB descartável.
- Máximo de três implementadores simultâneos. Arquivos com múltiplos proprietários devem ser editados sequencialmente.
- Um agente diferente por ponto. Estados e evidências devem ser registrados neste plano para recuperação após compaction.
- Infraestrutura externa será preparada/documentada; não declarar TLS, backup, MFA ou monitoramento remoto ativos sem verificação real.

## Tarefas e critérios de aceite

- [x] S1 Revogação JWT: usuário atual, ativo/version, logout e administração operáveis; provas de revogação e compatibilidade Delivery.
- [ ] S2 Credenciais/testes: retirar senhas literais reais suspeitas; E2E com backend/banco isolados e trava contra produção; CI branch correta.
- [x] S3 Política senhas/chave: validar limites bcrypt e força; chave JWT segura no ambiente; preservar hashes existentes.
- [ ] S4 Sessões/dados locais: tokens de acesso em memória, renovação segura, proteção CSRF se cookies; minimizar dados e documentar terminal offline.
- [ ] S5 Inputs: whitelists de filtros, regex literal limitada, números finitos e paginação; testes de operadores e valores inválidos.
- [x] S6 Dependências: atualizar versões vulneráveis compatíveis, auditoria separando produção/dev e regressões. Restam 19 alertas moderados no ferramental Jest sem patch compatível disponível; produção sem alertas conhecidos nesta verificação.
- [ ] S7 Proxy/headers/rate limit: confiança explícita configurável, headers frontend, limites seguros e configuração compartilhada quando aplicável.
- [ ] S8 Logs/erros: mascarar tokens/PII, erros públicos padronizados e correlação.
- [x] P1 Pagamentos idempotentes: chave de operação obrigatória/compatibilidade segura de clientes, hash, índices e resultado repetido.
- [x] P2 Transferência de pedido: transação e preservação financeira; bloquear destinos incompatíveis.
- [x] P3 Cancelamento financeiro: recebimentos permanecem; bloqueio explícito com recebimentos e fiscal autorizado/processando. Estornos continuam exigindo regularização própria, sem estorno automático.
- [x] P4 Caixa concorrente: CAS status/versão, fechamento consistente e abertura sem duplicidade.
- [ ] P5 Cancelamento Delivery: evento durável, processamento idempotente e bloqueio de despacho de venda cancelada.
- [x] P6 Logout offline: remover apenas sessão, preservar vendas/catalogo e revogar acesso no servidor best-effort.
- [x] P7 Fila transacional: IndexedDB, migração sem perdas e concorrência entre abas.
- [ ] P8 Proprietário offline: identidade imutável e validação servidor, sem reenviar por outro usuário/comércio.
- [ ] P9 Conflitos offline: erros transitórios vs permanentes/autenticação, fila continua e resolução operável.
- [ ] P10 Atualizações Delivery: versões de venda, atualização pendente e proteção após despacho.
- [ ] P11 Desconto recebido: total final não inferior ao recebido, incluindo uso interno; estorno explícito.
- [ ] P12 Compra idempotente: operação única/hash na transação e cliente preservando chave.
- [ ] P13 Custo ponderado: consumir custo persistido com unidade e fallback legado correto.
- [ ] P14 Numeração: contador atômico e retry de conflitos transitórios com idempotência.
- [ ] P15 Auditoria: autor/referência/operação em estoque e pagamentos, campos não forjáveis.
- [ ] P16 Fila de custo durável: jobs persistidos, retries, lease e recuperação.
- [ ] P17 Startup Delivery isolado: falhas opcionais não impedem PDV; rotas Delivery retornam indisponível.
- [ ] P18 Preço offline: comparação com versão/cotação e resolução de divergências; servidor continua autoridade do preço.
- [ ] M1 Dinheiro/domínio: centralizar arredondamento/validação e preservar precisão de custo/peso; testes de borda.
- [ ] M2 Reconciliação fiscal: consultar/reconciliar emissão incerta sem reemitir automaticamente.
- [ ] M3 Observabilidade: health/readiness, métricas seguras e estado de filas; alertas/configuração documentados.
- [ ] M4 Acessibilidade: diálogos com foco/Escape/semântica e feedback consistente.
- [ ] M5 Atualização PWA: atualização controlada protege atendimento/pendências.
- [ ] M6 Operação/backup: validação ambiente/replica set, scripts de backup/restauração com proteção de destino, runbook e exercício descartável.
- [ ] M7 Multiempresa: delimitar PDV single-commerce vs Delivery multi-tenant; impedir vinculação insegura de múltiplos comércios sem isolamento.
- [ ] Revisão final e testes conjuntos backend/frontend/E2E/build/audit.

## Interfaces compartilhadas e rulings

| Tarefas | Arquivos/interface comum | Decisão |
|---|---|---|
| S1/S3/S4 | User, auth e claims | Sequencial; version0 aceita somente usuário existente; renovação consome tokenVersion. |
| P6/P7/P8/P9/P18/S4 | sessão, fila e PDV | P6 primeiro; P7 estabelece armazenamento; depois proprietário/conflitos/preço; S4 integra acesso em memória. |
| P1/P2/P3/P11/P14/P15 | comandas/orders/pagamento | Um editor por vez; registro operação e ator compartilhados, sem reescrever saldo arbitrariamente. |
| P5/P10/P17/M3 | eventos Delivery/worker/readiness | Sequencial; evento persistido na transação da venda e worker idempotente. |
| P12/P13/P16 | compras/custo/worker | Não alterar método escolhido; job de custo segue compra confirmada. |
| S2/S6/S7/M6 | manifests/lockfiles/CI/env | Sem npm install concorrente; configurar testes locais explicitamente. |
| M2/P3 | estado fiscal/cancelamento | Não cancelar documento fiscal autorizado localmente; reconciliação sem reemissão. |
| Todos | compatibilidade e testes | Cada agente testa seu arquivo; coordenador executa regressões completas após integração. |

Cada tarefa é autoconsistente: reproduzir o problema, implementar a menor correção completa, provar critério de aceite e apresentar os arquivos alterados. Melhorias externas sem credenciais serão entregues como configuração/runbook verificáveis, não ativadas remotamente.

## Registro de execução

- Base: 8f053bc469ecb4382a0dcebdd729f44cbce4b954, workspace inicialmente limpo.
- Ruling: executar no checkout feature solicitado pelo usuário, com arquivos exclusivos por agente; não criar nova branch ou tocar Compras.
- Em execução: S1 (s1_revogacao), P4 (p4_caixa_concorrente), P6 (p6_logout_offline).
- P6 concluído e revisado pelo coordenador: 7 testes específicos, 23 testes frontend; logout sem clear/reload e fetch com token capturado. Em execução P7 (p7_fila_indexeddb).
- S1: 26 testes de revogação/versão/liveUser/Delivery passaram; papel/tenant atuais substituem claims. S3 (s3_senhas_chave) assume política de credenciais e administração UI.
- P4: 13 testes de concorrência/CAS/abertura/legado passaram. P1 (p1_pagamento_idempotente) integra recebimento com versão do caixa na mesma transação.
