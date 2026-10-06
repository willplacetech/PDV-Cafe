# PDV Cafeteria

Base independente do PDV, adaptada para operação de cafeteria.

## Principais diferenças

- Produtos podem ser vendidos por unidade, peso ou volume, com quantidades de até três casas decimais.
- Comandas permitem abrir mesa/balcão, lançar itens e fechar gerando um pedido com baixa de estoque.
- Cada pedido reserva os campos de situação fiscal e a API expõe uma configuração segura em `GET /api/fiscal/config`.

## Fiscal

Nenhum documento fiscal é emitido sem a configuração explícita de um provedor. Defina as variáveis do arquivo `back-end/.env.example` após escolher o emissor e instalar o respectivo adaptador. As credenciais devem permanecer somente no servidor.

## Impressão térmica local

A tela **Configurações → Impressoras** (`/ajustes/impressoras`) configura a impressora e as opções de impressão no próprio navegador. Preferência, dados do estabelecimento, setores e trabalhos pendentes ficam no `localStorage` do dispositivo; o serviço de impressão não envia os documentos ao backend. Vendas concluídas tentam imprimir o cupom e, conforme as opções locais, os pedidos de cozinha separados por setor. Falhas não desfazem nem bloqueiam a venda; os trabalhos ficam disponíveis para reimpressão nesse mesmo dispositivo.

A ordem de tentativa é Bluetooth BLE, USB/Serial e impressão do sistema. Use Chrome em contexto seguro (HTTPS ou localhost) para as APIs de dispositivo. Web Bluetooth não oferece suporte a Bluetooth Clássico SPP. Web Serial acessa portas seriais/USB-serial autorizadas, mas não garante acesso a impressoras USB nativas de classe printer; confirme o modelo e a compatibilidade antes da instalação. A impressão do sistema depende do diálogo e das impressoras configuradas no Android/desktop. Para NFC-e, o DANFE reduzido usa os dados fiscais disponíveis; se o provedor disponibilizar um PDF, ele é aberto pela impressão do sistema.

Para validar o código do módulo, execute `npm --prefix front-end run test:unit` e `npm --prefix front-end run build`. A validação de hardware requer uma impressora compatível: teste conexão e cupom, desconexão durante uma venda, tickets para dois setores, observações de cozinha e impressão local com a aplicação offline.

## Execução local

Em terminais separados:

```bash
cd back-end && npm install && npm start
cd front-end && npm install && npm run dev
```

Crie `back-end/.env` a partir de `.env.example` e informe `MONGO_URI`. Se ainda não existir administrador no banco, configure `ADMIN_PASSWORD` com pelo menos 12 caracteres. Contas existentes são preservadas. `JWT_SECRET` configurado é mantido; quando ausente, uma chave aleatória é persistida no MongoDB. Sessões assinadas com a antiga chave pública precisarão de novo login.

## Deploy no Render

O repositório inclui `render.yaml` para criar o front-end estático e a API Node.js pelo fluxo **New + Blueprint**. No Render, conecte este repositório e informe a variável secreta `MONGO_URI` da instância MongoDB. Para um banco novo, também configure `ADMIN_PASSWORD` com pelo menos 12 caracteres. As URLs configuradas são:

- API: `https://pdv-cafe-api-willplacetech.onrender.com`
- Front-end: `https://sabordabraco.onrender.com`

Após salvar a `MONGO_URI`, o Render executa os dois deploys automaticamente. Não coloque essa URI no GitHub.

## Validação das correções

Execute `npm test`, `npm run test:frontend:unit`, `npm run lint` e `npm --prefix front-end run build`. Os testes de integração usam MongoDB isolado em memória, com checksum de download habilitado.

Com o frontend local rodando, execute `npm run test:frontend -- --spec tests/e2e/regressao_segura.cy.js --config baseUrl=http://127.0.0.1:5173`. Essa especificação intercepta as chamadas de API e não altera o banco real. As outras especificações Cypress dependem do ambiente e dos usuários de teste.

Veja [CORRECOES.md](CORRECOES.md) para os problemas corrigidos e os limites da validação.
