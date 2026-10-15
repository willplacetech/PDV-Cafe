# Revisão e correções de cinco áreas

**Objetivo:** corrigir problemas reproduzíveis de autenticação e HTML de impressão, pagamentos e estoque, confirmação fiscal, relatórios e interface, e restaurar as verificações automáticas.

**Escopo autorizado:** pedido e confirmação do usuário em 15/10/2026. Manter APIs, validações e dados existentes; sem deploy ou novas dependências.

## Frentes e verificações

- [ ] Autenticação, impressão e fiscal: rastrear sessão, escape de campos e confirmação do provedor; criar regressões antes das correções em serviços/rotas e executar testes de segurança, sessão, impressão e fiscal.
- [ ] Pagamentos e estoque: reproduzir falha de cancelamento, distinguir mocks desatualizados de defeitos reais; conferir recebimentos, estornos e transferências com testes unitários e de integração.
- [ ] Relatórios: conferir vendas fora do horário exibido no gráfico, totais por cliente, custos históricos e limites de períodos. Testar as respostas reais de `/api/dashboard` antes de corrigir.
- [ ] Interface: corrigir os quatro erros e o aviso de hooks sem desabilitar regras; testar os comportamentos afetados e executar lint completo.
- [ ] Automação: restaurar sintaxe dos testes de API e compatibilidade do teste de Delivery com `node:test`; adequar CI à versão Node exigida pelas dependências e incluir verificações frontend.

## Critérios de conclusão

- [ ] `npm test` na raiz e testes unitários do frontend passam.
- [ ] Lint e build do frontend passam.
- [ ] Testes Cypress são executados contra aplicação local; registrar eventuais limites concretos.
- [ ] Revisão independente do diff, sem alteração de credenciais ou dados reais.

## Atenção na revisão

- Respostas fiscais indeterminadas não podem permitir reemissão cega.
- Pagamentos cancelados não podem voltar a receitas ou receber estorno duplicado.
- Texto vindo de cadastro não pode executar HTML na impressão.
- Vendas fora de 08h–20h continuam nos totais gerais.
- Nenhuma falha deve ser escondida por exclusão de testes ou desativação de regras.
