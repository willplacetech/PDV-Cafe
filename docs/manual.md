# Manual do Sistema PDV MERN

## Visão Geral

O PDV MERN é um sistema completo de ponto de venda e atendimento, construído com a stack MongoDB, Express, React e Node.js.

## Arquitetura

### Back-end (Node.js/Express)
- **Ponto de entrada**: ack-end/server.js`n- **APIs RESTful** organizadas em rotas separadas em ack-end/routes/`n- **Middlewares** em ack-end/middleware/`n- **Modelos** Mongoose em ack-end/models/`n- **Utils** em ack-end/utils/`n
### Front-end (React)
- **Componentes** em ront-end/src/components/`n- **Hooks** em ront-end/src/hooks/`n- **Contexto** em ront-end/src/context/`n
### Rotas Principais
`
nGET  /api                              - Status da API
POST /api/auth/login                   - Login de usuário
GET  /api/auth/me                      - Usuário atual
POST /api/auth/refresh                 - Refresh token
GET  /api/dashboard                    - Dashboard (admin apenas)
GET  /api/urgencias                     - Alertas de urgência
GET  /api/receita-7-dias               - Receita dos últimos 7 dias
``n
## Fluxos Principais

### Autenticação
- Login via /api/auth/login
- Roles: admin, gerente, operador, cozinha, garcom
- Tokens JWT com expiração

### Vendas e Comandas
- Criar, fechar comandas
- Pagamentos parciais tracking
- Status: aberta → fechada

### Delivery
- Pedidos: pendente → pronto → entregue
- Rastreio em tempo real
- WhatsApp automation

## Configurações

### .env
- MONGO_URI
- JWT secrets
- ADMIN_USERNAME/PASSWORD

### Payment Settings
- Taxas de cartão (crédito/debito)
- Formas personalizadas (até 50)

## Dores Saneadas

1. Controle de estoque em tempo real
2. Gestão de comandas e pagamentos parciais
3. Autorização segura de ações críticas
4. Controle de delivery em tempo real
5. Relatórios completos para gestão

## API Endpoints Principais
- /api/auth - Auth
- /api/dashboard - Dashboard
- /api/orders - Pedidos
- /api/delivery - Delivery
- /api/products - Produtos

