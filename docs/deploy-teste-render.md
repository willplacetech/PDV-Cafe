# Deploy de teste: PDV offline e DeliveryLink

O `render.yaml` desta branch prepara dois serviços novos de teste. Nenhum deploy foi executado e nenhum banco real foi acessado durante a preparação. Mantenha a branch `Compras`, os serviços de produção e seus dados separados.

## Antes de criar o Blueprint

1. Publique os arquivos preparados na branch `feature/pwa-offline-sincronizacao` apenas após revisar e autorizar o envio.
2. Use um banco inicialmente vazio chamado exatamente `TesteOffDelivery`, sem importar dados reais. Crie uma credencial MongoDB dedicada com permissão apenas nesse banco.
3. Rotacione a senha MongoDB enviada no chat antes de configurar o teste. Ela não deve ser reutilizada nem adicionada a arquivos, commits ou logs.
4. Abra **New → Blueprint** no Render e selecione esta branch e `render.yaml`. Crie um Blueprint novo; não sincronize este arquivo no Blueprint de produção. Confira que os nomes `pdv-cafe-api-teste-off-delivery` e `pdv-cafe-web-teste-off-delivery` estão livres. Se já existirem, escolha outros nomes de teste e atualize todas as referências `fromService` antes de prosseguir.

## Valores preenchidos somente no Render

| Variável do backend | Valor a fornecer |
| --- | --- |
| `MONGO_URI` | URI da credencial dedicada com `/TesteOffDelivery` antes dos parâmetros de consulta. Preserve as opções de autenticação exigidas pelo provedor. Nunca use a URI de produção. |
| `MONGO_DB_NAME` | Já fixado em `TesteOffDelivery`; prevalece sobre o banco presente na URI. |
| `ADMIN_USERNAME` | Já definido em `admin`. Se preferir outro nome, ajuste antes do primeiro início: entre 2 e 254 caracteres. |
| `ADMIN_PASSWORD` | Senha exclusiva, com pelo menos 12 caracteres e até 72 bytes UTF-8. |
| `DELIVERY_ADMIN_EMAIL` | E-mail válido para o administrador da plataforma DeliveryLink; diferente do nome de usuário PDV. |
| `DELIVERY_ADMIN_PASSWORD` | Outra senha exclusiva, com pelo menos 12 caracteres e até 72 bytes UTF-8. |

As quatro entradas `sync: false` pedem os valores na criação inicial. Em atualizações, ajuste segredos diretamente em Environment do serviço; o Blueprint não solicita novamente nem troca senhas de contas existentes. Nenhuma senha tem valor padrão no arquivo. Os provisionadores existentes criam as contas após a conexão e inicialização da autenticação. Sem `JWT_SECRET`, o backend gera uma chave aleatória e a persiste em `RuntimeSettings` no banco de teste. Ambos os serviços usam Node 22; o backend usa `NODE_ENV=production`.

O banco começa sem dados de negócio, mas a primeira inicialização cria coleções, índices, configurações e os administradores. `MONGO_DB_NAME` seleciona o destino; o isolamento de permissões depende da credencial dedicada. As migrações existentes também executam no banco selecionado; confira o destino antes de iniciar.

## URLs públicas e acessos

O Blueprint usa `fromService` com `envVarKey: RENDER_EXTERNAL_URL` para obter as URLs HTTPS públicas atribuídas pelo Render. `FRONTEND_URL` libera a origem de teste no CORS e `DELIVERY_PUBLIC_URL` monta links de rastreamento. O frontend recebe `API_PUBLIC_URL`; o build acrescenta `/api` e passa o resultado a `VITE_API_URL`. `property: host` aponta para a rede privada e não serve ao navegador. Render não interpola valores dentro do YAML. Consulte a [referência oficial do Blueprint](https://render.com/docs/blueprint-spec) e as [variáveis padrão do Render](https://render.com/docs/environment-variables).

Confira as URLs efetivas nas páginas dos serviços. Se mudar nomes ou domínios, sincronize o Blueprint e refaça o build do frontend, porque a API fica incorporada ao bundle. Para domínio personalizado do frontend, configure a origem e a URL de rastreamento correspondentes no backend.

| Tela no site de teste | Credencial e finalidade |
| --- | --- |
| `/login` | `ADMIN_USERNAME` / `ADMIN_PASSWORD`: perfil `admin` do PDV. Acesso às áreas PDV de administrador, incluindo `/usuarios`, para administrar contas `admin`, `operador`, `cozinha` e `garcom`. |
| `/plataforma` | `DELIVERY_ADMIN_EMAIL` / `DELIVERY_ADMIN_PASSWORD`: perfil `admin_plataforma`, para cadastrar comércios e administrar DeliveryLink. |
| `/admin` | Conta `tenant_admin` do comércio, criada ao cadastrar um comércio pela plataforma. |

PDV e DeliveryLink mantêm perfis e sessões próprios. Para testar integração, cadastre um comércio pela plataforma, associe um usuário PDV de teste a ele e entre novamente no PDV para atualizar o vínculo. Cadastre somente dados fictícios. Não configure WhatsApp nem provedor fiscal de produção no teste.

## Conferência depois de um deploy autorizado

1. Confira que ambos os serviços usam a branch offline e o backend usa `MONGO_DB_NAME=TesteOffDelivery` e a URI dedicada.
2. Confirme a resposta da API pública em `/api`. Falha no provisionamento inicial impede o servidor de escutar; consulte mensagens sem credenciais.
3. Entre no PDV e em `/plataforma` com as respectivas contas. Recarregue `/usuarios` diretamente para conferir o rewrite SPA.
4. No navegador, confira chamadas à API de teste com prefixo `/api`, sem chamadas à produção. Teste instalação PWA, operações suportadas offline e sincronização após reconectar com dados fictícios.
5. Após confirmar a criação das contas, remova as variáveis das senhas iniciais do serviço. Alterar essas variáveis não redefine senhas persistidas; use o fluxo autenticado correspondente.

A preparação local valida sintaxe YAML, nomes, referências e seleção do banco sem rede MongoDB. Disponibilidade dos nomes, permissões MongoDB, aceitação pelo Render e funcionamento no navegador exigem revisão e deploy do teste. O plano gratuito do backend pode suspender por inatividade; considere isso ao avaliar reconexão.
