# Estabilidade de interface e paginação — design

## Objetivo

Reduzir estados de carregamento ambíguos e tornar listas de registros grandes
navegáveis sem degradar o PDV em produção. Preservar a identidade visual atual
do Sabor de Abraço e os contratos existentes sempre que a paginação não exigir
uma mudança de API.

## Escopo funcional

1. Remover eventual indicador global de carregamento fixo que cubra o rodapé
   das telas Dashboard, PDV e Entregas. A remoção só será feita se o indicador
   estiver presente no código executado por essas telas; carregamento de rota
   e feedback de ações individuais permanecem locais.
2. Preservar o skeleton do catálogo do PDV durante a consulta. Exibir “Nenhum
   produto cadastrado” somente depois de uma resposta válida vazia; falhas e
   falta de conexão devem continuar distinguíveis do catálogo vazio.
3. Corrigir a visualização de receita e ticket médio dos últimos sete dias,
   distinguindo carregamento, ausência válida de dados e erro. Conferir o
   contrato e a agregação de `GET /dashboard/receita-7-dias` antes de alterar
   cálculos.
4. Preservar e testar `GET /api/dashboard/urgencias`, atualmente registrado
   em `routes/dashboard.js` e montado em `server.js`.
5. Adotar paginação nas listas de registros da aplicação que possam crescer,
   aproveitando o componente compartilhado `Paginacao.jsx`. Não adicionar
   paginação a opções de formulário, categorias, listas curtas de resumo ou
   seções deliberadamente limitadas.
6. Para consultas com potencial de grande volume, preferir paginação na API.
   A migração será opt-in por parâmetros de página/limite, mantendo o formato
   legado para chamadas atuais até a tela consumidora ser migrada. Listas
   pequenas que já estão carregadas podem usar paginação no cliente.
7. Exibir skeletons localizados nos cards cuja carga inicial seja assíncrona,
   sem sobreposição global. Erros terão estado e ação de repetição quando a
   tela já oferecer esse padrão.

## Abordagem

Fazer em etapas verificáveis:

- Corrigir os estados de carregamento e vazio identificados no Dashboard, PDV
  e Entregas, sem refatorar fluxos de venda nem o estilo global.
- Confirmar a rota de urgências com teste de integração e cobrir a espera e
  estado vazio/erro do gráfico.
- Inventariar listas persistentes expostas nas telas. Aplicar primeiro o
  componente visual existente e, em seguida, adaptar APIs de alto volume de
  forma compatível e com testes de contrato.
- Não alterar todos os endpoints para um envelope novo de uma só vez. Cada
  lista passa a pedir paginação explicitamente e mantém o contrato legado
  enquanto outros consumidores não forem migrados.

## Regras de estado

- Carregamento não é estado vazio.
- O usuário não deve interpretar uma falha de API como ausência de dados.
- Mudança de filtro ou pesquisa reinicia a página na primeira.
- Após atualizar ou excluir registros, a página corrente deve continuar
  válida; se ficar além do total, retornar à última página disponível.
- Exportações e operações em lote devem continuar abrangendo o conjunto
  inteiro quando esse for o comportamento atual, não apenas os itens visíveis
  na página.

## Compatibilidade visual e técnica

- Manter React + Vite em JavaScript e o tema existente; não iniciar migração
  para TypeScript nesta tarefa.
- Reutilizar `Paginacao.jsx`, `Skeleton.jsx` e tokens CSS já existentes quando
  adequados.
- Não mudar autenticação, autorização, semântica de estoque, fechamento de
  comandas nem regras de faturamento.
- Novos parâmetros de paginação devem ser validados no servidor e permanecer
  limitados por um máximo seguro.

## Verificação

- Testes de interface para estados de carregamento, vazio, erro e navegação de
  páginas nas telas migradas.
- Testes de API para paginação, filtros e compatibilidade com respostas sem
  parâmetros de paginação.
- Build de produção do frontend e testes direcionados do backend/frontend.
- Listar explicitamente falhas preexistentes de lint ou testes que não sejam
  causadas por esta mudança.

## Limites e riscos conhecidos

- A busca inicial não encontrou o texto global “Aguarde…” fixo no rodapé em
  `front-end/src`; confirmar a presença no código executado antes de remover
  qualquer componente global.
- O PDV já renderiza skeleton de produtos enquanto `carregandoProdutos` é
  verdadeiro.
- A rota `/api/dashboard/urgencias` já existe e está montada.
- A chamada do gráfico já tem endpoint; o relato de tela em branco requer
  separar problema de dados/consulta de problema de apresentação.
- “Todas as listas” significa listas de registros persistentes e potencialmente
  longas; não inclui seletores estáticos nem pequenos resumos operacionais.
