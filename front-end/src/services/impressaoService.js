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
  empresa: { nome: 'PDV', cnpj: '', endereco: '', telefone: '' },
  setores: [{ nome: 'Cozinha', categorias: [] }],
  setorPadrao: 'Cozinha',
};
