# Revisão geral — 03/10/2026

Revisão de segurança, consistência de estoque, pagamentos, relatórios e interface. Os achados abaixo vêm da leitura dos fluxos e, quando indicado, de reproduções locais em memória. Nenhum banco de produção foi acessado e nenhum arquivo de código foi alterado. Não constitui certificação de ausência de outras vulnerabilidades.

## Segurança e disponibilidade

### 1. Crítica, se JWT_SECRET estiver ausente — falsificação de administrador

Referências: `back-end/middleware/auth.js:2`, `back-end/routes/auth.js:6`, `render.yaml:15`.

A aplicação usa uma chave fixa e pública quando falta JWT_SECRET. Basta assinar um token com `role: admin` usando essa chave: o middleware aceita sem consultar o usuário no banco. Reproduzido localmente, sem configuração de segredo, com token sintético aceito. O manifesto Render não declara JWT_SECRET, embora ele possa existir na configuração externa, que não foi inspecionada.

Correção recomendada: exigir segredo forte na inicialização, eliminar fallback e invalidar tokens emitidos com a chave anterior.

### 2. Alta, se ADMIN_PASSWORD estiver ausente — administrador com senha padrão

Referências: `back-end/db.js:24`, `back-end/server.js:123`.

Na ausência do usuário, o servidor cria administrador com senha conhecida `1234`. Além disso, db.js cria sempre `admin`, mesmo quando ADMIN_USERNAME configura outro nome; a inicialização pode criar duas contas administrativas. Configurar outro nome não elimina a primeira conta. Exigir credenciais explícitas e centralizar o provisionamento em um único lugar.

### 3. Alta — HTML de clientes executável na impressão

Referências: `front-end/src/pages/Dashboard.jsx:249`, `front-end/src/pages/ContasReceber.jsx:444`, `back-end/routes/customers.js:57`.

Nomes são interpolados diretamente no HTML entregue a document.write. Um garçom autorizado a cadastrar clientes pode gravar markup com manipuladores de eventos; ao administrador imprimir o relatório, esse conteúdo pode executar na origem da aplicação e acessar o token em localStorage. Escapar todos os campos ou construir o documento com nós de texto, reutilizando o padrão de `front-end/src/utils/notaVenda.js`. A execução no navegador não foi testada; o caminho de entrada e o ponto de inserção inseguro foram confirmados no código. Eventuais políticas CSP da hospedagem externa não foram verificadas.

### 4. Alta — login inválido pode gerar rejeição assíncrona sem tratamento

Referências: `back-end/routes/auth.js:19`, `back-end/routes/fiscal.js:22`.

O login não valida o tipo de password e não possui try/catch. Para um usuário existente, senha ausente faz bcrypt rejeitar a Promise. A versão usada é Express 4, sem wrapper de erros assíncronos. Isso pode encerrar o processo ou deixar requisição sem resposta, conforme a configuração de Node. A consulta fiscal antes do try apresenta o mesmo problema para IDs inválidos. Reproduzidas a rejeição do bcrypt e a Promise rejeitada do handler com consulta simulada.

Validar tipos na entrada e encaminhar rejeições a next(error). A propagação automática de Promises é uma mudança documentada para [Express 5](https://expressjs.com/en/guide/migrating-5.html#rejected-promises).

## Cobrança e estoque

| # | Prioridade | Referência | Cenário e impacto | Correção recomendada |
|---|---|---|---|---|
| 5 | Alta | `front-end/src/pages/Comandas.jsx:211` | Pagamento parcial marcado com campo vazio ou zero cai no fechamento integral. O backend registra todo o saldo como recebido em `back-end/routes/comandas.js:535`. | Se a opção parcial estiver marcada, rejeitar valor inválido antes de chamar qualquer endpoint. |
| 6 | Alta | `back-end/routes/comandas.js:345`, `:392` | Excluir itens não recalcula valorTotal. Transferir preserva total antigo na origem e cria destino com total zero. O hook em `back-end/models/Comanda.js:82` deriva saldo do total armazenado. | Recalcular preços, total e saldo das duas comandas na mesma transação e definir tratamento de pagamentos já recebidos. |
| 7 | Alta | `back-end/utils/estoqueProduto.js:10` | Peso zero é interpretado como campo ausente. Após esgotar fatias, as peças remanescentes recriam peso disponível. Reproduzido: estoque 5 peças e peso zero tornam-se 5 kg na normalização. | Distinguir zero de campo ausente e realizar migração explícita dos legados. |
| 8 | Alta | `back-end/routes/comandas.js:294`, `:322`, `:345`, `:374` | Adição, edição, remoção e transferência descartam metadados de venda por peso antes de movimentar estoque. Uma fatia registrada com quantidade comercial 1 pode movimentar uma peça inteira. | Preservar tipoVenda, pesoVendidoKg, quantidadePecas e aplicar movimentos correspondentes. |
| 9 | Alta | `back-end/routes/comandas.js:120` | permitirVendaSemInsumo impede consumo, mas cancelamento repõe ingredientes incondicionalmente. Adicionar e cancelar aumenta saldo que nunca foi consumido. | Registrar consumo efetivo por item e devolver somente esse consumo. |
| 10 | Alta | `back-end/utils/estoqueInsumo.js:51`, `:300` | Ingrediente híbrido tipo venda + usavelEmReceita tem saldo lido de estoque, enquanto consumirInsumo altera estoqueEmbalagens. Reproduzido: consumir 1 L de saldo 10 mantém disponibilidade efetiva 10. | Atualizar a mesma fonte de saldo usada para leitura e harmonizar consumo e reposição. |
| 11 | Alta | `back-end/routes/purchases.js:99` | Compra sobrescreve conteúdo de todas as embalagens antigas. Dez embalagens de 1 kg mais uma de 5 kg viram 11 × 5 = 55 kg em vez de 15 kg. | Preservar quantidade física existente ou rejeitar mudança de embalagem enquanto houver saldo incompatível. |
| 12 | Alta | `back-end/routes/orders.js:260` | Cancelamento devolve somente item.quantidade a estoque, ignorando peso e ingredientes. Cancelar fatia pode criar uma peça sem devolver seu peso; produto preparado recebe saldo de produto em vez de reposição correta. | Estornar os movimentos efetivamente registrados na venda. |
| 13 | Média | `back-end/routes/orders.js:166` | Adicionar itens a pedido usa product.preco e baixa apenas peças. Peça de 0,5 kg a R$40/kg custa R$20 na criação e R$40 na adição; peso não é atualizado. | Compartilhar cálculo de preço e estoque entre criação e acréscimo. |
| 14 | Média | `front-end/src/pages/PDV.jsx:197` | Abrir comanda não bloqueia envios durante requisição. Cliques repetidos podem criar duas comandas e duas baixas se processados em sequência; a API não tem idempotência. | Bloquear botão durante envio e usar chave de idempotência na API. |

## Relatórios, integração fiscal e ambiguidades de interface

| # | Prioridade | Referência | Cenário e impacto | Correção recomendada |
|---|---|---|---|---|
| 15 | Alta | `back-end/utils/nfce.js:186`, `back-end/routes/fiscal.js:31` | Qualquer HTTP 2xx vira nota autorizada, mesmo corpo vazio ou status processando sem chave/protocolo. Reproduzido com fetch simulado retornando processando. A rota depois bloqueia nova emissão por considerar autorizada. | Validar resposta conforme contrato do provedor e distinguir pendência de autorização confirmada. |
| 16 | Média | `back-end/routes/contabil.js:102`, `:108` | Reprocessamento de taxas busca e compara tipo em historicoPagamentos, mas o schema `back-end/models/Comanda.js:49` armazena formaPagamento. Pagamentos de comandas não são atualizados. | Usar o campo persistido correto na consulta e comparação. |
| 17 | Média | `back-end/routes/contabil.js:182`, `:188` | O mesmo parâmetro impostos é deduzido da receita e novamente do lucro líquido. Exemplo sem outras despesas: receita 100 e impostos 10 produz lucro 80, em vez de 90. | Definir quais impostos pertencem às deduções de receita e quais incidem sobre lucro; evitar dupla subtração do mesmo valor. |
| 18 | Média | `front-end/src/pages/Dashboard.jsx:245` | Recebido líquido usa bruto − taxas antigas + taxas atuais. Bruto 100 e taxa 3 mostra 100; alterar taxa para 5 mostra 102. | Subtrair as taxas atuais do recebido bruto. |
| 19 | Média | `front-end/src/pages/PDV.jsx:187` | Remover uma linha não recalcula promoções de grupo. A tela conserva desconto mesmo quando perde requisito; servidor recalcula e cobra outro total. | Recalcular preços após remoção e apresentar o total confirmado pela API. |
| 20 | Média | `front-end/src/pages/MesasCadastro.jsx:50`, `front-end/src/pages/Comandas.jsx:52` | Salvar mesas apenas escreve no console e mostra sucesso; alterações desaparecem ao sair. Atendimento usa quatro mesas fixas. | Persistir configuração e usar a mesma fonte no atendimento; mostrar sucesso após confirmação da gravação. |

## Pontos adicionais que exigem definição ou verificação

- `back-end/server.js:23`: CORS permite qualquer subdomínio onrender.com. Isso amplia a lista para aplicações de terceiros. Como autenticação atual exige Bearer, essa condição isolada não demonstra sequestro de sessão. Restringir às origens próprias declaradas.
- `front-end/vite.config.js:75`: cache de API com a mesma origem não separa usuários; logout não limpa esse cache. O padrão atual usa API externa, então o risco depende da implantação. Definir quais dados autenticados podem ficar offline e limpar ou particionar cache por sessão.
- `back-end/routes/contabil.js:153`: DRE usa custo atual do produto para vendas antigas. Alterar preço de compra pode alterar retrospectivamente o resultado de um mês encerrado. Definir e preservar custo histórico por venda.
- `back-end/routes/despesas.js:35`: recorrência usa setMonth diretamente. Dia 31 pode transbordar para o mês seguinte. Definir regra para meses curtos e aplicar último dia válido, como já faz a edição em série.
- `back-end/jest.config.js:7`: somente tests/**/*.test.js entra na suíte normal; arquivos em back-end/test, incluindo pagamentoParcial e estoqueProduto, ficam excluídos.

## Verificações realizadas e limites

- Instaladas dependências locais com npm ci --ignore-scripts em back-end e front-end, preservando manifests e lockfiles.
- `npm run build` em front-end: passou, incluindo geração PWA. Aviso de bundle principal maior que 500 kB.
- Lint: falhou. O comando do frontend que verifica todo o projeto apresentou 189 erros e 10 avisos, muitos por configuração de globais Cypress. O lint somente de src também falhou; ver resumo final da revisão para contagem da execução com dependências instaladas.
- `npm test` na raiz: falhou por resolução de cross-env, mesmo após instalar dependências nos subprojetos. O script muda diretório, mas não delega a execução ao npm do subprojeto. Usar `npm --prefix back-end test` ou organizar workspaces.
- `npm test` em back-end iniciou a suíte, mas o MongoDB em memória falhou na verificação MD5 do binário. A execução foi interrompida após a falha de infraestrutura; os testes dependentes de banco não tiveram resultado válido. A validação de integridade foi preservada.
- Cypress não foi executado. Não foi iniciado ambiente de aplicação conectado a um banco real.
- Reproduções em memória confirmaram aceitação de JWT com chave fallback, recriação de peso zerado, consumo ineficaz de insumo híbrido, rejeição de senha ausente e aceitação de resposta fiscal pendente. Outros achados têm evidência por rastreamento do código; não foram exercitados contra MongoDB.
- npm audit backend: 33 dependências sinalizadas (28 altas, 5 moderadas). Com --omit=dev: 5 moderadas e nenhuma alta. Frontend: 4 dependências sinalizadas (2 altas, 1 moderada, 1 baixa). Isso mede alertas na árvore de dependências, não quantidade de falhas exploráveis no produto. Parte dos alertas Axios envolve adaptadores Node que não demonstram exploração no frontend. Morgan está instalado, mas não aparece utilizado no servidor revisado. Atualizações devem ser avaliadas por alcance e compatibilidade, sem aplicar --force indiscriminadamente.

Prioridade sugerida: autenticação e HTML de impressão; pagamentos e invariantes de estoque; confirmação fiscal; relatórios e comportamento da interface; restauração das verificações automáticas.
