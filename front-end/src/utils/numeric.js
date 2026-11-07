export const parseNumericValue = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  const text = value.trim().replace(/\s+/g, '');
  if (!text) return fallback;

  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  let normalized = text;
  if (lastDot >= 0 && lastComma >= 0) {
    if (lastComma > lastDot) {
      if (!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(text)) return fallback;
      normalized = text.replace(/\./g, '').replace(',', '.');
    } else {
      if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)\.\d+$/.test(text)) return fallback;
      normalized = text.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    if ((text.match(/,/g) || []).length > 1) return fallback;
    normalized = text.replace(',', '.');
  } else if ((text.match(/\./g) || []).length > 1) {
    if (!/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(text)) return fallback;
    normalized = text.replace(/\./g, '');
  }

  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
};

export const safeNumber = (value, fallback = 0) =>
  parseNumericValue(value, fallback);

export const isNumericValue = (value) =>
  Number.isFinite(parseNumericValue(value, Number.NaN));

export const quantityStep = (unit) => (unit === 'un' ? '1' : '0.001');

export const quantityMinimum = (unit) => (unit === 'un' ? 1 : 0.001);
