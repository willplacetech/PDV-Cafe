import { branding } from '../config/branding.js';
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
  empresa: { nome: branding.name || 'PDV', cnpj: '', endereco: '', telefone: '' },
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
    throw new Error(`Não foi possível ler a impressora salva: ${error.message}`, { cause: error });
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
    throw new Error(`Não foi possível ler a fila de impressão pendente: ${error.message}`, { cause: error });
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
    const baseEmpresa = { nome: branding.name || 'PDV', cnpj: '', endereco: '', telefone: '' };
    if (!value) {
      return {
        ...DEFAULT_CONFIG,
        empresa: { ...baseEmpresa },
        setores: DEFAULT_CONFIG.setores.map((sector) => ({ ...sector, categorias: [...sector.categorias] })),
      };
    }
    const config = JSON.parse(value);
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('Formato de configuração inválido.');
    const merged = { ...DEFAULT_CONFIG, ...config, empresa: { ...baseEmpresa, ...config.empresa } };
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
    throw new Error(`Não foi possível carregar as configurações de impressão: ${error.message}`, { cause: error });
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
      throw new Error(mensagemConexao(error, 'BLE'), { cause: error });
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
      throw new Error(mensagemConexao(error, 'USB'), { cause: error });
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
    ? ' O trabalho ficou salvo neste dispositivo para reimpressão.'
    : '';
  throw new ImpressaoError(`Não foi possível imprimir.${recovery}`, attempts, pendingId);
}

function money(value) {
  return Number(value || 0).toFixed(2).replace('.', ',');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paperChars(paperWidth) {
  return paperWidth === '58mm' ? 32 : 48;
}

export function montarCupomVenda(venda, { empresa = {}, paperWidth = '80mm' } = {}) {
  const builder = new EscPosBuilder({ charsPerLine: paperChars(paperWidth) });
  const nomeEmpresa = empresa.nome || branding.name || 'PDV';
  builder.align('center').bold(true).text(nomeEmpresa).bold(false).newLine();
  if (empresa.endereco) builder.text(empresa.endereco).newLine();
  if (empresa.telefone) builder.text(`Tel: ${empresa.telefone}`).newLine();
  if (empresa.cnpj) builder.text(`CNPJ: ${empresa.cnpj}`).newLine();
  builder.separator().align('left');
  builder.text(`Pedido: #${venda.numero || ''}`).newLine();
  if (venda.comandaNumero) builder.text(`Comanda: #${venda.comandaNumero}`).newLine();
  builder.text(`Data: ${new Date(venda.createdAt || Date.now()).toLocaleString('pt-BR')}`).newLine();
  if (venda.clienteNome) builder.text(`Cliente: ${venda.clienteNome}`).newLine();
  if (venda.atendente) builder.text(`Atendente: ${venda.atendente}`).newLine();
  builder.separator();
  for (const item of venda.itens || []) {
    const total = Number(item.quantidade || 0) * Number(item.precoUnitario || 0);
    builder.text(`${item.quantidade}x ${item.nome}`).newLine();
    builder.text(`   R$ ${money(item.precoUnitario)}  R$ ${money(total)}`).newLine();
    if (item.modificadores?.length) builder.text(`   ${item.modificadores.join(' | ')}`).newLine();
  }
  builder.separator();
  builder.text(`Subtotal: R$ ${money(venda.subtotal || venda.total)}`).newLine();
  if (Number(venda.taxaEntrega) > 0) builder.text(`Taxa entrega: R$ ${money(venda.taxaEntrega)}`).newLine();
  if (Number(venda.desconto) > 0) builder.text(`Desconto: -R$ ${money(venda.desconto)}`).newLine();
  builder.bold(true).text(`TOTAL: R$ ${money(venda.total)}`).bold(false).newLine();
  if (Array.isArray(venda.pagamentos) && venda.pagamentos.length) {
    builder.separator();
    builder.text('PAGAMENTOS').newLine();
    for (const pagamento of venda.pagamentos) {
      const label = pagamento.rotuloPagamento || paymentLabels[pagamento.tipo] || pagamento.tipo;
      builder.text(`${label}: R$ ${money(pagamento.valorRecebido)}`).newLine();
    }
  }
  if (venda.nfce?.status === 'autorizada') {
    builder.separator().bold(true).text('DOCUMENTO FISCAL').bold(false).newLine();
    if (venda.nfce.chaveAcesso) builder.text(`Chave: ${venda.nfce.chaveAcesso}`).newLine();
    if (venda.nfce.protocolo) builder.text(`Protocolo: ${venda.nfce.protocolo}`).newLine();
    if (venda.nfce.urlDanfe) builder.text(venda.nfce.urlDanfe).newLine();
  }
  builder.separator().align('center').text(nomeEmpresa).newLine().text('Obrigado!').newLine().feed(3).cut();
  const html = buildCupomHtml(venda, empresa);
  return { payload: builder.toUint8Array(), html };
}

function buildCupomHtml(venda, empresa = {}) {
  const nomeEmpresa = escapeHtml(empresa.nome || branding.name || 'PDV');
  const itens = (venda.itens || []).map((item) => {
    const total = Number(item.quantidade || 0) * Number(item.precoUnitario || 0);
    const mods = item.modificadores?.length ? `<small>${escapeHtml(item.modificadores.join(' | '))}</small>` : '';
    return `<div class="linha"><span>${escapeHtml(item.quantidade)}x ${escapeHtml(item.nome)}${mods}</span><b>R$ ${money(total)}</b></div>`;
  }).join('');
  const pags = (venda.pagamentos || []).map((p) => {
    const label = escapeHtml(p.rotuloPagamento || paymentLabels[p.tipo] || p.tipo);
    return `<div class="linha"><span>${label}</span><b>R$ ${money(p.valorRecebido)}</b></div>`;
  }).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;font-family:'Courier New',monospace;font-size:12px}
    body{width:76mm;margin:0;padding:4mm;color:#000}
    .center{text-align:center}.marca{font-size:16px;font-weight:bold}
    .separador{border-top:1px dashed #000;margin:8px 0}
    .linha{display:flex;justify-content:space-between;gap:8px;padding:3px 0}
    .total{border-top:2px solid #000;padding-top:7px;margin-top:6px;font-weight:bold;font-size:14px}
    small{display:block;font-size:10px}
    @media print{@page{margin:0;size:80mm auto}body{margin:4mm}}
  </style></head><body>
  <div class="center marca">${nomeEmpresa}</div>
  ${empresa.endereco ? `<div class="center">${escapeHtml(empresa.endereco)}</div>` : ''}
  ${empresa.telefone ? `<div class="center">Tel: ${escapeHtml(empresa.telefone)}</div>` : ''}
  <div class="separador"></div>
  <div>Pedido: #${escapeHtml(venda.numero)}</div>
  ${venda.comandaNumero ? `<div>Comanda: #${escapeHtml(venda.comandaNumero)}</div>` : ''}
  <div>Data: ${escapeHtml(new Date(venda.createdAt || Date.now()).toLocaleString('pt-BR'))}</div>
  ${venda.clienteNome ? `<div>Cliente: ${escapeHtml(venda.clienteNome)}</div>` : ''}
  <div class="separador"></div>
  ${itens}
  <div class="separador"></div>
  <div class="linha"><span>Subtotal</span><b>R$ ${money(venda.subtotal || venda.total)}</b></div>
  ${Number(venda.taxaEntrega) > 0 ? `<div class="linha"><span>Taxa entrega</span><b>R$ ${money(venda.taxaEntrega)}</b></div>` : ''}
  ${Number(venda.desconto) > 0 ? `<div class="linha"><span>Desconto</span><b>-R$ ${money(venda.desconto)}</b></div>` : ''}
  <div class="linha total"><span>TOTAL</span><b>R$ ${money(venda.total)}</b></div>
  ${pags ? `<div class="separador"></div><div><b>PAGAMENTOS</b></div>${pags}` : ''}
  <div class="separador"></div>
  <div class="center"><b>${nomeEmpresa}</b><br>Obrigado!</div>
  </body></html>`;
}

export function montarPedidosCozinha(pedido, {
  setores = DEFAULT_SECTORS,
  setorPadrao = 'Cozinha',
  categoriasPorProduto = {},
  paperWidth = '80mm',
} = {}) {
  const grupos = new Map();
  for (const sector of setores) grupos.set(sector.nome, []);
  if (!grupos.has(setorPadrao)) grupos.set(setorPadrao, []);

  for (const item of pedido.itens || []) {
    const categoria = categoriasPorProduto[String(item.produtoId || item._id || '')] || item.categoria || '';
    let destino = setorPadrao;
    for (const sector of setores) {
      if (sector.categorias?.includes(categoria)) {
        destino = sector.nome;
        break;
      }
    }
    if (!grupos.has(destino)) grupos.set(destino, []);
    grupos.get(destino).push(item);
  }

  const tickets = [];
  for (const [setor, itens] of grupos.entries()) {
    if (!itens.length) continue;
    const builder = new EscPosBuilder({ charsPerLine: paperChars(paperWidth) });
    builder.align('center').bold(true).text(setor.toUpperCase()).bold(false).newLine();
    builder.text(`Pedido #${pedido.numero || ''}`).newLine();
    if (pedido.comandaNumero) builder.text(`Comanda #${pedido.comandaNumero}`).newLine();
    const mesaNumero = pedido.mesa && typeof pedido.mesa === 'object' ? pedido.mesa.numero : pedido.mesa;
    if (mesaNumero !== undefined && mesaNumero !== null && String(mesaNumero).trim()) {
      builder.text(`Mesa ${mesaNumero}`).newLine();
    }
    builder.separator().align('left');
    for (const item of itens) {
      builder.bold(true).text(`${item.quantidade}x ${item.nome}`).bold(false).newLine();
      if (item.modificadores?.length) builder.text(`  ${item.modificadores.join(', ')}`).newLine();
      if (item.observacao) builder.bold(true).text(`  Obs: ${String(item.observacao).toLocaleUpperCase('pt-BR')}`).bold(false).newLine();
    }
    builder.feed(3).cut();
    const html = `<!DOCTYPE html><html><body style="font-family:monospace;width:76mm;padding:4mm">
      <h3 style="text-align:center">${escapeHtml(setor)}</h3>
      <div>Pedido #${escapeHtml(pedido.numero)}</div>
      ${(itens).map((item) => `<div><b>${escapeHtml(item.quantidade)}x ${escapeHtml(item.nome)}</b></div>`).join('')}
    </body></html>`;
    tickets.push({ setor, payload: builder.toUint8Array(), html });
  }
  return tickets;
}

export async function imprimirCupomVenda(venda, options = {}) {
  const config = options.empresa ? options : { ...carregarConfiguracaoImpressao(), ...options };
  const { payload, html } = montarCupomVenda(venda, {
    empresa: config.empresa || { nome: branding.name || 'PDV' },
    paperWidth: config.paperWidth || '80mm',
  });
  return enviar(payload, html, { ...options, jobType: 'cupom-venda' });
}

export async function imprimirPedidoCozinha(pedido, options = {}) {
  const config = { ...carregarConfiguracaoImpressao(), ...options };
  const tickets = montarPedidosCozinha(pedido, {
    setores: config.setores || DEFAULT_SECTORS,
    setorPadrao: config.setorPadrao || 'Cozinha',
    categoriasPorProduto: options.categoriasPorProduto || {},
    paperWidth: config.paperWidth || '80mm',
  });
  const results = [];
  for (const ticket of tickets) {
    results.push(await enviar(ticket.payload, ticket.html, {
      ...options,
      jobType: `cozinha-${ticket.setor}`,
    }));
  }
  return results;
}

export async function imprimirNFCeDanfe(data, options = {}) {
  const html = data?.html || data?.danfeHtml || '';
  if (!html) throw new Error('DANFE não disponível para impressão.');
  const builder = new EscPosBuilder();
  builder.align('center').text('NFC-e').newLine().text(data?.chave || '').newLine().feed(2).cut();
  return enviar(builder.toUint8Array(), html, { ...options, jobType: 'nfce-danfe' });
}

export async function imprimirTeste(options = {}) {
  const config = { ...carregarConfiguracaoImpressao(), ...options };
  const empresa = config.empresa || { nome: branding.name || 'PDV' };
  const builder = new EscPosBuilder({ charsPerLine: paperChars(config.paperWidth || '80mm') });
  builder.align('center').bold(true).text(empresa.nome || branding.name || 'PDV').bold(false).newLine();
  builder.text('Teste de impressão').newLine().feed(3).cut();
  const html = `<!DOCTYPE html><html><body style="font-family:monospace;text-align:center;padding:12px">
    <h2>${escapeHtml(empresa.nome || branding.name || 'PDV')}</h2><p>Teste de impressão</p></body></html>`;
  return enviar(builder.toUint8Array(), html, { ...options, jobType: 'teste-impressora' });
}
