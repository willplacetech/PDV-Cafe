# ADR-003: Impressão via Web Serial

## Status
Aceito — implementado em `front-end/src/services/impressaoService.js`, `front-end/src/utils/escpos.js`.

## Contexto
O PDV da cafeteria precisa imprimir comprovantes de venda, pedidos para a cozinha e notas de DANFE/NFC-e em impressoras térmicas (ESC/POS). Em um ambiente de cafeteria, impressoras USB/Bluetooth podem ser limitadas; Web Serial oferece conectividade direta com impressoras conectadas via USB a partir do navegador, suportada por Chrome/Edge modernos.

## Decisão

### 1. Estratégia de Conectividade (prioridade)
A escolha de tecnologia de impressão é feita em tempo de execução por `enviar()` em `impressaoService.js`, com a seguinte ordem de tentativa:
1. **Web Bluetooth** (primeiro): `navigator.bluetooth` — usa UUIDs de serviços BLE conhecidos. Erro com mensagem amigável se não suportado.
2. **Web Serial** (segundo): `navigator.serial` — conecta via `requestPort()` → `port.open({ baudRate: 9600 })` → `writer.write(data)`.
3. **`imprimirNoSistema`** (fallback universal): cria um `<iframe>` invisível com `srcdoc=html` e chama `iframe.contentWindow.print()`. Sempre disponível se houver driver de impressora no SO.

### 2. Configuração de Impressora
- Preferência salva em `localStorage` (`pdv_impressora_preferida`) com `tipo: 'ble' | 'usb' | 'sistema'`.
- `conectarImpressora(tipo)`: abre diálogo nativo do navegador para BLE (`requestDevice`) ou Serial (`requestPort`); salva vendorId/productId ou deviceId.
- `reconectarImpressora()`: tenta reconectar usando `bluetooth.getDevices()` ou `serial.getPorts()` — ambos exigem permissão prévia.
- `obterStatusImpressora()`: retorna `{ configurada, conectada, autorizada, preference }`.

### 3. ESC/POS Command Builder
- `front-end/src/utils/escpos.js` expõe a classe `EscPosBuilder` com métodos:
  - `init()` — reset e inicialização da impressora
  - `text(string)` — texto normal
  - `bold(true/false)` — alterna negrito
  - `align('left'|'center'|'right')` — alinhamento
  - `fontSize('small'|'normal'|'large')` — tamanhos pré-definidos
  - `newline(count=1)` — avança linha(s)
  - `separator()` — linha separadora
  - `qrcode(text)` — gera código QR
  - `cut()` — corte de papel
  - `toUint8Array()` — serialização final para escrita binária

### 4. Tipos de Documento
- `imprimirCupomVenda(venda)` — comprovante de venda: itens, totais, formas de pagamento, dados da NFC-e (se `status: 'autorizada'`). Gera ESC/POS + HTML fallback.
- `imprimirPedidoCozinha(pedido)` — tickets por setor (cozinha, etc.). Gera múltiplos jobs ESC/POS por setor.
- `imprimirNFCeDanfe(data)` — DANFE: aceita `data.pdf` (Blob/URL/http) via iframe print, ou monta ESC/POS receipt com chave de acesso, protocolo e QR code.

### 5. [DECISÃO PENDENTE] Polyfill para navegadores sem Web Serial/Web Bluetooth
- Safari e Firefox não suportam `navigator.serial` ou `navigator.bluetooth`. Atualmente cai para `imprimirNoSistema` (iframe + window.print).
- **Sugestão**: adicionar detecção de user-agent e exibir mensagem amigável orientando Chrome/Edge; ou integrar `electron-print` no desktop app se houver build Electron.
- **[DECISÃO PENDENTE]** Não há polyfill implementado — confirmar se deve usar solução nativa (Chrome) ou adicionar fallback WebRTC/hybrid.

### 6. Tratamento de Erros e Recuperação
- `ImpressaoError` com `attempts` (lista de falhas por método) e `pendingId` (para reimpressão).
- Falhas são salvas em `localStorage` (`pdv_impressao_pendente`) para `reimprimirPendente(id)` posterior.
- Limite de chunk BLE: 20 bytes por escrita com delay de 15ms entre chunks.

## Consequências
- **Positivas**: fallback encadeado garante impressão mesmo sem BLE ou Serial; recuperação local de trabalhos pendentes.
- **Negativas**: Web Serial/Web Bluetooth exigem user gesture e HTTPS; Safari/Firefox dependem apenas do fallback de sistema.
- **Risco operacional**: impressoras sem driver no SO só funcionam via BLE/USB — se nenhum fallback disponível, impressão falha.

## Referências
- `front-end/src/services/impressaoService.js` — `imprimirCupomVenda`, `imprimirPedidoCozinha`, `imprimirNFCeDanfe`, `enviar` (fallback chain), `EscPosBuilder` integration
- `front-end/src/utils/escpos.js` — `EscPosBuilder`
- `back-end/models/Order.js` — `nfce.chaveAcesso`, `nfce.pdfBase64`
