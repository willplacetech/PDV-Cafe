import test from 'node:test';
import assert from 'node:assert/strict';
import { installNumberInputWheelGuard } from '../src/utils/numberInputWheelGuard.js';

function createDocument(activeElement) {
  const listeners = new Map();
  return {
    activeElement,
    addEventListener: (type, listener, options) => listeners.set(type, { listener, options }),
    removeEventListener: (type, listener, capture) => {
      const current = listeners.get(type);
      if (current?.listener === listener && (current.options === true || current.options?.capture) === capture) {
        listeners.delete(type);
      }
    },
    dispatch: (type, event) => listeners.get(type)?.listener(event),
    listeners,
  };
}

test('desfoca o input numérico focado ao receber rolagem sem cancelar o scroll', () => {
  let blurCount = 0;
  const input = { type: 'number', blur: () => { blurCount += 1; } };
  const documentRef = createDocument(input);
  installNumberInputWheelGuard(documentRef);
  let defaultPrevented = false;

  documentRef.dispatch('wheel', {
    target: input,
    preventDefault: () => { defaultPrevented = true; },
  });

  assert.equal(blurCount, 1);
  assert.equal(defaultPrevented, false);
  assert.equal(documentRef.listeners.get('wheel').options.passive, true);
});

test('não altera outros alvos nem desfoca um input que não está focado', () => {
  let blurCount = 0;
  const input = { type: 'number', blur: () => { blurCount += 1; } };
  const documentRef = createDocument({ type: 'text' });
  installNumberInputWheelGuard(documentRef);

  documentRef.dispatch('wheel', { target: input });
  documentRef.dispatch('wheel', { target: { type: 'text' } });

  assert.equal(blurCount, 0);
});

test('remove o listener global ao executar a função de limpeza', () => {
  const documentRef = createDocument(null);
  const cleanup = installNumberInputWheelGuard(documentRef);

  cleanup();

  assert.equal(documentRef.listeners.has('wheel'), false);
});
