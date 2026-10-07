# PDV: completar comanda unificada

**Objetivo:** completar os requisitos do texto fornecido pelo usuário, na ordem 0–3, reutilizando o pagamento, os serviços e o visual existentes.

## Diagnóstico inicial

- Tarefa 0: o pagamento já usa modal e a impressão usa iframe. Porém `setCarrinho` está declarado depois de um `return` dentro do recálculo de preços; adicionar produto falha. Falta validar conclusão e reimpressão.
- Tarefa 1: Dashboard existe em Financeiro, mas falta como primeiro item de Atendimento e falta link na marca. Preço unitário aparece preenchido, mas não é editável. O loading é global e recebe também consultas periódicas.
- Tarefa 2: contexto global, seletor reutilizável de mesas, pagamento e bottom sheet existem. Faltam abertura automática, abas de tipo, novo pedido explícito, salvar em aberto para todos os tipos, observação, imprimir e transferir. A rota de mesas redireciona ao PDV; deve mostrar uma visão geral sem lançamento de produto.
- Tarefa 3: configuração de taxas, gráfico de 7 dias, indicadores de Delivery, entregadores e APIs já existem. Conferir filtros dos indicadores. Manter canais acima das abas conforme a solicitação mais recente do usuário.

## Execução e validação

- [x] 0. Corrigir atualização dos itens e proteger confirmação de pagamento contra envio duplicado; testar adição, remoção, pagamento e impressão.
- [x] 1. Ajustar menu e marcas; preço editável deve persistir no backend e ser validado; consultas periódicas devem ser silenciosas.
- [x] 2. Completar ações da comanda e visão geral de mesas; preservar pedidos ao trocar contexto; usar bottom sheet e seletor fullscreen existentes.
- [x] 3. Conferir indicadores e filtros; preservar layout atual das abas de Dashboard.
- [x] Rodar testes pertinentes, lint e build. Registrar limitações e checklist manual.

Sem novas dependências, sem alteração de credenciais, sem publicação automática. APIs existentes serão preservadas; novos campos de item são opcionais.

Resultados e checklist manual: `docs/pdv-comandas-verificacao.md`. Suítes antigas com falhas registradas nesse relatório; não foram consideradas aprovadas.
