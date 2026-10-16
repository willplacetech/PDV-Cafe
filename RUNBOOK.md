# Operação e deploy — PDV Café

Atualizado em 16/10/2026. Este procedimento não executa deploy. O `render.yaml`
do repositório descreve um ambiente de teste; confira serviço, branch, banco e
domínios no dashboard antes de aplicar qualquer Blueprint em produção.

## Preparação

1. Confira `git status`, a branch e o commit a publicar. Preserve trabalhos locais.
2. Rode `npm ci --prefix back-end` e `npm ci --prefix front-end`.
3. Rode `npm test`, `npm run test:frontend:unit`, `npm run lint` e
   `npm --prefix front-end run build`. Corrija as falhas antes da publicação.
4. Rode `npm audit --prefix back-end` e `npm audit --prefix front-end`; não publique
   com vulnerabilidades críticas. Revise o diff para não incluir `.env`, senhas,
   certificados ou tokens. Não aplique `audit fix --force` sem revisar a migração.
5. [HUMANO] Confira backup recuperável do MongoDB Atlas, domínio e banco de destino,
   variáveis do Render e acesso ao projeto Sentry. Guarde o SHA anterior para rollback.

## Render

Use dois serviços, conforme o [guia de Express do Render](https://render.com/docs/deploy-node-express-app):

| Serviço | Root directory | Build | Start / publicação |
| --- | --- | --- | --- |
| API Node | `back-end` | `npm ci --omit=dev` | `npm start`; health check `/api` |
| Static Site | `front-end` | `npm ci && npm run build` | `dist` |

Use Node 22. Na API configure `NODE_ENV=production`, `MONGO_URI`, `MONGO_DB_NAME`
quando usado, `JWT_SECRET` aleatório com pelo menos 32 bytes e `FRONTEND_URL` com
a origem exata do frontend. O banco precisa suportar transações (Atlas/replica set).
`ADMIN_USERNAME`/`ADMIN_PASSWORD` servem ao provisionamento inicial, não à edição
de contas existentes. Configure as variáveis Delivery/fiscais somente quando usadas;
os nomes estão em `back-end/.env.example`.

No frontend configure `VITE_API_URL=https://API.onrender.com/api`. Se usar o comando
do Blueprint, preencha `API_PUBLIC_URL`, pois ele monta `VITE_API_URL` durante o build.
Configure o rewrite `/*` → `/index.html` e o header `Cache-Control: no-store` em
`/version.json`. Variáveis `VITE_*` entram no bundle e são públicas: nunca coloque
credenciais nelas. Mudanças nessas variáveis exigem novo build.

Publique API e frontend do mesmo commit, primeiro em teste. Confirme a versão e
os fluxos abaixo antes de repetir nos serviços de produção. A API aceita o header
`X-Autorizacao-Gerente` no CORS. Remova flags antigas de bypass: as ações críticas
sempre exigem autorização, inclusive para administradores.

## Sentry

Configure `SENTRY_DSN` no serviço API e `VITE_SENTRY_DSN` no Static Site, preferindo
projetos separados. Sem DSN o SDK não envia eventos. O backend usa `APP_VERSION`,
ou `RENDER_GIT_COMMIT`, ou a versão do pacote; o frontend usa o SHA emitido pelo Vite.
Para correlacionar releases no Render, deixe `APP_VERSION` vazio ou igual ao SHA.

Os eventos enviam somente ID interno, release/ambiente e tipo/stack sanitizada.
Mensagens de erro são substituídas por texto neutro: mensagens do MongoDB e HTTP
podem conter dados pessoais. Requisições, headers, cookies, bodies, breadcrumbs,
extras e variáveis da stack são descartados. Não há session replay nem tracing.
Erros React capturados pelo ErrorBoundary, erros globais do navegador, erros
globais Node e respostas 5xx da API são capturados. Para um 5xx tratado diretamente
na rota, o evento indica `HTTP 5xx`; erros encaminhados ao middleware mantêm a stack.

Em teste, gere uma exceção no console do navegador e uma exceção em um teste local
da API com DSN de teste. Confira no Sentry release, ID e ausência de dados privados.
Não crie uma rota pública para provocar erros. Entrega remota depende de DSN válido
e conectividade; testes locais de sanitização não comprovam ingestão no Sentry.

## Autorizações e logout

`POST /api/auth/autorizar { senha, acao }` exige sessão de operador autenticado.
Gerente/admin usa a própria senha; operador/garçom pede a senha de um gerente/admin
ativo do mesmo comércio (contas sem comércio usam gerentes sem comércio).
Três senhas incorretas bloqueiam o solicitante por 60 segundos no MongoDB, inclusive
em outras abas/instâncias. A API responde 429, `Retry-After` e `bloqueadoAte`, e grava
o evento `bloqueio_60s` na auditoria. Não registre senhas nos logs.

O JWT dura 300 segundos, tem finalidade específica e é vinculado à ação,
solicitante, sessão e versões de revogação. Não serve como login. O modal global
atende requisições em fila e reutiliza o token em memória até expirar por ação;
logout e troca de sessão invalidam o cache. Sem token válido, a ação retorna 403
com `acao`; o frontend pede a senha e repete a mesma requisição uma única vez,
preservando a chave de idempotência financeira.

| Ação | Operações protegidas |
| --- | --- |
| `cancelar_venda` | Cancelar pedido/comanda |
| `excluir_item` | Excluir item ou reduzir quantidade/peso vendido |
| `alterar_preco` | Preço manual na comanda, preço/custo cadastral de produto/insumo |
| `desconto_acima_10` | Desconto manual maior que 10% do subtotal calculado no servidor |
| `reabrir_comanda` | Reabrir comanda fechada, preservando pedido/recebimentos/estoque |
| `sangria_suprimento` | Movimentos e ajustes de caixa |
| `fechar_caixa`, `reabrir_caixa` | Fechar e reabrir caixa |
| `excluir_produto`, `excluir_insumo`, `excluir_cliente` | Excluir cadastros |
| `alterar_taxas_cartao`, `alterar_configuracao` | Taxas e configuração sensível |
| `criar_usuario`, `editar_usuario`, `desativar_usuario` | Contas PDV, incluindo senha e perfil |

Reabrir comanda fica disponível em Pedidos. Não permite consumo interno, delivery,
pedido ausente/cancelado, NFC-e autorizada/em processamento ou mesa já ocupada.
Recebimentos anteriores continuam válidos; o novo fechamento atualiza o mesmo pedido
e não concede fidelidade novamente. Reabrir caixa preserva um snapshot do fechamento
em `reaberturas`. Não use reabertura para estornar recebimentos ou documentos fiscais.
Cada reabertura incrementa `cicloFechamento`; o frontend inclui esse ciclo no payload
para gerar uma nova operação financeira sem reutilizar o resultado do fechamento anterior.

Logout remove token, identidade, rascunhos/carrinho e caches pessoais do localStorage.
Mantém catálogo e vendas já registradas na fila offline para evitar perda de vendas;
a fila é isolada por usuário/comércio. Rejeição da revogação remota por falta de rede
não impede a limpeza local. Cookies HttpOnly só podem ser revogados no servidor.

## Conferência após deploy

- `/api` responde 200; `/version.json` corresponde ao commit e não fica em cache.
- Login, refresh e logout funcionam nos domínios reais; sem sessão, `/api/auth/me` dá 401.
- Teste em desktop/mobile: cadeado, ação visível no modal, senha própria/de gerente,
  cancelamento do modal, três erros, 60s de espera e reutilização por ação.
- Sem header, chame uma ação crítica e confira 403 e ausência de mutação.
- Faça uma venda, reabra/feche uma comanda e confira que pedido, estoque e recebimentos
  não duplicam. Confira snapshot ao reabrir/fechar caixa.
- Confira ingestão no Sentry com release e ID interno, sem dados sensíveis.
- Saia e entre com outra conta: sem rascunho/token/autorização anterior; fila preservada.

## Incidente e rollback

Anote horário, SHA, rota sem query e ID do evento Sentry. Consulte logs no Render,
auditoria e release no Sentry; não cole senhas, headers, corpos ou dados de clientes.
Se a API falhar, verifique saúde do MongoDB, variáveis, logs de inicialização e CORS.

No Render, abra **Deploys**, selecione o último deploy saudável e use **Rollback**.
Restaure API e frontend compatíveis e repita as verificações. O
[rollback do Render](https://render.com/docs/rollbacks) reaproveita o artefato anterior;
não desfaz alterações no MongoDB. Confira variáveis, rewrites e headers e só reative
autodeploy depois de corrigir a causa. Nunca restaure o banco sobre vendas novas sem
um plano de reconciliação.
