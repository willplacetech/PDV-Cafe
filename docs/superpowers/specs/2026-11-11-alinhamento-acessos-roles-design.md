# Alinhamento seguro dos acessos por perfil

## Objetivo

Corrigir divergências entre menus, rotas do frontend e permissões existentes na
API, mantendo a API como fronteira de segurança. A correção não deve ampliar
permissões no backend nem alterar dados ou contratos.

## Situação observada

- `App.jsx` restringe Produtos, Clientes, Produção e Caixa ao admin, embora o
  menu anuncie algumas dessas áreas para gerente.
- Os endpoints não concedem as mesmas operações para todos os perfis: gerente
  pode consultar clientes, mas não cadastrá-los; pode consultar e editar
  produtos com autorização, mas não criá-los ou excluí-los; pode consultar
  dados de produção, enquanto as operações de escrita são admin-only.
- A tela de Caixa aceita gerente na API para leitura e operação, com autorização
  exigida para ações sensíveis, mas a rota do frontend não permite o perfil.
- Cadastro de Mesas está no menu apenas para admin, mas a rota do frontend não
  tem guarda de perfil.
- `/producao/fichas` já permite admin/cozinha no guard, mas redireciona para
  `/producao`, restrita ao admin.

## Abordagens consideradas

1. **Manter a API e ajustar o frontend por ação (recomendada).** Corrige o
   acesso do gerente onde a API já permite, oculta ações não autorizadas e
   mantém a defesa do servidor. Exige ajustes localizados em algumas telas e
   testes de acesso.
2. **Deixar as telas completas somente para admin.** Menor alteração, mas
   mantém os acessos já permitidos ao gerente inutilizáveis no frontend e
   contradiz os itens atuais do menu.
3. **Ampliar permissões da API para igualar a interface.** Rejeitada: pode
   expor operações administrativas e aumenta o risco de regressão.

## Desenho proposto

### Regra de autorização

- A API continua sendo a autoridade final. Não remover nem relaxar
  `auth.allowRoles`, aprovações de gerente ou validações existentes.
- Usar uma única matriz frontend para os perfis autorizados a abrir cada tela,
  compartilhada entre `App.jsx` e `Layout.jsx`, evitando divergência entre
  menu e rota.
- Guardas de rota devem também bloquear acesso por URL direta, redirecionando
  ao destino seguro já usado pelo aplicativo.
- A matriz do frontend não substitui controles de ações nem autorização da
  API.

### Acessos na interface

- **Admin:** preserva todos os acessos e operações atuais.
- **Gerente:** pode abrir Produtos, Clientes, Estoque de Insumos e Caixa,
  somente nas ações autorizadas pela API:
  - Produtos: listar e editar; não criar nem excluir. Edição que exige
    autorização de gerente usa o fluxo de aprovação existente.
  - Clientes: consultar e exportar; não criar, editar nem excluir.
  - Estoque de Insumos: consulta somente; ocultar abas e ações que gravam
    produção, receitas, custos ou movimentos.
  - Caixa: manter leitura, contagem, abertura, sangria/suplementação,
    fechamento e reabertura conforme API e aprovações existentes.
- **Cozinha:** manter o quadro de cozinha; permitir a rota de fichas técnicas
  apenas em modo de leitura, conforme os guards/endpoints atuais.
- **Operador e Garçom:** manter telas e permissões atuais; não ampliar acesso.
- **Cadastro de Mesas:** somente admin, tanto pelo menu como por URL.
- Todas as demais telas administrativas continuam restritas ao admin.

### Arquivos e impacto

- Centralizar a matriz de telas no frontend e consumi-la em `App.jsx` e
  `Layout.jsx`.
- Adaptar os controles de Produtos, Clientes, Produção e Caixa aos limites
  acima; corrigir a rota de fichas da cozinha e proteger Cadastro de Mesas.
- Não alterar rotas, middleware, models, banco, sessões ou papéis do backend.
- Não mudar o formato de resposta nem os contratos de API.

## Compatibilidade e segurança

- Usuários, sessões e dados persistidos não mudam.
- Nenhuma role ganha acesso a endpoint novo.
- A interface não deve apresentar uma operação como concluída se a API a
  rejeitar; erros e aprovações continuam usando os fluxos existentes.
- A publicação inicial deve ser somente do frontend após validar com contas de
  teste por perfil em staging. A reversão consiste em republicar o artefato
  frontend anterior; não há migração ou rollback de dados.

## Verificação

- Testes da matriz de acesso confirmam, para cada perfil, menu visível e rota
  permitida/bloqueada.
- Testes das telas confirmam que gerente vê apenas os controles autorizados e
  que admin mantém os controles atuais.
- Manter cobertura backend RBAC existente e executar os testes direcionados
  para Caixa, Produtos, Clientes e Produção sem modificar suas regras.
- Executar testes unitários frontend, lint e build de produção do frontend.
- Validar manualmente em staging com contas admin, gerente, operador, cozinha
  e garçom; confirmar navegação direta por URL e rejeição de ações não
  autorizadas pela API.
