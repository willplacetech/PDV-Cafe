# DeliveryLink

## Implementação

- [x] Autenticação de comércio/plataforma e entregador usando JWT existente, autorização consultada no banco e queries restritas por tenant.
- [x] Cadastro de comércios/entregadores, pedidos, transições atômicas com histórico, estatísticas e integração idempotente com PDV.
- [x] Rastreio público por UUID com projeção sem dados sensíveis, SSE com encerramento e polling de contingência.
- [x] Portais /admin, /plataforma, /entregador e /pedido/:token, responsivos e no PWA atual.
- [x] Integração PDV com registro durável e processamento assíncrono, preservando vendas e fila offline.
- [x] WhatsApp com mensagem/link de contingência e integração opcional configurada no servidor.
- [x] Testes de isolamento, autenticação, concorrência/transições, dados públicos e fluxos no navegador; regressões do PDV, lint e build.

## Decisões

Um Express, um MongoDB e o frontend React/Vite existentes. Usuários do comércio e da plataforma reutilizam User; entregadores têm credenciais próprias com bcrypt. O comércio associado ao operador do PDV é configurado pela plataforma, nunca escolhido livremente pelo cliente. Vendas com entrega mantêm os dados numa caixa de saída durável na comanda; um processador cria o pedido de forma idempotente após a venda, sem dependência de SSE/WhatsApp. Entregadores livres recebem pedidos de múltiplos comércios; entregadores vinculados só podem ser despachados pelo seu comércio. O app envia a posição automaticamente a cada 30 segundos enquanto estiver aberto e visível; a posição só aparece no rastreio público durante uma entrega a caminho.

## Operação

1. No ambiente do backend, configure `DELIVERY_ADMIN_EMAIL` e `DELIVERY_ADMIN_PASSWORD` (pelo menos 12 caracteres, até 72 bytes). A primeira conta de plataforma é criada no startup, sem alterar as contas do PDV. Não existe senha padrão. Depois de criada a conta, a senha no ambiente não redefine a senha persistida.
2. Configure `DELIVERY_PUBLIC_URL` com a URL pública do frontend. Em produção, URLs `localhost` são ignoradas e o fallback é `https://pdv-delivery-9j0a.onrender.com`; defina `DELIVERY_PUBLIC_URL` para outro domínio se necessário. Para desenvolvimento, mantenha `FRONTEND_URL=http://localhost:5173` e configure `VITE_API_URL=http://localhost:5000/api` no ambiente do frontend. `FRONTEND_URL` pode conter várias origens separadas por vírgula; `DELIVERY_PUBLIC_URL` deve conter uma única URL.
3. Execute `npm run dev:backend` e `npm run dev:frontend`. Em produção, use os scripts existentes de start/build. Os modelos e índices são inicializados no mesmo MongoDB no startup.
4. Abra `/plataforma`, entre com a conta de plataforma e cadastre um comércio com e-mail e senha inicial do dono. Empresas e entregadores podem ser criados, listados, editados e excluídos; excluir empresa também remove os cadastros Delivery vinculados e desassocia usuários do PDV. A exclusão permanente é bloqueada se houver pedido Delivery relacionado; nesse caso, desative o cadastro para preservar o histórico.
5. Administradores e operadores do PDV, associados ao comércio, entram em `/entregas` pelo menu lateral para acompanhar e despachar pedidos com a sessão JWT do PDV. A tela atualiza a fila automaticamente a cada 15 segundos e também oferece cadastro manual de pedidos, histórico com filtros, reenvio de rastreio pelo WhatsApp, CRUD de entregadores e configurações de tempo/mensagem. Ao fechar uma comanda Delivery, o PDV tenta localizar a entrega criada pela caixa de saída e oferece despacho inline; essa operação não condiciona nem desfaz a venda. O acesso `/admin` continua disponível em modo standalone para o tenant_admin. O app do entregador é `/entregador`: login por telefone/senha, disponibilidade, pedidos atribuídos, mudança de status e atualização GPS automática a cada 30 segundos enquanto o app estiver aberto e visível. Entregadores livres são cadastrados pela plataforma e podem receber pedidos de diversos comércios.
6. Na plataforma, associe cada usuário do PDV ao comércio correspondente. Entre novamente no PDV para atualizar a sessão. Ao marcar “Entrega ao cliente”, preencha cliente, telefone, endereço e taxa. **A taxa é cobrada no caixa**, somada aos produtos, mantida nos recebimentos parciais e no fechamento. O pedido DeliveryLink registra produtos e taxa separados, sem duplicar a cobrança.

Não há migração destrutiva do PDV nem aplicativo nativo. As sessões DeliveryLink têm chaves próprias no localStorage e não sobrescrevem a sessão do PDV. Os portais administrativos usam consulta automática a cada 15 segundos; o rastreio usa SSE, com polling de contingência a cada 15 segundos. O namespace `/api/entregas/...` expõe as mesmas operações de comércio para a sessão PDV e mantém o tenant derivado do JWT. O app envia a posição a cada 30 segundos enquanto estiver aberto e visível; o rastreio público só a mostra durante `a_caminho`, se tiver sido atualizada nos últimos cinco minutos.

### Integração com PDV

O payload `entrega` acompanha a comanda na fila offline já existente. O backend captura o comércio associado ao operador no momento da venda; esse snapshot não muda se o operador for reassociado depois. O processamento roda a cada 15 segundos, tenta novamente após falhas e usa referência única `comanda:<id>` para não duplicar pedidos. Uma entrega com endereço ou vínculo inválido permanece com `entrega.status=erro`; não desfaz nem impede a venda. Corrigir dados já registrados requer intervenção administrativa; o processador nunca escolhe outro comércio automaticamente.

`POST /api/entregas/pedidos/integracao` aceita JWT de operador associado ao comércio ou de sistema, além de `vendaId` (ID da comanda do PDV), `empresaId` (validado contra o comércio do token), `origem`, `itens`, `valorTotal`, `taxaEntrega` e opcionalmente `aguardaPreparo`. O `vendaId` é idempotente por comércio. O caminho legado `/api/pedidos/integracao`, com `idTemporario`, continua aceito. Na integração interna, a caixa de saída só processa a entrega após a comanda ser fechada; produtos `A Fazer` mantêm o pedido `pendente` até a cozinha marcá-los prontos em `/cozinha`, e pedidos sem preparo iniciam `pronto`. A empresa também pode avançar um pedido pendente com `POST /api/entregas/pedidos/:id/pronto`; despacho exige status `pronto`. A plataforma gera credencial de sistema restrita a um comércio por `POST /api/plataforma/tenants/:id/token-integracao` (validade de 30 dias). Guarde a credencial no servidor integrador; ela não dá acesso aos portais nem a outro comércio. API externa de pedidos continua sendo fase 2.

### WhatsApp

Sem provedor, despacho e compartilhamento retornam `link`, `mensagemPronta` e `whatsappUrl`; o portal permite copiar ou abrir WhatsApp. Para envio automático, configure `WHATSAPP_API_URL` com a URL HTTPS do endpoint `/messages` em `graph.facebook.com` e `WHATSAPP_ACCESS_TOKEN` no backend. A mensagem usa a API oficial Cloud e depende das permissões e regras da conta configurada. Falhas mantêm a mensagem para compartilhamento e não bloqueiam a operação. SSE não depende do WhatsApp; notificações push não são configuradas nesta versão.

### Verificação

- `npm test`: regressões do backend e integração DeliveryLink com MongoDB descartável.
- `npm run test:frontend:unit`: regressões de cobrança, carrinho e envio offline.
- `npm run lint` e `npm --prefix front-end run build`.
- Com o frontend em execução: `npm run test:frontend -- --spec tests/e2e/deliverylink.cy.js,tests/e2e/vendas_offline.cy.js,tests/e2e/quantidade_pedido.cy.js,tests/e2e/regressao_segura.cy.js`.

O build divide as páginas em módulos carregados sob demanda para reduzir o carregamento do rastreio público. O tempo final de carregamento depende da rede e da hospedagem e deve ser medido no ambiente publicado. O PWA armazena os arquivos do app; dados privados das APIs continuam usando rede, sem cache de respostas autenticadas.

A regressão financeira também cobre pedidos A Receber: fechar uma venda com crédito na loja e acrescentar produtos conserva a taxa de entrega no total do pedido e no saldo da comanda vinculada.
