# Alinhamento seguro dos acessos por perfil e comandas

## Objetivo

Corrigir divergências entre menus, rotas do frontend e permissões existentes na
API, mantendo a API como fronteira de segurança. Permitir que Operador e Garçom
usem a edição de comandas que já lhes é autorizada e conceder à Cozinha acesso
limitado à consulta e edição de itens em comandas abertas, sem acesso financeiro.
Permitir também que Garçom feche comandas, sem ampliar suas demais operações
financeiras.

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
- A tela `/comandas` carrega lista, catálogo e configuração de mesas usando
  `Promise.all`, mas consulta `GET /products`, que nega acesso a Operador e
  Garçom. A rejeição impede a tela inteira de carregar, apesar de a API já
  permitir que esses perfis leiam comandas e editem seus itens.
- A mesma carga falha para Gerente porque `GET /mesas` não permite esse perfil,
  embora Gerente possa consultar comandas e fechar uma comanda.
- Cozinha tem acesso ao quadro e às fichas técnicas de leitura, mas não à lista
  completa de comandas nem às rotas de edição de itens. A captura apresentada
  mostra o erro 403 de `/products` para o usuário `garcom`.
- Portanto, Operador e Garçom falham em `/products`, Gerente falha em `/mesas`
  e Cozinha falha em `/comandas`; a carga atual só é autorizada integralmente
  para Admin.
- A rota `POST /comandas/:id/fechar` permite admin, Operador e Gerente, mas
  nega Garçom, embora esse perfil já possa abrir e editar comandas e a tela
  atual apresente o fluxo de fechamento.
- Garçom e Gerente já podem cancelar uma comanda com a aprovação exigida; Garçom
  também já pode receber parcialmente. Garçom não pode reabrir comandas. Essas
  permissões existentes não devem mudar.

## Abordagens consideradas

1. **Corrigir o acesso existente e conceder permissões operacionais limitadas
   (recomendada).** Usar o catálogo de PDV para Operador/Garçom, permitir que
   Garçom feche comandas e ampliar somente leitura/edição de itens em
   comandas abertas para Cozinha. Filtrar dados financeiros da Cozinha e
   esconder ações não autorizadas.
2. **Deixar a Cozinha somente no quadro atual.** Evita mudança de autorização,
   mas não atende ao pedido explícito de ver e editar comandas.
3. **Dar acesso amplo à Cozinha nas rotas de comandas e finanças.** Rejeitada:
   ultrapassa a necessidade operacional e expõe ações e dados financeiros.

## Desenho proposto

### Regra de autorização

- A API continua sendo a autoridade final. Não remover nem relaxar
  aprovações de gerente ou validações existentes. As únicas permissões novas
  são as explicitadas para Cozinha e para o fechamento por Garçom neste
  documento.
- Usar uma única matriz frontend para os perfis autorizados a abrir cada tela,
  compartilhada entre `App.jsx` e `Layout.jsx`, evitando divergência entre
  menu e rota.
- Guardas de rota devem também bloquear acesso por URL direta, redirecionando
  ao destino seguro já usado pelo aplicativo.
- A matriz do frontend não substitui controles de ações nem autorização da
  API.

### Acessos na interface

- **Admin:** preserva todos os acessos e operações atuais.
- **PDV / Nova venda:** somente Admin, Operador e Garçom. A rota e o menu
  devem respeitar essa lista, pois Gerente e Cozinha não têm acesso aos
  endpoints de venda usados pela tela. O destino inicial é Dashboard para
  Admin, Comandas para Gerente, PDV para Operador/Garçom e Cozinha para
  Cozinha.
- **Gerente:** pode abrir Produtos, Clientes, Estoque de Insumos e Caixa,
  somente nas ações autorizadas pela API:
  - Produtos: listar e editar; não criar nem excluir. Edição que exige
    autorização de gerente usa o fluxo de aprovação existente.
  - Clientes: consultar e exportar; não criar, editar nem excluir.
  - Estoque de Insumos: consulta somente; ocultar abas e ações que gravam
    produção, receitas, custos ou movimentos.
  - Caixa: manter leitura, contagem, abertura, sangria/suplementação,
    fechamento e reabertura conforme API e aprovações existentes.
- **Comandas para Gerente:** pode consultar, fechar e cancelar comandas,
  conforme a API e as aprovações existentes; não pode criar comandas nem
  adicionar, alterar ou remover itens. A tela não deve solicitar a
  configuração de mesas, que não é necessária para essas ações e não é
  autorizada a esse perfil.
- **Operador e Garçom:** podem consultar comandas abertas e adicionar,
  ajustar quantidade e remover itens, conforme as permissões já existentes na
  API. A tela deve usar o catálogo `/products/pdv`, autorizado para esses
  perfis, em vez de bloquear o carregamento com `GET /products`.
- **Fechamento pelo Garçom:** permitir finalizar uma comanda aberta pelo
  fluxo existente da tela e autorizar somente `POST /comandas/:id/fechar`.
  Preservar as permissões atuais de recebimento parcial e cancelamento com
  aprovação; não permitir reabertura.
- **Cozinha:** manter o quadro; permitir a rota de fichas técnicas em modo de
  leitura; além disso, consultar comandas abertas e adicionar, ajustar
  quantidade e remover itens. Não pode abrir comandas, alterar cliente/mesa ou
  detalhes, mover itens, cancelar, receber, fechar ou reabrir comandas. A
  redução de quantidade e a remoção continuam exigindo aprovação de gerente
  pelos mecanismos já existentes.
- **Dados da Cozinha:** a lista, os itens e o catálogo não devem expor preços,
  custos, totais, pagamentos, telefone ou endereço de entrega. A API deve
  retornar somente os dados operacionais necessários para localizar uma
  comanda e editar seus itens; a interface também não deve renderizar ações
  financeiras. A lista de edição (`GET /comandas?status=aberta`) e as respostas
  das rotas de itens limitam a comanda a `_id`, `numero`, `tipoAtendimento`,
  `mesa`, `status` e itens com `_id`, `produtoId`, `nome`, `quantidade`,
  `tipoVenda`, `unidadeVenda`, `pesoVendidoKg`, `pesoPorUnidade`, `unidadePeso`,
  `modificadores` e `aFazer`. O catálogo `/products/pdv` limita-se a `_id`,
  `nome`, `categoria`, `tipo`, `tipoProduto`, `unidadeVenda`, `pesoPorUnidade`,
  `unidadePeso` e `vendidoFracionado`. O quadro KDS existente mantém somente
  os dados operacionais usados pela tela (`_id`, `numero`, `tipoAtendimento`,
  `mesa`, `status`, `createdAt`, `clienteNome`, `observacao`, `statusBalcao`,
  estado `entrega.preparoPronto` e os mesmos campos operacionais dos itens);
  não retorna contato, endereço ou valores. Cozinha não pode definir preço
  manual, mesmo com token de autorização.
- **Fichas técnicas da Cozinha:** `/products` e `/production/recipes` retornam
  somente os dados operacionais necessários para consultar fichas e
  disponibilidade; não incluem custos, preços ou autoria. A Cozinha não pode
  acessar outras rotas de produção nem a listagem de estoque administrativo.
- **Cadastro de Mesas:** somente admin, tanto pelo menu como por URL.
- Todas as demais telas administrativas continuam restritas ao admin.

### Arquivos e impacto

- Centralizar a matriz de telas no frontend e consumi-la em `App.jsx` e
  `Layout.jsx`.
- Adaptar os controles de Produtos, Clientes, Produção, Caixa e Comandas aos
  limites acima; corrigir a rota de fichas da cozinha e proteger Cadastro de
  Mesas.
- Ajustar a consulta de catálogo em Comandas para usar `/products/pdv` nos
  perfis de atendimento e fornecer a Cozinha apenas os campos necessários.
  Carregar configuração de mesas somente para os perfis que podem usá-la; não
  ampliar `GET /mesas` para Gerente.
- Permitir Cozinha somente na leitura de comandas abertas e nas rotas de
  adicionar, editar quantidade e remover itens. As respostas para Cozinha
  devem ser limitadas aos campos operacionais descritos acima; a cozinha só
  pode editar comandas com status `aberta`, nunca `rascunho` ou fechadas.
- Permitir Garçom somente na rota já existente de fechamento de comanda, além
  das permissões atuais de atendimento. Não alterar seus guards existentes de
  recebimento parcial ou cancelamento; a reabertura continua negada.
- Não alterar papéis cadastráveis, sessões, modelos persistidos ou dados de
  negócio. Não fazer migração de banco.
- Não ampliar permissões de fechamento para Cozinha, recebimento, cancelamento,
  reabertura, configuração ou outras operações financeiras.

## Compatibilidade e segurança

- Usuários, sessões e dados persistidos não mudam.
- Operador não ganha novas permissões de API; a tela passa a usar endpoints
  que esse perfil já pode acessar para leitura e edição de itens.
- Garçom ganha somente a permissão de fechar comanda descrita nesta
  especificação; recebimento parcial e cancelamento preservam suas permissões
  e aprovações existentes, e reabertura continua negada.
- Cozinha recebe somente as novas permissões de leitura e edição de itens em
  comandas abertas descritas nesta especificação.
- A interface não deve apresentar uma operação como concluída se a API a
  rejeitar; erros e aprovações continuam usando os fluxos existentes.
- A API não deve retornar dados financeiros ou pessoais desnecessários à
  Cozinha, mesmo que o cliente frontend seja alterado.
- Validar a implantação compatível em staging com contas por perfil. Publicar
  primeiro o backend compatível e depois o frontend; manter os artefatos
  anteriores para rollback. Não há migração ou rollback de dados.

## Verificação

- Testes da matriz de acesso confirmam, para cada perfil, menu visível e rota
  permitida/bloqueada.
- Testes das telas confirmam que gerente vê apenas os controles autorizados e
  que admin mantém os controles atuais.
- Testes de ponta a ponta reproduzem o 403 de `GET /products` para Garçom e
  confirmam que a lista de comandas carrega usando o catálogo autorizado.
- Testes cobrem os 403 iniciais de `/mesas` para Gerente e `/comandas` para
  Cozinha, confirmando depois que a interface não pede configuração de mesas
  desnecessária e que a API permite apenas a consulta operacional aprovada.
- Testes de RBAC confirmam que Cozinha consulta e edita itens em comandas
  abertas, não altera comandas fechadas e continua sem acesso às ações
  financeiras e de configuração.
- Testes de RBAC confirmam que Garçom fecha uma comanda aberta e continua sem
  acesso à reabertura, preservando recebimento parcial e cancelamento conforme
  os guards e aprovações existentes.
- Verificar que as respostas de comandas e catálogo para Cozinha não contêm
  preços, custos, valores totais, pagamentos, telefone ou endereço.
- Executar os testes direcionados para Caixa, Produtos, Clientes e Produção,
  preservando as proteções da API existentes.
- Executar testes unitários frontend, lint e build de produção do frontend.
- Validar manualmente em staging com contas admin, gerente, operador, cozinha
  e garçom; confirmar fechamento pelo Garçom, edição de itens da Cozinha,
  navegação direta por URL e rejeição de ações não autorizadas pela API.
