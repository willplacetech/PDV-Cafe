# Separação do DeliveryLinkHub e entregas locais do Sabor de Abraço

**Status:** desenho aprovado em conversa; aguardando revisão deste documento  
**Data:** 2026-10-09

## Objetivo

Manter a operação de entregas do Sabor de Abraço autônoma dentro do PDV e preparar um projeto DeliveryLinkHub independente, voltado a conectar comércios e entregadores. Os dois produtos podem ter fluxos semelhantes, mas não compartilham execução, banco, usuários, autenticação, credenciais ou dados.

O gerador do Hub será criado, mas não será executado nesta etapa. O usuário informará um destino local quando decidir gerar o projeto. O repositório remoto escolhido é `https://github.com/willplacetech/DeliveryLinkHub.git`, atualmente vazio.

## Decisões aprovadas

- O Sabor continua sendo a fonte de verdade de seus pedidos, histórico, entregadores e configurações de entrega no backend e banco atuais.
- O funcionamento do Sabor não pode chamar, autenticar ou depender da disponibilidade do DeliveryLinkHub.
- As configurações do comércio que pertencem à operação do Sabor ficam na aba Entregas, usando a sessão e o vínculo de comércio existentes no PDV.
- A taxa padrão é um valor inicial para pedidos manuais e pode ser ajustada em cada pedido. Pedidos recebidos de comandas do PDV preservam a taxa informada na comanda.
- A tela de entregador e o rastreio público continuam no aplicativo do Sabor e usam o backend local. A tela do entregador deve seguir a identidade visual do Sabor.
- `/admin`, `/DeliveryAdmin` e `/plataforma` redirecionam para `/entregas`; o acesso à página de gestão continua limitado pelas permissões locais do PDV.
- O Hub será outro aplicativo e banco, sem importação ou sincronização de dados do Sabor. Ele terá gestão própria de comércios/plataforma, entregadores, pedidos e rastreio.
- O Hub terá uma API genérica para receber pedidos de PDVs de terceiros. Essa API não será usada pelo Sabor e não terá conhecimento de comandas, usuários ou modelos específicos do Sabor.
- O script Node.js gerará um projeto Hub completo no caminho local informado, configurará o `origin` do repositório acima e não fará commit nem push.

## Limites e componentes

### PDV Sabor de Abraço

O Sabor retém a experiência integrada já acessível pelo menu Entregas e o backend operacional local. A aba Configurações deve reunir:

- nome, telefone e endereço do comércio;
- taxa padrão de entrega;
- tempo estimado padrão;
- mensagem para o cliente, incluindo o marcador de rastreio já suportado.

O contrato de atualização deve aceitar explicitamente apenas esses campos. Plano, vencimento, identificadores técnicos e credenciais de plataforma não serão editáveis nessa tela. A gravação parcial da configuração não deve apagar campos que não façam parte do formulário.

O formulário de pedido manual usa a taxa padrão como valor inicial e continua permitindo alteração antes do envio. A integração existente de comandas mantém o valor de entrega recebido do PDV, sem substituição silenciosa pela taxa padrão.

O cadastro e despacho de entregadores, fila, histórico, estatísticas, outbox da integração local, autenticação do entregador e endpoints de rastreio continuam locais. A página `/entregador` mantém seu fluxo de login, sessões e permissões atuais, com apresentação visual alinhada ao PDV. `/pedido/:token` continua público e consulta exclusivamente os dados locais de rastreio.

Os painéis standalone de comércio e plataforma não fazem parte da operação do Sabor. As rotas legadas `/admin`, `/DeliveryAdmin` e `/plataforma` apontam para `/entregas`, onde as proteções locais encaminham usuários sem autorização ao login do PDV. Não haverá redirecionamento para o domínio do Hub.

### Projeto DeliveryLinkHub

O projeto gerado é executável independentemente depois que o operador configurar o ambiente. Incluirá frontend React/Vite, API Express, persistência MongoDB, autenticação e sessões próprias, gestão de comércios e plataforma, gestão de entregadores, pedidos, despacho, histórico e rastreio público.

A API genérica de integração:

- autentica credenciais emitidas pelo próprio Hub, com escopo restrito a um comércio e capacidade de rotação/revogação;
- não reutiliza segredo JWT, cookie, conta, modelo, conexão MongoDB ou identificador específico do Sabor;
- associa uma referência externa estável ao comércio autenticado; reenvio da mesma referência e do mesmo conteúdo retorna o pedido existente, enquanto conteúdo conflitante retorna conflito;
- aplica validação, rate limiting e autorização tenant-scoped como nas demais operações do Hub.

O portal manual de comércio continuará disponível como alternativa à integração. A primeira entrega não inclui implantação/hosting ou conexão operacional com o PDV Sabor.

## Gerador do projeto independente

Será adicionado o template completo em `scripts/deliverylink-hub-template/` e o gerador Node.js em `scripts/create-deliverylink-hub.js`. O template é a fonte de código do projeto exportado; após a geração, o destino não dependerá de caminhos ou módulos do Sabor.

O script:

1. aceita `--destination` ou solicita interativamente um caminho local;
2. valida o destino antes de escrever: aceita uma pasta ausente/vazia ou checkout vazio do repositório esperado, mas recusa arquivos existentes, projeto não vazio ou remoto incompatível;
3. copia o template para uma área temporária no mesmo volume e só publica o diretório final após a cópia e a configuração Git bem-sucedidas, evitando deixar um projeto parcial;
4. inicializa Git quando necessário e configura o remoto `origin` para `willplacetech/DeliveryLinkHub`;
5. não instala dependências, cria `.env` com segredos, executa migração, faz commit, push ou chamada de implantação.

O projeto exportado inclui `.env.example`, instruções de instalação/execução, testes e bootstrap do primeiro administrador sem credenciais embutidas. A configuração inicial usa `MONGODB_URI`, `JWT_SECRET`, `HUB_ADMIN_EMAIL`, `HUB_ADMIN_PASSWORD`, `PORT`, `CORS_ORIGIN` e `VITE_API_URL`; os valores reais serão definidos apenas pelo operador no destino. O gerador deve falhar explicitamente em erros de destino, cópia ou Git, sem reportar sucesso parcial.

## Fluxos principais

1. **Configuração Sabor:** usuário autenticado e associado ao comércio abre Entregas; a tela carrega e salva apenas os campos operacionais permitidos no tenant local.
2. **Novo pedido manual Sabor:** a tela preenche a taxa padrão atual; o operador pode alterá-la; o pedido e a taxa escolhida são persistidos localmente.
3. **Comanda Sabor:** a outbox atual mantém seu mecanismo de entrega, referência idempotente e tratamento de reenvio; não faz chamadas ao Hub.
4. **Entregador/rastreio Sabor:** entregador autentica no Sabor; mudanças de status e rastreio usam somente o backend local.
5. **Pedido integrado no Hub:** um PDV de terceiro envia pedido com credencial do Hub e referência externa estável; o Hub valida o tenant, cria ou identifica o pedido idempotentemente e o disponibiliza ao comércio/entregador.
6. **Geração do Hub:** o operador executa o script posteriormente e escolhe o destino. A execução desta geração não faz parte da implementação inicial descrita aqui.

## Segurança, erros e compatibilidade

- Não se copiam sessões existentes para nenhum dos produtos.
- Nenhum segredo de desenvolvimento ou produção entra no template, no script, em `.env.example` ou no Git.
- O Hub não recebe dados do Sabor na geração nem na operação; o endpoint genérico exige credencial própria e escopo de comércio.
- Respostas de validação, autorização, conflito de referência externa e falha de geração permanecem explícitas. Nenhum erro de API ou sistema de arquivos será convertido em sucesso.
- O Sabor não terá URL, fallback ou configuração de disponibilidade do Hub.
- A duplicação de lógica é intencional para independência. Evoluções futuras serão versionadas e testadas em cada produto; não haverá sincronização automática de código ou dados.

## Fora de escopo

- Migrar pedidos, comércios, entregadores ou contas do Sabor para o Hub.
- Integrar o Sabor ao endpoint genérico do Hub.
- Compartilhar banco, autenticação, sessões ou segredos entre os produtos.
- Fazer commit/push ou implantar o Hub durante a execução do gerador.
- Alterar fidelidade, fluxo de fechamento de comandas ou outros módulos do PDV.

## Critérios de aceitação

1. Com o Hub indisponível ou sem configuração de Hub, operações e telas de entrega do Sabor continuam funcionando sem chamadas externas.
2. Um usuário autorizado altera no menu Entregas os dados operacionais acordados; campos de plano/controle técnico permanecem intactos.
3. A taxa padrão aparece inicialmente em pedidos manuais, pode ser alterada e não sobrescreve taxas recebidas de comandas.
4. O acesso local do entregador e o rastreio público continuam operacionais e não compartilham autenticação nem dados com o Hub.
5. Rotas legadas de administração no PDV redirecionam para Entregas e respeitam as permissões do PDV.
6. O projeto gerado roda com seu próprio MongoDB e segredos depois da configuração do `.env`, fornece portal e API genérica tenant-scoped e não contém dependência runtime do Sabor.
7. O script recusa destinos incompatíveis, não sobrescreve projetos, configura apenas o remoto local e não commita nem envia conteúdo.
8. Testes focados cobrem validação e autorização da configuração Sabor, taxa padrão, preservação de comanda, rotas/fluxo do entregador e rastreio, além de isolamento por tenant, credenciais, idempotência e segurança do gerador no Hub.

## Riscos e mitigação

- **Divergência entre implementações:** consequência esperada da independência; mitigar com testes e contratos separados, sem import runtime entre projetos.
- **Dependências ocultas do Hub no código compartilhado atual:** o template deve ter seus próprios modelos, configuração, inicialização e testes; não basta copiar uma rota que importe serviços do PDV.
- **Alteração acidental de campos operacionais ou comerciais:** restringir o endpoint de configuração a uma allowlist e testar que plano/vencimento não mudam.
- **Destino Git já ocupado ou com outro remoto:** validação anterior à cópia e falha sem sobrescrever conteúdo existente.
