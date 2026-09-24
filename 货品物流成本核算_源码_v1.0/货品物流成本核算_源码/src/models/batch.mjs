import {createProductItem, isoNow, makeId} from './product.mjs';
import {createChargeLine} from './chargeLine.mjs';
import {createFreightQuote} from './quote.mjs';

export const BATCH_SCHEMA_VERSION = 2;
export const BATCH_STATUSES = [
  'draft', 'waiting_quote', 'route_confirmed', 'booked', 'departed', 'in_transit',
  'arrived', 'customs', 'released', 'domestic_delivery', 'warehouse_received', 'settled'
];

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function createFXSnapshot(pair, value = {}) {
  const rate = number(value.rate, pair === 'JPY_CNY' ? 0.048 : 7.2);
  return {
    pair,
    rate,
    source: value.source == null ? 'Default' : String(value.source),
    timestamp: value.timestamp ? String(value.timestamp) : null,
    mode: ['live', 'manual', 'locked'].includes(value.mode) ? value.mode : 'manual'
  };
}

export function createBatch(input = {}, {now = isoNow(), regenerateId = false} = {}) {
  const exchangeRates = input.exchangeRates || {};
  const settings = input.declarationSettings || input.estimatedCosts || {};
  const legacyRoute = input.selectedRoute === 'ddp' ? 'ddp' : input.legacyRoute || null;
  const selectedRoute = input.selectedRoute === 'ddp' ? null : input.selectedRoute === 'sea' ? 'lcl' : ['air','lcl','fcl'].includes(input.selectedRoute) ? input.selectedRoute : input.selectedRoute == null && 'selectedRoute' in input ? null : 'air';
  const batch = {
    ...input,
    id: !regenerateId && input.id ? String(input.id) : makeId('batch'),
    schemaVersion: BATCH_SCHEMA_VERSION,
    batchNo: String(input.batchNo ?? ''),
    name: String(input.name ?? '新建进口批次'),
    status: BATCH_STATUSES.includes(input.status) ? input.status : 'draft',
    supplier: String(input.supplier ?? ''),
    purchaseDate: String(input.purchaseDate ?? ''),
    originCountry: String(input.originCountry ?? 'Japan'),
    originPort: String(input.originPort ?? ''),
    destinationCountry: String(input.destinationCountry ?? 'China'),
    destinationPort: String(input.destinationPort ?? 'Shanghai'),
    etd: input.etd ? String(input.etd) : '',
    eta: input.eta ? String(input.eta) : '',
    items: Array.isArray(input.items) ? input.items.map(item => createProductItem(item, {regenerateId})) : [],
    exchangeRates: {
      JPY_CNY: createFXSnapshot('JPY_CNY', exchangeRates.JPY_CNY || {rate: input.fxRate}),
      USD_CNY: createFXSnapshot('USD_CNY', exchangeRates.USD_CNY || {rate: input.usdRate})
    },
    declarationSettings: {
      dutyRate: number(settings.dutyRate, 10),
      vatRate: number(settings.vatRate, 13),
      otherFee: number(settings.otherFee, 0)
    },
    quotes: Array.isArray(input.quotes) ? input.quotes.map(quote => createFreightQuote({...quote,batchId:input.id||quote.batchId})) : [],
    selectedQuoteId: input.selectedQuoteId ? String(input.selectedQuoteId) : null,
    selectedRoute,
    legacyRoute,
    fcl: {containerType: String(input.fcl?.containerType || '20GP'), chargeLines: Array.isArray(input.fcl?.chargeLines) ? input.fcl.chargeLines.map(createChargeLine) : []},
    allocationBasis: ['weight','volume','value','quantity','custom'].includes(input.allocationBasis) ? input.allocationBasis : null,
    allocationPercentages: input.allocationPercentages && typeof input.allocationPercentages === 'object' ? {...input.allocationPercentages} : {},
    tracking: input.tracking && typeof input.tracking === 'object' ? {...input.tracking} : {},
    customs: input.customs && typeof input.customs === 'object' ? {...input.customs} : {},
    estimatedCosts: input.estimatedCosts && typeof input.estimatedCosts === 'object' ? {...input.estimatedCosts} : {},
    actualCosts: input.actualCosts && typeof input.actualCosts === 'object' ? {...input.actualCosts} : {},
    notes: String(input.notes ?? ''),
    archivedAt: input.archivedAt ? String(input.archivedAt) : null,
    createdAt: !regenerateId && input.createdAt ? String(input.createdAt) : now,
    updatedAt: regenerateId ? now : String(input.updatedAt || now)
  };
  return batch;
}

export function createInitialBatch(seed = {}, now = isoNow()) {
  return createBatch({
    name: seed.name || '新建进口批次',
    status: 'draft',
    items: seed.items || [],
    exchangeRates: seed.exchangeRates,
    declarationSettings: seed.declarationSettings,
    selectedRoute: seed.selectedRoute || 'air'
  }, {now});
}

export function duplicateBatch(source, name, now = isoNow()) {
  return createBatch({
    ...source,
    id: undefined,
    name,
    batchNo: '',
    status: 'draft',
    items: source.items.map(item => ({...item, id: undefined, createdAt: undefined, updatedAt: undefined})),
    quotes: [],
    selectedQuoteId: null,
    selectedRoute: source.selectedRoute === 'fcl' ? null : source.selectedRoute,
    legacyRoute: null,
    tracking: {},
    customs: {},
    estimatedCosts: {},
    actualCosts: {},
    archivedAt: null
  }, {now, regenerateId: true});
}

export function createEmptyBatch(name = '新建进口批次') {
  return createInitialBatch({name, items: []});
}

export function createNextBatchNo(batches, date = new Date()) {
  const period = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `WESEN-${period}-`;
  const used = new Set(batches.map(batch => batch.batchNo).filter(value => value.startsWith(prefix)));
  let suffix = 1;
  while (used.has(`${prefix}${String(suffix).padStart(3, '0')}`)) suffix++;
  return `${prefix}${String(suffix).padStart(3, '0')}`;
}

