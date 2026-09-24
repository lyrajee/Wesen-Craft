export const makeId = (prefix = 'id') => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid || `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const isoNow = () => new Date().toISOString();

const optionalNumber = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function createProductItem(input = {}, {regenerateId = false, now = isoNow()} = {}) {
  const oldCode=String(input.hsCode ?? '');
  const legacySku=!input.sku && oldCode && !/^[0-9.]{4,16}$/.test(oldCode) ? oldCode : '';
  const item = {
    id: !regenerateId && input.id ? String(input.id) : makeId('item'),
    name: String(input.name ?? ''),
    jan: String(input.jan ?? ''),
    sku: String(input.sku ?? legacySku),
    hsCode: legacySku ? '' : oldCode,
    quantity: number(input.quantity ?? input.qty, 1),
    unitPriceJpy: number(input.unitPriceJpy ?? input.price),
    unitWeightKg: number(input.unitWeightKg ?? input.weight),
    unitVolumeM3: number(input.unitVolumeM3 ?? input.volume),
    dutyRate: optionalNumber(input.dutyRate ?? input.duty),
    vatRate: optionalNumber(input.vatRate ?? input.vat),
    customsRateSnapshot: input.customsRateSnapshot && typeof input.customsRateSnapshot === 'object' ? {...input.customsRateSnapshot} : null,
    notes: String(input.notes ?? ''),
    createdAt: !regenerateId && input.createdAt ? String(input.createdAt) : now,
    updatedAt: regenerateId ? now : String(input.updatedAt || now)
  };

  // Non-enumerable aliases preserve the current calculator/UI field names;
  // JSON storage remains canonical and contains no duplicated numeric values.
  const aliases = {
    qty: 'quantity',
    price: 'unitPriceJpy',
    weight: 'unitWeightKg',
    volume: 'unitVolumeM3',
    duty: 'dutyRate',
    vat: 'vatRate'
  };
  for (const [alias, key] of Object.entries(aliases)) {
    Object.defineProperty(item, alias, {enumerable: false, configurable: true, get: () => item[key], set: value => { item[key] = ['dutyRate','vatRate'].includes(key) ? optionalNumber(value) : number(value); }});
  }
  return item;
}
