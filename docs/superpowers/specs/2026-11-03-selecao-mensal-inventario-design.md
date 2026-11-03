# Seleção mensal nos relatórios e impressão de inventário

## Contexto e objetivo

O PDV apresenta relatórios mensais em mais de uma área. O Financeiro já possui
seleção de mês para DRE, fluxo de caixa e resumo de despesas, mas o resumo mensal
do Dashboard consulta sempre o mês corrente. Também é necessário imprimir uma
lista de itens para contagem e conferência física do estoque.

O objetivo é permitir consultar os relatórios mensais existentes por mês e
fornecer uma folha impressa para conferência manual do inventário, sem alterar
estoques pelo relatório.

## Escopo

- Adicionar seleção de mês ao resumo mensal do Dashboard, preservando o mês
  corrente como valor inicial.
- Preservar e tornar coerente o seletor de mês que já controla DRE, fluxo de
  caixa e resumo de despesas no Financeiro.
- Disponibilizar impressão em papel A4 dos produtos e insumos ativos que
  controlam estoque.
- Preservar indicadores diários, urgências e relatórios não mensais sem filtros
  de mês.

Não fazem parte do escopo uma central nova de relatórios, exportação em novos
formatos, alteração automática de saldo após a contagem ou mudança da regra
contábil dos relatórios.

## Comportamento e contratos

### Relatórios mensais

- A seleção usa um campo de mês (`AAAA-MM`) e inicia no mês corrente.
- O Dashboard envia o mês selecionado à API. Sem parâmetro, a API mantém a
  resposta compatível com o comportamento atual, usando o mês corrente.
- Um mês malformado deve ser rejeitado com resposta de erro explícita, não
  convertido silenciosamente em outro período.
- O intervalo do relatório é inclusivo no início e exclusivo no início do mês
  seguinte, calculado no fuso `America/Sao_Paulo`. Isso deve funcionar também
  na virada do ano.
- O período exibido e a impressão do fechamento mensal devem corresponder ao
  mês selecionado. Indicadores diários e dados em tempo real não mudam com essa
  seleção.
- No Financeiro, DRE, fluxo de caixa e resumo de despesas continuam usando o
  mês selecionado que já existe. Comparação de meses mantém seus dois seletores
  independentes.
- Relatórios de clientes, vendas individuais, comandas e outros dados sem
  agrupamento mensal permanecem como estão; a seleção de mês não deve sugerir
  que esses relatórios também foram filtrados.

### Folha de inventário

- A tela Produtos oferece uma ação para gerar a impressão.
- A impressão consulta a lista completa, independentemente da paginação, busca
  ou filtros atualmente aplicados na tabela.
- Incluir itens ativos que controlam estoque: produtos de venda com saldo
  próprio e insumos. Excluir produtos “Coz — na hora”, cujo saldo é calculado
  pelos insumos e não mantido como estoque próprio, além de itens inativos.
- Ordenar por tipo/categoria e nome, de forma previsível.
- A folha A4 identifica o inventário e a data de emissão e lista código, nome,
  categoria/tipo, unidade e saldo atual do sistema, seguidos de espaços em
  branco para contagem física e diferença. A contagem e a diferença são
  preenchidas manualmente; imprimir não grava alterações.
- Respeitar a representação normalizada do estoque existente, incluindo
  produtos controlados por peso. Para insumos, usar a quantidade/unidade
  operacional já apresentada pelo sistema.
- A resposta da consulta contém somente os dados necessários à conferência;
  não incluir preço, custo ou informações de clientes.
- Manter autenticação e autorização alinhadas às permissões existentes para
  consultar e conferir estoque.
- Se a consulta falhar ou a janela de impressão for bloqueada, exibir o erro
  pelos mecanismos atuais; não abrir uma folha com aparência de sucesso e sem
  dados.
- Escapar os valores textuais antes de inseri-los no documento impresso.

## Implementação esperada

- Estender a rota de Dashboard para validar o mês e calcular o resumo mensal
  para o intervalo solicitado, sem alterar as consultas de outros cartões.
- Atualizar o Dashboard para carregar o resumo mensal conforme o seletor, sem
  comprometer o carregamento ou a atualização dos demais dados da página.
- Reutilizar o seletor mensal do Financeiro, conferindo títulos e indicação do
  período nos relatórios que ele já controla; não duplicar filtros.
- Adicionar uma consulta específica para impressão do inventário, em vez de
  depender da lista paginada da tela Produtos ou retornar o catálogo inteiro
  com dados de custo.
- Implementar a montagem e a impressão da folha com o padrão de impressão e
  notificações já usado no frontend.

## Validação

### Relatórios

- Sem mês informado, o endpoint retorna o mês corrente.
- Selecionar um mês anterior altera o resumo do Dashboard; registros nos
  limites dos meses não vazam entre períodos.
- A seleção funciona ao atravessar a virada do ano e é interpretada no fuso
  `America/Sao_Paulo`.
- Mês inválido produz resposta de erro explícita.
- O relatório impresso indica o mesmo mês dos dados exibidos.
- DRE, fluxo de caixa e resumo de despesas continuam refletindo o mês
  selecionado no Financeiro; comparação de meses continua independente.
- Indicadores diários e relatórios sem período mensal não são alterados.

### Inventário

- A consulta inclui produtos e insumos ativos que controlam estoque e exclui
  inativos e produtos sem saldo próprio.
- Itens por peso e insumos exibem quantidade e unidade compatíveis com o estoque
  apresentado pelo sistema.
- A impressão inclui todos os itens, mesmo quando a tela está filtrada ou
  paginada, e tem as colunas de contagem física e diferença em branco.
- A resposta não expõe custos; falhas da API e bloqueio de pop-up são
  comunicados sem produzir impressão incompleta como se fosse válida.
- Gerar a folha não altera os saldos.

Executar testes direcionados de backend e frontend, lint e build de produção do
frontend. Não são necessários testes de deploy para esta mudança.
