const ESC = 0x1b;
const GS = 0x1d;
const encoder = new TextEncoder();

export class EscPosBuilder {
  constructor({ separatorWidth = 32 } = {}) {
    this.bytes = [];
    this.separatorWidth = separatorWidth;
  }

  append(bytes) {
    for (const byte of bytes) this.bytes.push(byte);
    return this.toUint8Array();
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }

  init() {
    return this.append([ESC, 0x40]);
  }

  text(value) {
    return this.append(encoder.encode(String(value ?? '')));
  }

  bold(enabled = true) {
    return this.append([ESC, 0x45, enabled ? 1 : 0]);
  }

  align(value = 'left') {
    const alignments = { left: 0, center: 1, right: 2 };
    if (!Object.hasOwn(alignments, value)) throw new TypeError(`Alinhamento ESC/POS inválido: ${value}`);
    return this.append([ESC, 0x61, alignments[value]]);
  }

  fontSize(value = 'normal') {
    const sizes = {
      small: [ESC, 0x4d, 0x01, GS, 0x21, 0x00],
      normal: [ESC, 0x4d, 0x00, GS, 0x21, 0x00],
      large: [ESC, 0x4d, 0x00, GS, 0x21, 0x11],
    };
    if (!Object.hasOwn(sizes, value)) throw new TypeError(`Tamanho de fonte ESC/POS inválido: ${value}`);
    return this.append(sizes[value]);
  }

  newline(quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 0) throw new TypeError('Quantidade de linhas inválida');
    return this.append(Array(quantity).fill(0x0a));
  }

  separator() {
    this.text('-'.repeat(this.separatorWidth));
    return this.newline();
  }

  qrcode(value) {
    const data = encoder.encode(String(value ?? ''));
    if (!data.length || data.length > 0xffff - 3) throw new RangeError('Conteúdo do QR code vazio ou muito grande');
    const low = (data.length + 3) & 0xff;
    const high = (data.length + 3) >> 8;
    return this.append([
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
      GS, 0x28, 0x6b, low, high, 0x31, 0x50, 0x30,
      ...data,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30,
    ]);
  }

  cut() {
    return this.append([GS, 0x56, 0x01]);
  }

  beep() {
    return this.append([ESC, 0x42, 0x02, 0x02]);
  }
}
