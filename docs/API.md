# API — Sabor de Abraço PDV

Base URL: `https://<deploy>.onrender.com/api` (ou `http://localhost:3001/api` localmente).

## Autenticação
Todas as rotas abaixo (exceto auth e delivery público) exigem **Bearer Token JWT** no header `Authorization`. O token é emitido em `POST /auth/login` e renovado em `POST /auth/refresh`. A renovação usa session generation para invalidar sessões anteriores.

## Rotas

### `/auth` — Autenticação
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Login com `username`, `password` → retorna `{ accessToken, refreshToken }`. |
| POST | `/auth/refresh` | Renova o access token usando o refresh token. |
| POST | `/auth/logout` | Invalida a sessão (deleta cookie `sid`). |
| GET | `/auth/me` | Dados do usuário autenticado. |

### `/comandas` — Comandas (PDV)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/comandas` | Cria uma nova comanda. Body: `{ tipoAtendimento, mesa, clienteId, clienteNome, itens, idTemporario, rascunho }`. |
| GET | `/comandas` | Lista comandas. Query: `?status=aberta\|fechada\|rascunho`. |
| GET | `/comandas/:id` | Detalha uma comanda. |
| PATCH | `/comandas/:id/detalhes` | Atualiza detalhes (cliente, mesa, observação). |
| POST | `/comandas/:id/itens` | Adiciona item à comanda. |
| PATCH | `/comandas/:id/itens/:itemId` | Atualiza quantidade/preco de um item. |
| DELETE | `/comandas/:id/itens/:itemId` | Remove item da comanda. |
| POST | `/comandas/:id/fechar` | Fecha a comanda com pagamento. Body: `{ pagamentos[], taxaEntrega }`. |
| GET | `/comandas/:id/itens-faltando` | Verifica itens sem estoque. |

### `/orders` — Pedidos
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/orders` | Cria um novo pedido. |
| GET | `/orders` | Lista pedidos. Query: `?status`, `?dataInicio`, `?dataFim`, `?clienteId`, `?mesa`. |
| GET | `/orders/:id` | Detalha um pedido (inclui `nfce`). |
| PATCH | `/orders/:id/cancelar` | Cancela um pedido. |
| POST | `/orders/:id/pagamento` | Registra pagamento parcial ou adicional. |

### `/products` — Produtos
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/products` | Lista produtos ativos. |
| GET | `/products/:id` | Detalha um produto. |
| POST | `/products` | Cria produto. |
| PATCH | `/products/:id` | Atualiza produto. |
| DELETE | `/products/:id` | Inativa (soft delete) produto. |

### `/customers` — Clientes
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/customers` | Lista clientes. Query: `?nome`, `?telefone`. |
| GET | `/customers/:id` | Detalha cliente. |
| POST | `/customers` | Cria cliente. |
| PATCH | `/customers/:id` | Atualiza cliente. |

### `/estoque` — Estoque
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/estoque` | Lista produtos com estoque baixo (`listarEstoqueBaixo`). |
| POST | `/estoque/ajustar` | Ajusta estoque manualmente. |
| GET | `/estoque/movimentos` | Lista movimentações (`StockMovement`). |

### `/caixa` — Fechamento de Caixa
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/caixa/abrir` | Abre o caixa. Body: `{ operadorId, senha, denominations }`. |
| POST | `/caixa/fechar` | Fecha o caixa. Body: `{ operadorId, senha }`. |
| GET | `/caixa/status` | Status atual do caixa (aberto/fechado). |
| GET | `/caixa/movimentos` | Movimentações do dia. |

### `/fiscal` — NFC-e
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/fiscal/config` | Verifica se configuração fiscal está completa. |
| POST | `/fiscal/orders/:id/emitir` | Inicia emissão NFC-e (assíncrono). |

### `/delivery` — DeliveryLink
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/delivery/auth/login` | Login de entregador/comércio no DeliveryLink. |
| POST | `/delivery/auth/refresh` | Renova token DeliveryLink. |
| GET | `/delivery/pedidos` | Lista pedidos de entrega. |
| GET | `/delivery/pedidos/:id` | Detalha pedido de entrega. |
| POST | `/delivery/pedidos` | Cria pedido de entrega. |
| PATCH | `/delivery/pedidos/:id/status` | Atualiza status do pedido. |
| POST | `/delivery/webhook` | Webhook de notificações (público). |

### `/mesas` — Mesas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/mesas` | Lista mesas e status (livre/ocupada). |
| PATCH | `/mesas/:id/status` | Alterna status da mesa. |

### `/production` — Produção
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/production` | Itens em produção (cozinha). |
| PATCH | `/production/:id` | Marca item como feito/pronto. |

### `/payment-settings` — Configurações de Pagamento
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/payment-settings` | Get current payment settings (card fees, forms). |
| PATCH | `/payment-settings` | Update payment settings. |

### `/purchases` — Compras
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/purchases` | Lista compras. |
| POST | `/purchases` | Registra nova compra. |
| GET | `/purchases/:id` | Detalha compra. |

### `/despesas` — Despesas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/despesas` | Lista despesas. Query: `?categoria`, `?status`. |
| POST | `/despesas` | Cria despesa. |
| PATCH | `/despesas/:id/pagar` | Marca despesa como paga. |

### `/contas-receber` — Contas a Receber
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/contas-receber` | Lista contas. |
| POST | `/contas-receber` | Cria conta a receber. |
| PATCH | `/contas-receber/:id/pagar` | Registra pagamento. |

### `/dashboard`
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/dashboard` | Dados agregados (vendas do dia, top produtos, status caixa). |

### `/insumos`, `/receitas`, `/contabil`
- `/insumos` — CRUD de insumos (matérias-primas).
- `/receitas` — CRUD de receitas (produtos compostos).
- `/contabil` — DRE (`/contabil/dre`), fluxo de caixa (`/contabil/fluxo-caixa`), comparativo de meses (`/contabil/comparar-meses`), taxas de cartão (`/contabil/taxas-cartao`). Todas requerem role `admin`.

## CORS
Origin permitidas definidas em `back-end/utils/sessionOrigins.js`: inclui domínios Render, `localhost:5173`, `localhost:3000` e `0.0.0.0`.
