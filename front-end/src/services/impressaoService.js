import { EscPosBuilder } from '../utils/escpos.js';

const PREFERENCE_KEY = 'pdv_impressora_preferida';
const CONFIG_KEY = 'pdv_config_impressao';
const PENDING_KEY = 'pdv_impressao_pendente';
const BLE_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
];
const DEFAULT_SECTORS = [{ nome: 'Cozinha', categorias: [] }];
const paymentLabels = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  credito_loja: 'Crédito na loja',
};
const DEFAULT_CONFIG = {
  paperWidth: '80mm',
  imprimirCupomAutomaticamente: true,
  imprimirCozinhaAutomaticamente: true,
  empresa: { nome: 'SABOR DE ABRAÇO', cnpj: '', endereco: '', telefone: '' },
  setores: [{ nome: 'Cozinha', categorias: [] }],
  setorPadrao: 'Cozinha',
};

let bleDevice = null;
let bleCharacteristic = null;
let bleDisconnectListener = null;
let serialPort = null;
let serialDisconnectListener = null;

export class ImpressaoError extends Error {
  constructor(message, attempts = [], pendingId = null) {
    super(message);
    this.name = 'ImpressaoError';
    this.code = 'PRINT_FAILED';
    this.pending = Boolean(pendingId);
    this.attempts = attempts;
    this.pendingId = pendingId;
  }
}

const storage = () => {
  if (typeof localStorage === 'undefined') throw new Error('O armazenamento local não está disponível neste navegador.');
  return localStorage;
};

export function carregarPreferenciaImpressora() {
  try {
    const value = storage().getItem(PREFERENCE_KEY);
    if (!value) return null;
    const preference = JSON.parse(value);
    if (!preference || !['ble', 'usb', 'sistema'].includes(preference.tipo)) return null;
    return preference;
  } catch (error) {
    throw new Error(`Não foi possível ler a impressora salva: ${error.message}`);
  }
}

function salvarPreferencia(preference) {
  storage().setItem(PREFERENCE_KEY, JSON.stringify(preference));
  return preference;
}

export function listarImpressoesPendentes() {
  try {
    const value = storage().getItem(PENDING_KEY);
    if (!value) return [];
    const jobs = JSON.parse(value);
    if (!Array.isArray(jobs) || jobs.some((job) => !job || typeof job.id !== 'string' || !Array.isArray(job.payload) || typeof job.html !== 'string')) {
      throw new TypeError('A fila local de impressão possui formato inválido.');
    }
    return jobs;
  } catch (error) {
    throw new Error(`Não foi possível ler a fila de impressão pendente: ${error.message}`);
  }
}

function salvarImpressaoPendente(job) {
  const jobs = listarImpressoesPendentes().filter((saved) => saved.id !== job.id);
  jobs.push(job);
  storage().setItem(PENDING_KEY, JSON.stringify(jobs));
  return job.id;
}

export async function reimprimirPendente(id, options = {}) {
  const job = listarImpressoesPendentes().find((saved) => saved.id === id);
  if (!job) throw new Error('Impressão pendente não encontrada neste dispositivo.');
  const result = await enviar(Uint8Array.from(job.payload), job.html, { ...options, jobId: job.id, jobType: job.tipo });
  const remaining = listarImpressoesPendentes().filter((saved) => saved.id !== job.id);
  storage().setItem(PENDING_KEY, JSON.stringify(remaining));
  return result;
}

export function carregarConfiguracaoImpressao() {
  try {
    const value = storage().getItem(CONFIG_KEY);
    if (!value) return { ...DEFAULT_CONFIG, empresa: { ...DEFAULT_CONFIG.empresa }, setores: DEFAULT_CONFIG.setores.map((sector) => ({ ...sector, categorias: [...sector.categorias] })) };
    const config = JSON.parse(value);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Formato de configuração inválido.');
    const merged = { ...DEFAULT_CONFIG, ...config, empresa: { ...DEFAULT_CONFIG.empresa, ...config.empresa } };
    if (!['58mm', '80mm'].includes(merged.paperWidth)
      || typeof merged.imprimirCupomAutomaticamente !== 'boolean'
      || typeof merged.imprimirCozinhaAutomaticamente !== 'boolean'
      || !Array.isArray(merged.setores)
      || typeof merged.setorPadrao !== 'string'
      || !merged.empresa || typeof merged.empresa.nome !== 'string'
      || typeof merged.empresa.cnpj !== 'string' || typeof merged.empresa.endereco !== 'string'
      || typeof merged.empresa.telefone !== 'string'
      || merged.setores.some((sector) => !sector || typeof sector.nome !== 'string' || !sector.nome.trim()
        || !Array.isArray(sector.categorias) || sector.categorias.some((category) => typeof category !== 'string'))
      || new Set(merged.setores.map((sector) => sector.nome.trim().toLocaleLowerCase())).size !== merged.setores.length
      || !merged.setores.some((sector) => sector.nome === merged.setorPadrao)) {
      throw new TypeError('Há opções inválidas na configuração de impressão.');
    }
    return merged;
  } catch (error) {
    throw new Error(`Não foi possível carregar as configurações de impressão: ${error.message}`);
  }
}

export function salvarConfiguracaoImpressao(config) {
  if (!config || !['58mm', '80mm'].includes(config.paperWidth)
    || typeof config.imprimirCupomAutomaticamente !== 'boolean'
    || typeof config.imprimirCozinhaAutomaticamente !== 'boolean'
    || !Array.isArray(config.setores)
    || typeof config.setorPadrao !== 'string'
    || !config.empresa || typeof config.empresa.nome !== 'string' || typeof config.empresa.cnpj !== 'string'
    || typeof config.empresa.endereco !== 'string' || typeof config.empresa.telefone !== 'string'
    || config.setores.some((sector) => !sector || typeof sector.nome !== 'string' || !sector.nome.trim()
      || !Array.isArray(sector.categorias) || sector.categorias.some((category) => typeof category !== 'string'))
    || new Set(config.setores.map((sector) => sector.nome.trim().toLocaleLowerCase())).size !== config.setores.length) {
    throw new TypeError('Revise largura, opções automáticas e setores antes de salvar.');
  }
  if (!config.setores.some((sector) => sector.nome === config.setorPadrao)) {
    throw new TypeError('Escolha um setor padrão que esteja cadastrado.');
  }
  storage().setItem(CONFIG_KEY, JSON.stringify(config));
  return config;
}

export async function conectarImpressora(tipo) {
  if (tipo === 'ble') {
    if (!globalThis.navigator?.bluetooth) {
      throw new Error('Web Bluetooth BLE não está disponível. Use Chrome em uma página HTTPS no Android/desktop; Bluetooth Clássico SPP não é suportado, então tente USB.');
    }
    try {
      const device = await globalThis.navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_SERVICE_UUIDS,
      });
      const characteristic = await descobrirCaracteristicaBLE(device);
      limparPortaSerial();
      definirBLE(device, characteristic);
      const preference = { tipo: 'ble', deviceId: device.id, nome: device.name || 'Impressora BLE' };
      salvarPreferencia(preference);
      return preference;
    } catch (error) {
      throw new Error(mensagemConexao(error, 'BLE'));
    }
  }

  if (tipo === 'usb') {
    if (!globalThis.navigator?.serial) {
      throw new Error('Este navegador não oferece Web Serial. Use o Chrome em um dispositivo compatível ou tente Bluetooth BLE.');
    }
    try {
      const port = await globalThis.navigator.serial.requestPort();
      const info = port.getInfo();
      limparBLE();
      definirPortaSerial(port);
      const preference = {
        tipo: 'usb',
        vendorId: info.usbVendorId ?? null,
        productId: info.usbProductId ?? null,
        nome: nomePorta(info),
      };
      salvarPreferencia(preference);
      return preference;
    } catch (error) {
      throw new Error(mensagemConexao(error, 'USB'));
    }
  }

  if (tipo === 'sistema') {
    limparBLE();
    limparPortaSerial();
    return salvarPreferencia({ tipo: 'sistema', nome: 'Impressão do dispositivo' });
  }
  throw new TypeError('Tipo de impressora inválido.');
}

export function desconectarImpressora() {
  limparBLE();
  limparPortaSerial();
  storage().removeItem(PREFERENCE_KEY);
}

function limparBLE() {
  if (bleDisconnectListener && bleDevice) bleDevice.removeEventListener('gattserverdisconnected', bleDisconnectListener);
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
  bleCharacteristic = null;
  bleDevice = null;
  bleDisconnectListener = null;
}

function limparPortaSerial() {
  if (serialDisconnectListener && globalThis.navigator?.serial) {
    globalThis.navigator.serial.removeEventListener('disconnect', serialDisconnectListener);
  }
  serialPort = null;
  serialDisconnectListener = null;
}

export function obterStatusImpressora() {
  const preference = carregarPreferenciaImpressora();
  if (!preference) return { configurada: false, conectada: false, preference: null };
  const connected = preference.tipo === 'ble'
    ? Boolean(bleDevice?.gatt?.connected && bleCharacteristic)
    : preference.tipo === 'usb'
      ? Boolean(serialPort)
      : true;
  return { configurada: true, conectada: connected, autorizada: Boolean(serialPort), preference };
}

export async function reconectarImpressora() {
  const preference = carregarPreferenciaImpressora();
  if (!preference) return null;
  if (preference.tipo === 'ble') {
    const bluetooth = globalThis.navigator?.bluetooth;
    if (!bluetooth || typeof bluetooth.getDevices !== 'function') return null;
    const devices = await bluetooth.getDevices();
    const device = devices.find((candidate) => candidate.id === preference.deviceId);
    if (!device) return null;
    definirBLE(device, await descobrirCaracteristicaBLE(device));
    return preference;
  }
  if (preference.tipo === 'usb') {
    if (serialPort) return preference;
    const serial = globalThis.navigator?.serial;
    if (!serial) return null;
    const ports = await serial.getPorts();
    const port = ports.find((candidate) => correspondePortaSerial(candidate, preference)) || null;
    definirPortaSerial(port);
    return serialPort ? preference : null;
  }
  return preference;
}

function definirPortaSerial(port) {
  const serial = globalThis.navigator?.serial;
  if (serialDisconnectListener && serial) serial.removeEventListener('disconnect', serialDisconnectListener);
  serialPort = port;
  serialDisconnectListener = null;
  if (port && serial?.addEventListener) {
    serialDisconnectListener = (event) => {
      if (event.port === port) {
        serialPort = null;
        notificarMudancaStatus();
      }
    };
    serial.addEventListener('disconnect', serialDisconnectListener);
  }
}

function definirBLE(device, characteristic) {
  if (bleDevice && bleDevice !== device) limparBLE();
  else if (bleDisconnectListener && bleDevice) bleDevice.removeEventListener('gattserverdisconnected', bleDisconnectListener);
  bleDevice = device;
  bleCharacteristic = characteristic;
  bleDisconnectListener = () => {
    if (bleDevice === device) {
      bleCharacteristic = null;
      notificarMudancaStatus();
    }
  };
  device.addEventListener('gattserverdisconnected', bleDisconnectListener);
}

async function descobrirCaracteristicaBLE(device) {
  const server = await device.gatt.connect();
  const services = [];
  for (const uuid of BLE_SERVICE_UUIDS) {
    try {
      services.push(await server.getPrimaryService(uuid));
    } catch (error) {
      if (error?.name !== 'NotFoundError') throw error;
    }
  }
  for (const service of services) {
    const characteristics = await service.getCharacteristics();
    const writable = characteristics.find((characteristic) => characteristic.properties.write
      || characteristic.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error('A impressora BLE conectou, mas não anunciou um canal de escrita ESC/POS compatível.');
}

function mensagemConexao(error, tipo) {
  if (error?.name === 'NotFoundError') return `Nenhuma impressora ${tipo} foi selecionada. Você pode tentar outro método. Impressoras Bluetooth Clássico SPP não são detectadas por Web Bluetooth BLE.`;
  if (error?.name === 'SecurityError' || error?.name === 'NotAllowedError') {
    return `Permissão ${tipo} negada. Ligue e pareie a impressora nas configurações do dispositivo e tente novamente.`;
  }
  return error?.message || `Não foi possível conectar a impressora ${tipo}.`;
}

function nomePorta(info) {
  const ids = [info.usbVendorId, info.usbProductId].filter(Boolean).map((id) => id.toString(16).toUpperCase().padStart(4, '0'));
  return ids.length ? `USB ${ids.join(':')}` : 'Impressora USB';
}

function correspondePortaSerial(port, preference) {
  if (preference.vendorId == null || preference.productId == null) return false;
  const info = port.getInfo();
  return info.usbVendorId === preference.vendorId && info.usbProductId === preference.productId;
}

async function obterCaracteristicaBLE() {
  const preference = carregarPreferenciaImpressora();
  if (preference?.tipo !== 'ble') throw new Error('Impressora BLE não conectada ou não configurada.');
  if (bleCharacteristic && bleDevice?.gatt?.connected) return bleCharacteristic;
  const bluetooth = globalThis.navigator?.bluetooth;
  if (!bluetooth) throw new Error('Web Bluetooth BLE não é compatível com este navegador. Use Chrome em uma página HTTPS ou tente USB/impressão do sistema.');
  if (typeof bluetooth.getDevices !== 'function') throw new Error('O navegador não consegue recuperar a impressora BLE autorizada. Reconecte-a nas configurações.');
  const devices = await bluetooth.getDevices();
  const device = devices.find((candidate) => candidate.id === preference.deviceId);
  if (!device) throw new Error('A impressora BLE não está autorizada neste navegador. Reconecte-a nas configurações.');
  const characteristic = await descobrirCaracteristicaBLE(device);
  definirBLE(device, characteristic);
  return bleCharacteristic;
}

async function obterPortaSerial() {
  const preference = carregarPreferenciaImpressora();
  if (preference?.tipo !== 'usb') throw new Error('Impressora USB não conectada ou não configurada.');
  if (serialPort) return serialPort;
  const serial = globalThis.navigator?.serial;
  if (!serial) throw new Error('Web Serial não é compatível com este navegador. Tente Chrome em dispositivo compatível ou impressão do sistema.');
  const ports = await serial.getPorts();
  serialPort = ports.find((port) => correspondePortaSerial(port, preference));
  if (serialPort) definirPortaSerial(serialPort);
  if (!serialPort) throw new Error('A porta USB autorizada não está disponível. Reconecte a impressora nas configurações.');
  return serialPort;
}

async function imprimirBLE(data) {
  const characteristic = await obterCaracteristicaBLE();
  const chunkSize = 20;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    if (offset + chunkSize < data.length) await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

async function imprimirUSB(data) {
  const port = await obterPortaSerial();
  try {
    await port.open({ baudRate: 9600 });
    const writer = port.writable?.getWriter();
    if (!writer) {
      await port.close();
      throw new Error('A porta USB não disponibilizou canal de escrita.');
    }
    let failure;
    try {
      await writer.write(data);
    } catch (error) {
      failure = error;
    }
    try {
      writer.releaseLock();
    } catch (error) {
      if (!failure) failure = error;
    }
    try {
      await port.close();
    } catch (error) {
      if (!failure) failure = error;
    }
    if (failure) throw failure;
  } catch (error) {
    serialPort = null;
    notificarMudancaStatus();
    throw error;
  }
}

function notificarMudancaStatus() {
  globalThis.window?.dispatchEvent(new Event('pdv:impressora-status'));
}

export async function imprimirNoSistema(html) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.print !== 'function') {
    throw new Error('A impressão do sistema não está disponível neste ambiente.');
  }
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Impressão do cupom';
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.onload = () => {
      try {
        const printWindow = frame.contentWindow;
        if (!printWindow || typeof printWindow.print !== 'function') throw new Error('O navegador não abriu a janela de impressão.');
        printWindow.onafterprint = () => {
          frame.remove();
          resolve();
        };
        printWindow.focus();
        printWindow.print();
        setTimeout(() => {
          if (frame.isConnected) {
            frame.remove();
            resolve();
          }
        }, 60000);
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.onerror = () => {
      frame.remove();
      reject(new Error('Não foi possível preparar o documento para impressão do sistema.'));
    };
    document.body.appendChild(frame);
    frame.srcdoc = html;
  });
}

async function enviar(payload, html, { onFallback, jobType = 'impressao', jobId } = {}) {
  const attempts = [];
  const steps = [
    ['ble', () => imprimirBLE(payload)],
    ['usb', () => imprimirUSB(payload)],
    ['sistema', () => imprimirNoSistema(html)],
  ];
  for (const [index, [method, operation]] of steps.entries()) {
    try {
      if (index > 0) {
        const previous = attempts.at(-1);
        onFallback?.(`${previous.method.toUpperCase()} indisponível (${previous.message}). Tentando ${method === 'sistema' ? 'impressão do dispositivo' : method.toUpperCase()}.`);
      }
      await operation();
      return { success: true, method };
    } catch (error) {
      attempts.push({ method, message: error?.message || `Falha na impressão ${method}.` });
    }
  }
  let pendingId = jobId;
  try {
    const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pendingId = salvarImpressaoPendente({
      id: jobId || uuid,
      tipo: jobType,
      createdAt: new Date().toISOString(),
      payload: Array.from(payload),
      html,
    });
  } catch (error) {
    attempts.push({ method: 'local', message: `Não foi possível salvar para reimpressão: ${error.message}` });
  }
  const recovery = pendingId
    ? 'Verifique a impressora e tente reimprimir no menu.'
    : 'Não foi possível guardar o trabalho para reimpressão neste dispositivo.';
  throw new ImpressaoError(
    `A impressão falhou. ${recovery} ${attempts.map((attempt) => `${attempt.method}: ${attempt.message}`).join(' | ')}`,
    attempts,
    pendingId,
  );
}

const dinheiro = (value) => Number(value || 0).toFixed(2).replace('.', ',');
const texto = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const escapeHtml = (value) => texto(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const columns = (paperWidth) => paperWidth === '58mm' ? 32 : 48;
const makeBuilder = (paperWidth) => new EscPosBuilder({ separatorWidth: columns(paperWidth) });
const list = (value) => Array.isArray(value) ? value : [];
const line = (builder, label, value, width) => {
  const left = texto(label);
  const right = texto(value);
  const gap = Math.max(1, width - left.length - right.length);
  builder.text(`${left}${' '.repeat(gap)}${right}`);
  builder.newline();
};

export function montarCupomVenda(venda, { empresa = {}, paperWidth = '80mm' } = {}) {
  if (!venda || !Array.isArray(venda.itens)) throw new TypeError('Venda inválida para impressão.');
  const width = columns(paperWidth);
  const builder = makeBuilder(paperWidth);
  builder.init();
  builder.align('center');
  builder.bold(true);
  builder.text(empresa.nome || 'SABOR DE ABRAÇO');
  builder.newline();
  builder.bold(false);
  [empresa.cnpj, empresa.endereco, empresa.telefone].filter(Boolean).forEach((value) => {
    builder.text(texto(value));
    builder.newline();
  });
  builder.align('left');
  builder.separator();
  builder.text(`Pedido: #${texto(venda.numero || venda._id || '')}`);
  builder.newline();
  if (venda.comandaNumero) {
    builder.text(`Comanda: #${texto(venda.comandaNumero)}`);
    builder.newline();
  }
  builder.text(`Data: ${new Date(venda.createdAt || Date.now()).toLocaleString('pt-BR')}`);
  builder.newline();
  builder.separator();
  for (const item of venda.itens) {
    const qtd = Number(item.quantidade || 0);
    const nome = texto(item.nome || item.produtoNome || 'Item');
    const unitario = Number(item.precoUnitario || 0);
    builder.text(`${qtd} x ${nome}`);
    builder.newline();
    line(builder, '  Unitário', `R$ ${dinheiro(unitario)}`, width);
    line(builder, '  Total', `R$ ${dinheiro(qtd * unitario)}`, width);
    for (const note of [...list(item.modificadores), item.observacao].filter(Boolean)) {
      builder.text(`  ${texto(note)}`);
      builder.newline();
    }
  }
  builder.separator();
  line(builder, 'Subtotal', `R$ ${dinheiro(venda.subtotal ?? venda.total)}`, width);
  if (Number(venda.desconto) > 0) line(builder, 'Desconto', `-R$ ${dinheiro(venda.desconto)}`, width);
  if (Number(venda.taxaEntrega) > 0) line(builder, 'Taxa entrega', `R$ ${dinheiro(venda.taxaEntrega)}`, width);
  builder.bold(true);
  line(builder, 'TOTAL', `R$ ${dinheiro(venda.total ?? venda.valorTotal)}`, width);
  builder.bold(false);
  const payments = venda.pagamentos || venda.historicoPagamentos || [];
  if (!Array.isArray(payments)) throw new TypeError('A lista de pagamentos da venda é inválida.');
  payments.forEach((payment) => line(builder, paymentLabels[payment.tipo || payment.formaPagamento] || texto(payment.tipo || payment.formaPagamento || 'Pagamento'), `R$ ${dinheiro(payment.valorRecebido ?? payment.valor)}`, width));
  const nfce = venda.nfce;
  if (nfce?.status === 'autorizada') {
    builder.separator();
    builder.align('center');
    builder.bold(true);
    builder.text('DOCUMENTO FISCAL');
    builder.newline();
    builder.bold(false);
    builder.align('left');
    builder.text(`Chave: ${texto(nfce.chaveAcesso || nfce.chave || '')}`);
    builder.newline();
    if (nfce.urlDanfe) {
      builder.text(`DANFE: ${texto(nfce.urlDanfe)}`);
      builder.newline();
    }
    if (nfce.protocolo) {
      builder.text(`Protocolo: ${texto(nfce.protocolo)}`);
      builder.newline();
    }
    if (nfce.qrCode || nfce.urlDanfe) {
      builder.align('center');
      builder.qrcode(nfce.qrCode || nfce.urlDanfe);
      builder.align('left');
    }
  }
  builder.align('center');
  builder.newline();
  builder.text('Obrigado pela preferência!');
  builder.newline(3);
  builder.cut();
  return builder.toUint8Array();
}

export function montarPedidosCozinha(pedido, {
  setores = DEFAULT_SECTORS,
  paperWidth = '80mm',
  categoriasPorProduto = {},
  setorPadrao,
} = {}) {
  if (!pedido || !Array.isArray(pedido.itens)) throw new TypeError('Pedido inválido para impressão.');
  const validSectors = Array.isArray(setores) && setores.length ? setores : DEFAULT_SECTORS;
  if (validSectors.some((sector) => !sector || typeof sector.nome !== 'string' || !sector.nome.trim())) {
    throw new TypeError('Cada setor de cozinha precisa ter um nome.');
  }
  if (!categoriasPorProduto || typeof categoriasPorProduto !== 'object' || Array.isArray(categoriasPorProduto)) {
    throw new TypeError('O mapeamento de categorias por produto é inválido.');
  }
  if (typeof setorPadrao !== 'undefined' && (typeof setorPadrao !== 'string' || !setorPadrao.trim())) {
    throw new TypeError('O setor padrão precisa ser um nome válido.');
  }
  const groups = new Map();
  for (const item of pedido.itens) {
    const category = item.categoria || item.produto?.categoria || item.produtoId?.categoria
      || categoriasPorProduto[String(item.produtoId?._id || item.produtoId)] || '';
    const sector = validSectors.find((candidate) => candidate.nome === item.setor
      || (Array.isArray(candidate.categorias) && candidate.categorias.includes(category)))
      || validSectors.find((candidate) => candidate.nome === (setorPadrao || 'Cozinha'))
      || validSectors[0];
    if (!groups.has(sector.nome)) groups.set(sector.nome, []);
    groups.get(sector.nome).push(item);
  }
  return [...groups.entries()].map(([sectorName, items]) => {
    const builder = makeBuilder(paperWidth);
    builder.init();
    builder.align('center');
    builder.bold(true);
    builder.fontSize('large');
    builder.text(texto(sectorName).toUpperCase());
    builder.newline();
    builder.fontSize('normal');
    builder.bold(false);
    const channel = pedido.tipoAtendimento === 'delivery' || pedido.entrega ? `DELIVERY — #${texto(pedido.numero || pedido._id || '')}`
      : `Mesa ${texto(pedido.mesa?.numero || pedido.mesa || pedido.numeroMesa || '')}`;
    builder.text(channel);
    builder.newline();
    if (pedido.clienteNome) {
      builder.text(`Cliente: ${texto(pedido.clienteNome)}`);
      builder.newline();
    }
    builder.text(new Date(pedido.createdAt || Date.now()).toLocaleString('pt-BR'));
    builder.newline();
    builder.separator();
    for (const item of items) {
      builder.bold(true);
      builder.text(`${item.quantidade || 1} x ${texto(item.nome || item.produtoNome || 'Item')}`);
      builder.newline();
      builder.bold(false);
      for (const observation of [...list(item.modificadores), item.observacao].filter(Boolean)) {
        builder.align('center');
        builder.bold(true);
        builder.text(`** ${texto(observation).toUpperCase()} **`);
        builder.newline();
        builder.bold(false);
        builder.align('left');
      }
    }
    if (pedido.observacao) {
      builder.separator();
      builder.bold(true);
      builder.text(`OBS: ${texto(pedido.observacao)}`);
      builder.newline();
      builder.bold(false);
    }
    builder.newline(3);
    builder.cut();
    return { setor: sectorName, itens: items, data: builder.toUint8Array() };
  });
}

function htmlCupom(venda, { empresa = {}, paperWidth = '80mm' } = {}) {
  const itemRows = venda.itens.map((item) => {
    const notes = [...list(item.modificadores), item.observacao].filter(Boolean)
      .map((note) => `<small>${escapeHtml(note)}</small>`).join('');
    return `<div><b>${escapeHtml(item.quantidade)} x ${escapeHtml(item.nome || item.produtoNome || 'Item')}</b><div class="line"><span>Unitário</span><span>R$ ${dinheiro(item.precoUnitario)}</span></div><div class="line"><span>Total</span><span>R$ ${dinheiro(Number(item.quantidade) * Number(item.precoUnitario))}</span></div>${notes}</div>`;
  }).join('<hr>');
  const payments = list(venda.pagamentos || venda.historicoPagamentos)
    .map((payment) => `<div class="line"><span>${escapeHtml(paymentLabels[payment.tipo || payment.formaPagamento] || payment.tipo || payment.formaPagamento || 'Pagamento')}</span><span>R$ ${dinheiro(payment.valorRecebido ?? payment.valor)}</span></div>`)
    .join('');
  const nfce = venda.nfce?.status === 'autorizada' ? `<hr><h3>DOCUMENTO FISCAL</h3><p>Chave: ${escapeHtml(venda.nfce.chaveAcesso || venda.nfce.chave || '')}</p>${venda.nfce.urlDanfe ? `<p>DANFE: ${escapeHtml(venda.nfce.urlDanfe)}</p>` : ''}${venda.nfce.protocolo ? `<p>Protocolo: ${escapeHtml(venda.nfce.protocolo)}</p>` : ''}<p>QR Code: ${escapeHtml(venda.nfce.qrCode || venda.nfce.urlDanfe || '')}</p>` : '';
  const width = paperWidth === '58mm' ? '54mm' : '76mm';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Cupom</title><style>body{font:12px monospace;width:${width};margin:0;padding:3mm;color:#000}h2,h3,p{text-align:center;margin:4px 0;overflow-wrap:anywhere}.line{display:flex;justify-content:space-between;gap:4px;margin:4px 0}small{display:block;font-weight:bold;text-align:center}hr{border:0;border-top:1px dashed #000}.total{font-size:15px;font-weight:bold;border-top:2px solid #000;padding-top:6px}@page{margin:0;size:${paperWidth} auto}</style></head><body><h2>${escapeHtml(empresa.nome || 'SABOR DE ABRAÇO')}</h2><p>${escapeHtml(empresa.cnpj || '')}<br>${escapeHtml(empresa.endereco || '')}<br>${escapeHtml(empresa.telefone || '')}</p><hr><div>Pedido: #${escapeHtml(venda.numero || venda._id || '')}</div>${venda.comandaNumero ? `<div>Comanda: #${escapeHtml(venda.comandaNumero)}</div>` : ''}<div>Data: ${escapeHtml(new Date(venda.createdAt || Date.now()).toLocaleString('pt-BR'))}</div><hr>${itemRows}<hr><div class="line"><span>Subtotal</span><b>R$ ${dinheiro(venda.subtotal ?? venda.total)}</b></div>${Number(venda.desconto) > 0 ? `<div class="line"><span>Desconto</span><b>-R$ ${dinheiro(venda.desconto)}</b></div>` : ''}${Number(venda.taxaEntrega) > 0 ? `<div class="line"><span>Taxa entrega</span><b>R$ ${dinheiro(venda.taxaEntrega)}</b></div>` : ''}<div class="line total"><span>TOTAL</span><b>R$ ${dinheiro(venda.total ?? venda.valorTotal)}</b></div>${payments ? `<hr><h3>PAGAMENTOS</h3>${payments}` : ''}${nfce}<hr><p>Obrigado pela preferência!</p></body></html>`;
}

export async function imprimirCupomVenda(venda, options = {}) {
  const payload = montarCupomVenda(venda, options);
  return enviar(payload, htmlCupom(venda, options), { ...options, jobType: `cupom-${venda.numero || venda._id || 'venda'}` });
}

export async function imprimirPedidoCozinha(pedido, options = {}) {
  const tickets = montarPedidosCozinha(pedido, options);
  const results = [];
  const failedTickets = [];
  for (const ticket of tickets) {
    const width = options.paperWidth === '58mm' ? '54mm' : '76mm';
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px monospace;width:${width};overflow-wrap:anywhere}h2{text-align:center}li{margin:12px 0;font-weight:bold}.obs{font-size:18px;text-align:center}</style></head><body><h2>${escapeHtml(ticket.setor)}</h2><h3>${escapeHtml(pedido.tipoAtendimento === 'delivery' || pedido.entrega ? `DELIVERY — #${pedido.numero || ''}` : `Mesa ${pedido.mesa?.numero || pedido.mesa || pedido.numeroMesa || ''}`)}</h3><p>${escapeHtml(new Date(pedido.createdAt || Date.now()).toLocaleString('pt-BR'))}</p><ul>${ticket.itens.map((item) => `<li>${escapeHtml(item.quantidade)} x ${escapeHtml(item.nome || item.produtoNome)}${[...list(item.modificadores), item.observacao].filter(Boolean).map((observation) => `<div class="obs">** ${escapeHtml(observation)} **</div>`).join('')}</li>`).join('')}</ul>${pedido.observacao ? `<p class="obs">OBS: ${escapeHtml(pedido.observacao)}</p>` : ''}</body></html>`;
    try {
      results.push({ setor: ticket.setor, ...(await enviar(ticket.data, html, { ...options, jobType: `cozinha-${ticket.setor}-${pedido.numero || pedido._id || 'pedido'}` })) });
    } catch (error) {
      failedTickets.push(error);
    }
  }
  if (failedTickets.length) {
    const attempts = failedTickets.flatMap((error) => error.attempts || []);
    throw new ImpressaoError(
      `${failedTickets.length} setor(es) não foram impressos. Consulte as impressões pendentes para reimprimir.`,
      attempts,
      failedTickets[0].pendingId,
    );
  }
  return results;
}

export async function imprimirNFCeDanfe(data, options = {}) {
  if (!data) throw new TypeError('Dados da NFC-e ausentes.');
  if (data.pdf) {
    const isBlob = typeof Blob !== 'undefined' && data.pdf instanceof Blob;
    const pdfUrl = isBlob ? URL.createObjectURL(data.pdf) : String(data.pdf);
    if (!isBlob && !/^(https?:|blob:|data:application\/pdf(?:;|,))/i.test(pdfUrl)) {
      throw new TypeError('O PDF da NFC-e precisa usar uma URL HTTP(S), Blob ou data:application/pdf.');
    }
    const html = `<!doctype html><html><body style="margin:0"><iframe title="DANFE NFC-e" src="${escapeHtml(pdfUrl)}" style="border:0;width:100vw;height:100vh"></iframe></body></html>`;
    try {
      await imprimirNoSistema(html);
      return { success: true, method: 'sistema' };
    } finally {
      if (isBlob) URL.revokeObjectURL(pdfUrl);
    }
  }
  const receipt = {
    numero: data.numero || data.nfce?.numero,
    itens: [],
    subtotal: data.total || data.nfce?.total || 0,
    total: data.total || data.nfce?.total || 0,
    nfce: data.nfce || data,
  };
  const builder = makeBuilder(options.paperWidth || '80mm');
  builder.init();
  builder.align('center');
  builder.bold(true);
  builder.text('DANFE NFC-e');
  builder.newline();
  builder.bold(false);
  builder.text(`Nº ${texto(receipt.nfce.numero || receipt.numero || '')}`);
  builder.newline();
  builder.text(`Chave: ${texto(receipt.nfce.chaveAcesso || receipt.nfce.chave || '')}`);
  builder.newline();
  builder.text(`Protocolo: ${texto(receipt.nfce.protocolo || '')}`);
  builder.newline();
  if (receipt.nfce.qrCode || receipt.nfce.urlDanfe) builder.qrcode(receipt.nfce.qrCode || receipt.nfce.urlDanfe);
  builder.newline(3);
  builder.cut();
  const html = `<!doctype html><html><body style="font:12px monospace;width:76mm"><h2>DANFE NFC-e</h2><p>Chave: ${escapeHtml(receipt.nfce.chaveAcesso || receipt.nfce.chave || '')}</p><p>Protocolo: ${escapeHtml(receipt.nfce.protocolo || '')}</p><p>QR: ${escapeHtml(receipt.nfce.qrCode || receipt.nfce.urlDanfe || '')}</p></body></html>`;
  return enviar(builder.toUint8Array(), html, { ...options, jobType: `nfce-${receipt.numero || 'danfe'}` });
}

export async function imprimirTeste(options = {}) {
  const builder = makeBuilder(options.paperWidth || '80mm');
  builder.init();
  builder.align('center');
  builder.bold(true);
  builder.text('TESTE DE IMPRESSORA');
  builder.newline();
  builder.bold(false);
  builder.separator();
  builder.text('Bluetooth BLE / USB');
  builder.newline();
  builder.text(new Date().toLocaleString('pt-BR'));
  builder.newline(3);
  builder.cut();
  const html = '<!doctype html><html><body style="font:14px monospace;text-align:center"><h2>TESTE DE IMPRESSORA</h2><hr>Bluetooth BLE / USB</body></html>';
  return enviar(builder.toUint8Array(), html, { ...options, jobType: 'teste-impressora' });
}
