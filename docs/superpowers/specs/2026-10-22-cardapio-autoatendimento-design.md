# Cardápio digital com autoatendimento — desenho

**Data:** 2026-10-22  
**Projeto:** PDV-Cafe  
**Status:** aprovado pelo usuário

## Objetivo e escopo

Permitir que clientes em uma mesa consultem um cardápio público por QR code e enviem pedidos sem autenticação. O nome e telefone são obrigatórios, o pedido exige aceite explícito para atualizações por WhatsApp, e a equipe recebe o pedido no PDV e no KDS.

Inclui geração e exibição local do QR por mesa, consulta pública do cardápio, criação de pedido, reutilização de cadastro de Cliente pelo telefone, registro do consentimento por pedido, atualização das telas do PDV/KDS e testes. Não inclui pagamento online, envio automático de mensagens via WhatsApp, CPF ou integração externa de QR code.

## Decisões aprovadas

- Os pedidos entram diretamente no fluxo de atendimento e no KDS, sem aprovação prévia.
- Reutilizar as comandas e o polling existentes; não adicionar Socket.IO.
- A comanda usa `status: 'aberta'` e `statusPagamento: 'pendente'`, compatíveis com os fluxos atuais. A origem será `origem: 'qr'`.
- A mensagem de consentimento é obrigatória. O consentimento será registrado por pedido com horário do servidor; nenhum WhatsApp será enviado automaticamente nesta etapa.
- Nome e telefone são associados a um registro interno de Cliente por telefone normalizado. Se o telefone já existir, reutilizar o Cliente e preservar o nome cadastrado. As rotas públicas não retornam o telefone.
- Os dados do formulário ficam em `sessionStorage` durante a sessão e são removidos após a confirmação do pedido.
- QR codes são gerados localmente; o token e os dados do cliente não são enviados a um serviço de terceiros.
- Os produtos de pedidos QR aparecem no KDS mesmo quando não estão marcados individualmente como “A Fazer”; comandas não-QR mantêm o comportamento atual do KDS.

## Arquitetura

### Backend

Adicionar rotas públicas dedicadas sob `/api/pedidos/auto-atendimento`:

- `GET /api/pedidos/auto-atendimento/:mesaToken`: valida um token de mesa ativa e retorna somente o número/nome público da mesa e campos necessários do catálogo de produtos ativos para venda (identificador, nome, categoria, preço e unidade). Não retorna clientes, telefone, estoque interno, custos, fichas técnicas ou dados administrativos.
- `POST /api/pedidos/auto-atendimento`: recebe `{ mesaToken, clienteNome, clienteTelefone, consentimentoWhatsApp, itens: [{ produtoId, quantidade, observacao }] }`. Campos não previstos, como mesa ou preço enviados pelo cliente, não determinam nem sobrescrevem dados do servidor.

Validar nome não vazio e dentro do limite de tamanho, telefone normalizado com pelo menos 10 dígitos e limite superior seguro, `consentimentoWhatsApp === true`, lista não vazia e limitada, quantidades válidas, observações limitadas e produtos ativos. Erros de validação retornam 400; token inexistente/inativo retorna 404.

Cada mesa terá token aleatório criptograficamente seguro e persistido. A API resolve a mesa exclusivamente pelo token; não aceita número ou ID de mesa do body. Tokens devem ser únicos e não serão incluídos em respostas públicas desnecessárias.

O POST executa em transação, seguindo o fluxo de venda existente:

1. Revalidar mesa ativa pelo token.
2. Consultar produtos ativos no banco e calcular preços e snapshots a partir dos dados atuais; nunca confiar em preço do cliente.
3. Normalizar telefone; buscar Cliente existente e reutilizá-lo sem sobrescrever o nome já cadastrado, ou criar um Cliente com o nome e telefone informados. O índice único atual de telefone protege duplicidade.
4. Baixar estoque por meio das regras existentes para impedir pedidos acima do saldo e manter consistência com as comandas.
5. Localizar a comanda QR aberta mais recente da mesa. Se existir, anexar os itens como um novo bloco identificado por cliente e horário; se não existir, criar a comanda. Uma comanda presencial nunca é mesclada. Depois que a comanda QR for fechada, um novo envio inicia outra.
6. Manter os itens na lista única da comanda para preservar os fluxos atuais de estoque, edição, totalização e fechamento. Cada item QR referencia seu bloco, que guarda nome, cliente reutilizado, chave/hash de idempotência e consentimento com horário do servidor.
7. Atualizar o total agregado e salvar o novo bloco na mesma transação. Escritas concorrentes da mesma mesa são serializadas no documento de configuração de mesas, evitando comandas duplicadas ou blocos perdidos.
8. Confirmar transação e responder apenas com sucesso, número/identificador da comanda, status e mesa; nunca devolver telefone.

O endpoint público terá rate limit próprio e limites de payload/itens. O POST aceitará chave de idempotência gerada pelo cliente para evitar duplicidade em reenvios; cada bloco mantém sua chave/hash, uma repetição com a mesma chave e mesmo conteúdo retorna a comanda original sem baixar estoque novamente, e conteúdo divergente retorna conflito.

### Token e QR por mesa

Estender o documento de configuração de mesas para armazenar token público persistente. Mesas existentes receberão token de forma idempotente, sem trocar tokens já emitidos. O cadastro administrativo exibirá o link absoluto formado pela origem atual do frontend e `/cardapio/<token>`, além do QR gerado localmente, com opção de impressão. Mesas inativas não permitem carregar cardápio nem criar pedido.

### Frontend público

Adicionar rota React `/cardapio/:mesaToken` fora de `PrivateRoute`, carregada sob demanda. A primeira tela da rota é o formulário de identificação:

- Nome obrigatório.
- Telefone obrigatório com máscara e validação de pelo menos 10 dígitos.
- Salvar nome/telefone em `sessionStorage` durante a sessão e limpar após pedido confirmado.

Após identificação, carregar o catálogo público, permitir escolher quantidades e observações e apresentar o resumo/preços retornados pelo servidor. O aceite obrigatório deve exibir exatamente: “Aceito receber atualizações do meu pedido por WhatsApp”. O frontend envia `consentimentoWhatsApp: true`; o backend também valida esse campo, não confiando apenas no checkbox. Em caso de erro, preservar carrinho e dados para correção/reenvio, sem expor detalhes internos. Após sucesso, limpar os dados da sessão e mostrar confirmação sem telefone.

### PDV e KDS

O endpoint autenticado de comandas abertas deve incluir comandas QR abertas. A tela de comandas do PDV consultará novamente a lista por polling (intervalo de 15 segundos, alinhado ao KDS atual), sem substituir seleção existente indevidamente.

O endpoint autenticado do KDS incluirá todos os itens das comandas QR abertas, além do comportamento atual para itens `aFazer` das demais comandas. Comandas QR com vários envios serão apresentadas em uma única comanda, com blocos de itens identificados por nome e horário em Comandas e no KDS. O total, recebimento e fechamento continuam únicos por comanda. O card permanece destacado e identificável como QR/mesa; com vários blocos, mostra a mesa e a quantidade de pedidos. O KDS continuará usando o polling existente.

## Privacidade e segurança

- Não expor nome/telefone em endpoint público de consulta ou confirmação; o cadastro de Cliente continua protegido pelas rotas autenticadas existentes.
- Não incluir telefone em query string, token de mesa, link de QR, logs de requisição ou dados de erro.
- Registrar consentimento junto à comanda, não como consentimento global reutilizável no cadastro de Cliente.
- O texto de aceite informa consentimento para atualizações por WhatsApp, mas o envio automatizado está fora do escopo desta entrega; a UI não deve afirmar que mensagens serão enviadas automaticamente.
- Como o requisito torna o aceite obrigatório para enviar o pedido, validar esse vínculo com o encarregado de dados/jurídico antes de produção; consentimento para comunicação deve ser específico, informado e livre, e não se deve presumir que seja condição necessária para comprar.
- Aplicar rate limiting, validação estrita, limite de itens e observações, e idempotência no endpoint público.
- Token da mesa não substitui autorização de ações administrativas; endpoints de cadastro permanecem autenticados.
- Não aceitar preço, mesa ou status enviados pelo cliente.

## Testes e critérios de aceitação

### Backend

- POST sem nome ou telefone retorna 400; telefone com menos de 10 dígitos retorna 400.
- Consentimento ausente/falso retorna 400.
- Token inválido ou mesa inativa não cria Cliente, comanda nem movimentação de estoque.
- Token da URL identifica a mesa; campos de mesa adulterados no body são ignorados.
- Preços ou nomes adulterados no body são ignorados; preço final corresponde ao produto persistido.
- Repetir telefone reutiliza o mesmo Cliente e preserva o nome existente; pedidos mantêm snapshots adequados.
- Erro de estoque/transação não deixa Cliente/comanda parcialmente criados.
- Consentimento fica registrado com timestamp do servidor por pedido.
- Dois envios sequenciais da mesma mesa resultam em uma comanda QR com blocos separados por participante; uma repetição idempotente não cria outro bloco nem baixa estoque novamente.
- Envios concorrentes da mesma mesa, com chaves distintas, permanecem na mesma comanda e não perdem itens; mesas diferentes continuam independentes.
- Comanda presencial não é mesclada com a QR, e uma comanda QR já fechada não recebe novos blocos.
- Resposta pública não contém telefone, nem outros dados privados do Cliente.
- Idempotência impede comandas duplicadas em reenvio.
- O KDS inclui todos os itens QR, mas mantém filtro atual para comandas não-QR.
- Tokens são persistentes, únicos e não são trocados ao salvar mesas já configuradas.

### Frontend e integração

- `/cardapio/:mesaToken` abre sem sessão autenticada e apresenta primeiro o formulário.
- Máscara/validação de telefone, checkbox obrigatório e armazenamento temporário funcionam em desktop/mobile.
- Pedido bem-sucedido limpa `sessionStorage` e exibe confirmação sem telefone.
- A lista do PDV atualiza sem recarregar manualmente e identifica origem QR.
- O detalhe de Comandas e o KDS separam os itens por participante, identificando cada envio pelo nome e horário, sem exibir telefone.
- A tela administrativa mostra link e QR local para cada mesa ativa; mesa inativa não gera pedido.

### Validações de segurança solicitadas

Executar testes automatizados equivalentes aos três cenários:

1. `curl` sem nome/telefone: HTTP 400.
2. `curl` com mesa diferente no body: a comanda fica vinculada somente à mesa associada ao token.
3. `curl` com preço adulterado: preço e total seguem os valores do banco.

Não fazer esses testes contra produção com pedidos reais; usar ambiente de teste e limpar dados de teste.

## Arquivos/superfícies previstos

- `back-end/server.js` e nova rota pública dedicada de pedidos QR.
- `back-end/routes/mesas.js` e `back-end/models/MesasSettings.js` para tokens persistentes.
- `back-end/models/Comanda.js` para origem, consentimento e observação por item.
- Testes unitários e de integração do backend.
- `front-end/src/App.jsx`, nova página/componentes do cardápio e configuração de mesas.
- `front-end/src/pages/Comandas.jsx` e `front-end/src/pages/Kitchen.jsx`.
- Dependência frontend de geração local de QR code, após aprovação do plano de implementação.

## Revisão de consistência

- O status operacional permanece `aberta`; `pendente` representa pagamento, evitando incompatibilidade com fechamento/cancelamento atuais.
- A mesma transação protege criação de Cliente, baixa de estoque e comanda.
- O token da mesa é a única fonte de autoridade para identificar a mesa.
- O consentimento é exigido no servidor e persistido por pedido.
- Cliente encontrado pelo telefone é reutilizado sem sobrescrever o nome cadastrado.
- Os endpoints públicos retornam somente dados de catálogo e confirmação; nenhum telefone é retornado.
- Polling está alinhado ao comportamento já usado pelo KDS e não introduz um serviço de tempo real separado.
- A integração automática com WhatsApp e pagamento online permanecem explicitamente fora do escopo.
