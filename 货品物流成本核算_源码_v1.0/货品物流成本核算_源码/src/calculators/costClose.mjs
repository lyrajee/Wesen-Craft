import {allocateCost} from './allocation.mjs';
import {isoNow} from '../models/product.mjs';

export const COST_CLOSE_CATEGORIES = [
  'international', 'insurance', 'duty', 'consumptionTax', 'vat', 'domestic', 'other'
];

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const finite = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const sum = values => values.reduce((total, value) => total + value, 0);

function selectedQuote(batch) {
  return batch.quotes?.find(quote => quote.id === batch.selectedQuoteId) || null;
}

export function createEstimatedCostSnapshot({batch, result, now = isoNow()}) {
  if (!result?.valid) throw Object.assign(new Error('Estimated landed cost is unavailable'), {code: result?.warning || 'ESTIMATE_UNAVAILABLE'});
  const totals = result.totals;
  return {
    capturedAt: now,
    source: clone(result.source),
    goodsValue: Number(totals.purchase),
    international: Number(totals.international),
    insurance: Number(totals.insurance),
    duty: Number(totals.duty),
    consumptionTax: Number(totals.consumptionTax),
    vat: Number(totals.vat),
    domestic: Number(totals.domestic),
    other: Number(totals.other),
    total: Number(totals.total),
    routeSnapshot: {
      selectedRoute: batch.selectedRoute,
      originCountry: batch.originCountry,
      originPort: batch.originPort,
      destinationCountry: batch.destinationCountry,
      destinationPort: batch.destinationPort
    },
    quoteSnapshot: clone(selectedQuote(batch)),
    fxSnapshot: clone(batch.exchangeRates),
    allocationBasis: result.basis,
    itemCosts: result.rows.map(row => ({
      itemId: row.itemId,
      name: row.name,
      sku: row.sku,
      quantity: Number(row.quantity),
      purchase: Number(row.purchase),
      international: Number(row.international),
      insurance: Number(row.insurance),
      duty: Number(row.duty),
      consumptionTax: Number(row.consumptionTax),
      vat: Number(row.vat),
      domestic: Number(row.domestic),
      other: Number(row.other),
      total: Number(row.total),
      unitCost: Number(row.unitCost)
    }))
  };
}

export function createActualCosts(input = {}, {now = isoNow()} = {}) {
  return {
    ...input,
    international: finite(input.international),
    insurance: finite(input.insurance),
    duty: finite(input.duty),
    consumptionTax: finite(input.consumptionTax),
    vat: finite(input.vat),
    domestic: finite(input.domestic),
    other: finite(input.other),
    lines: Array.isArray(input.lines) ? input.lines.map(line => ({
      id: String(line.id || ''),
      name: String(line.name || ''),
      category: COST_CLOSE_CATEGORIES.includes(line.category) ? line.category : 'other',
      amount: finite(line.amount),
      note: String(line.note || '')
    })) : [],
    updatedAt: input.updatedAt ? String(input.updatedAt) : now
  };
}

export function calculateActualCostSummary({estimatedCosts = {}, actualCosts = {}}) {
  const goodsValue = finite(estimatedCosts.goodsValue);
  const normalized = createActualCosts(actualCosts, {now: actualCosts.updatedAt || isoNow()});
  const invalidCategory = COST_CLOSE_CATEGORIES.find(key => normalized[key] == null || normalized[key] < 0);
  const invalidLine = normalized.lines.find(line => !line.id || !line.name.trim() || line.amount == null || line.amount < 0);
  if (goodsValue == null || goodsValue <= 0) return {valid: false, warning: 'INVALID_GOODS_VALUE', goodsValue, totals: null};
  if (invalidCategory) return {valid: false, warning: 'INCOMPLETE_ACTUAL_COSTS', field: invalidCategory, goodsValue, totals: null};
  if (invalidLine) return {valid: false, warning: 'INVALID_ACTUAL_LINE', lineId: invalidLine.id, goodsValue, totals: null};

  const totals = Object.fromEntries(COST_CLOSE_CATEGORIES.map(key => [key, normalized[key]]));
  for (const line of normalized.lines) totals[line.category] += line.amount;
  totals.goodsValue = goodsValue;
  totals.total = goodsValue + sum(COST_CLOSE_CATEGORIES.map(key => totals[key]));
  return {valid: true, warning: null, goodsValue, totals, normalized};
}

export function compareCostSnapshots(estimatedCosts = {}, actualSummary = null) {
  const actual = actualSummary?.valid ? actualSummary.totals : actualSummary?.totals || {};
  return ['goodsValue', ...COST_CLOSE_CATEGORIES, 'total'].map(key => {
    const estimated = finite(estimatedCosts[key]);
    const actualValue = finite(actual[key]);
    const variance = estimated == null || actualValue == null ? null : actualValue - estimated;
    const variancePercent = variance == null || estimated === 0 ? null : variance / estimated * 100;
    return {key, estimated, actual: actualValue, variance, variancePercent};
  });
}

export function upliftPercentage(total, goodsValue) {
  const totalValue = finite(total);
  const goods = finite(goodsValue);
  return totalValue == null || goods == null || goods <= 0 ? null : (totalValue - goods) / goods * 100;
}

export function allocateActualItemCosts({batch, actualSummary}) {
  if (!actualSummary?.valid) return {valid: false, warning: actualSummary?.warning || 'ACTUAL_COSTS_UNAVAILABLE', rows: []};
  const estimatedRows = batch.estimatedCosts?.itemCosts;
  if (!Array.isArray(estimatedRows) || estimatedRows.length !== batch.items.length) return {valid: false, warning: 'ESTIMATE_ITEMS_UNAVAILABLE', rows: []};
  const basis = batch.allocationBasis || batch.estimatedCosts.allocationBasis || (batch.selectedRoute === 'air' ? 'weight' : 'volume');
  const distributed = {};
  for (const key of COST_CLOSE_CATEGORIES) {
    const allocation = allocateCost({
      totalCost: actualSummary.totals[key],
      items: batch.items,
      basis,
      percentages: batch.allocationPercentages
    });
    if (!allocation.valid) return {valid: false, warning: allocation.warning, rows: [], basis};
    distributed[key] = allocation.allocations;
  }
  const estimatedById = new Map(estimatedRows.map(row => [row.itemId, row]));
  const rows = batch.items.map((item, index) => {
    const estimate = estimatedById.get(item.id) || estimatedRows[index];
    const purchase = Number(estimate.purchase);
    const row = {
      itemId: item.id,
      name: item.name,
      sku: item.sku,
      quantity: Number(item.quantity),
      purchase
    };
    for (const key of COST_CLOSE_CATEGORIES) row[key] = distributed[key][index];
    row.total = purchase + sum(COST_CLOSE_CATEGORIES.map(key => row[key]));
    row.unitCost = row.quantity > 0 ? row.total / row.quantity : null;
    return row;
  });
  return {valid: true, warning: null, basis, rows};
}

export function settleBatch(batch, {now = isoNow()} = {}) {
  if (!batch.items?.length) throw Object.assign(new Error('Batch has no items'), {code: 'NO_ITEMS'});
  const estimated = batch.estimatedCosts;
  if (!estimated || finite(estimated.goodsValue) == null || estimated.goodsValue <= 0 || finite(estimated.total) == null) {
    throw Object.assign(new Error('Estimated cost snapshot is unavailable'), {code: 'ESTIMATE_UNAVAILABLE'});
  }
  const actualSummary = calculateActualCostSummary({estimatedCosts: estimated, actualCosts: batch.actualCosts});
  if (!actualSummary.valid) throw Object.assign(new Error('Actual costs are incomplete'), {code: actualSummary.warning, field: actualSummary.field});
  const allocation = allocateActualItemCosts({batch, actualSummary});
  if (!allocation.valid) throw Object.assign(new Error('Actual costs cannot be allocated'), {code: allocation.warning});

  const previousStatus = batch.status === 'settled' ? batch.settlement?.previousStatus || 'warehouse_received' : batch.status;
  batch.actualCosts = {
    ...actualSummary.normalized,
    goodsValue: actualSummary.totals.goodsValue,
    total: actualSummary.totals.total,
    categoryTotals: Object.fromEntries(COST_CLOSE_CATEGORIES.map(key => [key, actualSummary.totals[key]])),
    frozenAt: now,
    updatedAt: now
  };
  batch.settlement = {
    version: 1,
    previousStatus,
    settledAt: now,
    reopenedAt: null,
    allocationBasis: allocation.basis,
    estimatedUplift: upliftPercentage(estimated.total, estimated.goodsValue),
    actualUplift: upliftPercentage(actualSummary.totals.total, estimated.goodsValue),
    actualItemCosts: allocation.rows
  };
  batch.status = 'settled';
  return batch;
}

export function reopenSettlement(batch, {now = isoNow()} = {}) {
  if (batch.status !== 'settled' || !batch.settlement) throw Object.assign(new Error('Batch is not settled'), {code: 'NOT_SETTLED'});
  batch.status = batch.settlement.previousStatus && batch.settlement.previousStatus !== 'settled'
    ? batch.settlement.previousStatus
    : 'warehouse_received';
  batch.settlement.reopenedAt = now;
  return batch;
}
