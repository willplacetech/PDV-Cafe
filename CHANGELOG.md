# Changelog

## [2.0.0] - 2026-10-15

### Professionalização do PDV

#### Autorização de gerente (TAREFA 1)
- senha de gerente obrigatória para cancelar venda, alterar preço, excluir produto/cliente,
  sangria/suprimento, fechamento de caixa, alterar taxas de cartão e gerenciar usuários
- endpoint `POST /api/auth/autorizar` emite token JWT de 5 min com ação específica
- 3 tentativas incorretas bloqueiam por 60 segundos
- token cacheado por 4 minutos (reaproveitado entre ações)
- `EXIGIR_AUTORIZACAO_GERENTE` (default `true`, `false` em testes) controla o comportamento globalmente
- todos os acessos são registrados em auditoria (sucesso/falha + motivo)
- nova role `gerente` adicionada aos perfis válidos

#### Estados de interface (TAREFA 2)
- remoção do loading global fixo "Aguarde..." no Toast (causava posicionamento quebrado)
- skeleton loader (pulse animation) no catálogo de produtos do PDV durante carregamento
- estado vazio corrigido em DeliveryAnalytics (receita 7 dias)
- retry button em erros de rede (Financeiro, FichasTecnicas, Orders, Dashboard)
- padrão de retry aplicado a hooks de fetch: `useApi` / `useFetchWithError`

#### Versão e changelog (TAREFA 3)
- versão exibida no footer do layout (`v{APP_VERSION}`)
- `CHANGELOG.md` criado com histórico de versões
- modal "Novidades" exibido ao detectar nova versão via service worker

#### Exportação CSV (TAREFA 4)
- utilitário `exportarCSV(dados, colunas, nomeArquivo)` reutilizável
- botão de exportação CSV em Cadastro de Clientes
- exportação mantida para DRE/Financeiro (já existente)

#### RBAC (TAREFA 5)
- role `gerente` adicionada a `allowRoles` em rotas de caixa, comandas, produção e estoque
- menu lateral agora mostra itens de gerente (Fechamento de Caixa, Estoque de Insumos) para role `gerente`
- `operador` mantém acesso a PDV + Entregas + Comandas
- proteção de rota via `RoleRoute` validada em todas as páginas admin

#### Auditoria (TAREFA 6)
- model `Auditoria` criado (`back-end/models/Auditoria.js`)
- endpoint `GET /api/auth/auditoria` para listagem com filtros (ação, sucesso, período)
- todos os acessos autorizados/registrados populam `usuarioSolicitante` e `usuarioAutorizou`

### [1.0.0] - 2026-09-01
- versão inicial do PDV Sabor de Abraço
