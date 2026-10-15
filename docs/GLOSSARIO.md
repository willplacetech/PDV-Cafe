# Glossário do domínio

As descrições distinguem o significado operacional geral do que está
efetivamente representado no código deste PDV. Um termo aparecer aqui não
significa, por si só, que exista um módulo completo para ele.

| Termo | Significado | Representação observada no projeto |
|---|---|---|
| **Comanda** | Registro aberto para acumular itens e valores de um atendimento antes do encerramento e/ou pagamento. | Modelo `Comanda`, com itens, cliente, mesa textual, estado do atendimento e histórico de pagamentos. A API está em `back-end/routes/comandas.js`. |
| **Ficha técnica** | Especificação de ingredientes/insumos e quantidades necessárias para produzir um produto ou rendimento. | Array `Product.fichaTecnica` e modelo `Recipe` com `ingredientes`, rendimento e unidade. Ambos referenciam outros `Product`. |
| **Insumo** | Item consumível usado na produção ou controlado para composição de estoque/custo. | Não é coleção separada: é um `Product` com `tipo: "insumo"`; fichas técnicas referenciam `Product`. |
| **DRE** | Demonstração do Resultado do Exercício: visão de receitas, custos e despesas no período. | O sistema tem relatório financeiro chamado DRE em `/api/contabil/dre`; sua presença não equivale a validação contábil/fiscal formal. |
| **NFC-e** | Nota Fiscal de Consumidor Eletrônica, documento fiscal eletrônico de venda ao consumidor. | Subdocumento `Order.nfce`; emissão por adaptador HTTP configurável. Só é tentada quando a configuração fiscal do backend está completa. |
| **CFOP** | Código Fiscal de Operações e Prestações. Código numérico que identifica a natureza fiscal da operação ou prestação — por exemplo, se é uma entrada ou saída e qual o tipo/origem da operação. A escolha correta depende do contexto fiscal, como operação, destino e regime aplicável. | Não foi encontrado campo ou configuração CFOP nos models e fluxo fiscal examinados; o significado é explicado aqui, mas o código aplicável ainda não está definido no PDV. |
| **NCM** | Nomenclatura Comum do Mercosul, classificação fiscal de mercadorias. | Campo textual `Product.ncm`; o emissor NFC-e usa fallback `21069090` e gera aviso quando o produto não tem NCM cadastrado. |
| **CST** | Código de Situação Tributária usado na classificação tributária do item/operação, conforme o regime aplicável. | O emissor monta um CST de ICMS a partir de `FISCAL_CST_PADRAO` ou valores definidos no utilitário NFC-e. |
| **CSOSN** | Código de Situação da Operação no Simples Nacional, aplicável conforme enquadramento e operação. | Não foi encontrado campo `CSOSN` nem seleção explícita de CSOSN no schema ou payload fiscal consultado. O tratamento tributário deve ser confirmado com o provedor e responsável fiscal. |
| **Sangria** | Retirada de dinheiro do caixa durante o turno, registrada para conciliar o saldo esperado. | Item em `FechamentoCaixa.sistema.sangrias`, com valor, responsável, motivo e data. |
| **Suprimento** | Entrada de dinheiro no caixa, além das entradas de vendas, para compor o saldo físico. | O código chama a operação `suplementacao` e armazena os registros em `FechamentoCaixa.sistema.suplementacoes`. |
| **Ticket médio** | Valor médio por venda/pedido no período, calculado conforme o critério do relatório. | O dashboard expõe `ticketMedio`; no resumo por período, soma o total de pedidos não cancelados e não internos e divide pela quantidade desses pedidos. Outros relatórios podem usar conjuntos próprios. |
| **Curva ABC** | Classificação de itens por contribuição acumulada, normalmente de receita ou consumo, para priorizar gestão. | Implementada nos insights do dashboard com produtos ordenados por receita e percentual de receita acumulada: classe A até 80%, B até 95% e C acima disso. |
| **KDS** | Kitchen Display System: termo alternativo para a tela/fluxo de cozinha usado para acompanhar pedidos e estados de preparo. | No contexto deste projeto, é outro nome para o fluxo/tela de cozinha existente, não uma integração independente ou um sistema KDS externo. |
| **MEI** | Microempreendedor Individual, regime/enquadramento com regras fiscais próprias. | O emissor possui o valor `FISCAL_TIPO_CONTRIBUINTE=mei` e regra de CRT/CST específica no utilitário; configuração fiscal não substitui validação profissional. |
| **Simples Nacional** | Regime tributário simplificado para micro e pequenas empresas, com regras fiscais dependentes da operação. | O utilitário menciona “Simples” junto ao tratamento genérico de empresa não-MEI, mas não há seleção explícita de opção Simples nem CSOSN modelado. |
| **Conteúdo por embalagem** | Quantidade de conteúdo em cada unidade de embalagem de compra, usada para converter embalagens em quantidade de estoque. | `Product.conteudoPorEmbalagem` e `Product.unidadeConteudo`; os itens de `Purchase` também registram quantidade de embalagens, conteúdo e total convertido. |

## [DECISÃO PENDENTE]

- CFOP não aparece no modelo/payload fiscal examinado. O projeto deve passar a
  armazená-lo ou enviá-lo ao provedor? A regra e o nível adequados dependem da
  operação e devem ser confirmados com o responsável fiscal/provedor antes de
  qualquer implementação.

## Decisões confirmadas

- A escolha de CST/CSOSN fica a cargo do provedor fiscal, conforme a
  configuração e o contrato desse provedor; o PDV atual não modela CSOSN.
- KDS é outro nome para o fluxo/tela atual de cozinha, não uma integração
  separada.
- A documentação do glossário não altera regras fiscais nem comportamento de
  venda/emissão do sistema.
