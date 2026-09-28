import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatch, BATCH_SCHEMA_VERSION} from '../src/models/batch.mjs';
import {calculateLandedCost} from '../src/calculators/landed.mjs';
import {
  calculateActualCostSummary,
  compareCostSnapshots,
  createEstimatedCostSnapshot,
  reopenSettlement,
  settleBatch
} from '../src/calculators/costClose.mjs';
import {createBatchRepository, createMemoryStorage, migrateStoredData, STORAGE_KEY} from '../src/repositories/batchRepository.mjs';

const items = [
  {id:'item-a',name:'Bottle',sku:'A',qty:2,price:1000,weight:2,volume:.01,duty:10,vat:13},
  {id:'item-b',name:'Scale',sku:'B',qty:1,price:2000,weight:1,volume:.02,duty:8,vat:13}
];

function makeBatch(extra = {}) {
  return createBatch({
    id:'batch-p31',
    status:'warehouse_received',
    items,
    exchangeRates:{JPY_CNY:{rate:.05,source:'Manual',mode:'manual'},USD_CNY:{rate:7.2,source:'Manual',mode:'manual'}},
    declarationSettings:{dutyRate:10,vatRate:13,otherFee:10},
    selectedRoute:'air',
    allocationBasis:'weight',
    ...extra
  });
}

function estimateFor(batch) {
  return calculateLandedCost({batch,reference:{freight:400,international:300,insurance:20,domestic:60,otherCharges:20}});
}

function snapshotBatch(extra = {}) {
  const batch = makeBatch(extra);
  batch.estimatedCosts = createEstimatedCostSnapshot({batch,result:estimateFor(batch),now:'2026-09-28T01:00:00.000Z'});
  return batch;
}

function fillActuals(batch) {
  batch.actualCosts = {
    international:330,insurance:18,duty:45,consumptionTax:0,vat:70,domestic:75,other:12,
    lines:[]
  };
  return batch;
}

test('estimated snapshot freezes totals, route, FX, source, and item rows', () => {
  const batch = snapshotBatch();
  const snapshot = batch.estimatedCosts;
  assert.equal(snapshot.capturedAt,'2026-09-28T01:00:00.000Z');
  assert.equal(snapshot.goodsValue,200);
  assert.equal(snapshot.routeSnapshot.selectedRoute,'air');
  assert.equal(snapshot.fxSnapshot.JPY_CNY.rate,.05);
  assert.equal(snapshot.source.kind,'reference');
  assert.equal(snapshot.itemCosts.length,2);
  assert.ok(Math.abs(snapshot.itemCosts.reduce((sum,row)=>sum+row.total,0)-snapshot.total)<1e-8);
});

test('actual total includes core categories and optional cost lines', () => {
  const batch = fillActuals(snapshotBatch());
  batch.actualCosts.lines=[{id:'line-1',name:'Inspection',category:'other',amount:25,note:'Final invoice'}];
  const summary=calculateActualCostSummary({estimatedCosts:batch.estimatedCosts,actualCosts:batch.actualCosts});
  assert.equal(summary.valid,true);
  assert.equal(summary.totals.other,37);
  assert.equal(summary.totals.total,775);
});

test('comparison calculates actual minus estimate and avoids division by zero', () => {
  const rows=compareCostSnapshots({goodsValue:0,total:0},{valid:true,totals:{goodsValue:0,total:50}});
  const goods=rows.find(row=>row.key==='goodsValue');
  const total=rows.find(row=>row.key==='total');
  assert.equal(goods.variance,0);
  assert.equal(goods.variancePercent,null);
  assert.equal(total.variance,50);
  assert.equal(total.variancePercent,null);
});

test('settlement validates and freezes actual totals and settlement metadata', () => {
  const batch=fillActuals(snapshotBatch());
  settleBatch(batch,{now:'2026-09-28T02:00:00.000Z'});
  assert.equal(batch.status,'settled');
  assert.equal(batch.settlement.settledAt,'2026-09-28T02:00:00.000Z');
  assert.equal(batch.settlement.previousStatus,'warehouse_received');
  assert.equal(batch.actualCosts.frozenAt,'2026-09-28T02:00:00.000Z');
  assert.ok(Number.isFinite(batch.settlement.actualUplift));
});

test('reopen records time, restores previous status, and preserves last settlement', () => {
  const batch=fillActuals(snapshotBatch());
  settleBatch(batch,{now:'2026-09-28T02:00:00.000Z'});
  const previousRows=batch.settlement.actualItemCosts;
  reopenSettlement(batch,{now:'2026-09-28T03:00:00.000Z'});
  assert.equal(batch.status,'warehouse_received');
  assert.equal(batch.settlement.reopenedAt,'2026-09-28T03:00:00.000Z');
  assert.deepEqual(batch.settlement.actualItemCosts,previousRows);
});

test('estimated FX snapshot remains unchanged after live batch rate changes', () => {
  const batch=snapshotBatch();
  batch.exchangeRates.JPY_CNY.rate=.061;
  assert.equal(batch.estimatedCosts.fxSnapshot.JPY_CNY.rate,.05);
});

test('selected quote snapshot remains unchanged after quote edits', () => {
  const quote={id:'quote-1',batchId:'batch-p31',confirmed:true,forwarderName:'Forwarder A',quoteNumber:'Q-88',transportMode:'air',chargeLines:[{id:'c1',category:'air_freight',originalName:'Air',currency:'CNY',unit:'SET',quantity:1,unitPrice:300}]};
  const batch=makeBatch({quotes:[quote],selectedQuoteId:'quote-1'});
  const result=calculateLandedCost({batch,reference:null});
  batch.estimatedCosts=createEstimatedCostSnapshot({batch,result});
  batch.quotes[0].forwarderName='Changed';
  assert.equal(batch.estimatedCosts.quoteSnapshot.forwarderName,'Forwarder A');
  assert.equal(batch.estimatedCosts.source.kind,'quote');
});

test('settlement allocates actual categories to items and creates separate actual unit costs', () => {
  const batch=fillActuals(snapshotBatch());
  settleBatch(batch);
  const rows=batch.settlement.actualItemCosts;
  assert.equal(rows.length,2);
  assert.ok(rows.every(row=>Number.isFinite(row.unitCost)));
  assert.ok(Math.abs(rows.reduce((sum,row)=>sum+row.total,0)-batch.actualCosts.total)<1e-8);
  assert.notEqual(rows[0].unitCost,batch.estimatedCosts.itemCosts[0].unitCost);
});

test('v3 batch migration preserves legacy data and upgrades schema without inventing settlement', () => {
  const migrated=migrateStoredData({schemaVersion:3,activeBatchId:'old',batches:[{id:'old',name:'Legacy',items,tracking:{opaque:true},quotes:[{id:'q-old',batchId:'old'}],estimatedCosts:{legacy:true},actualCosts:{legacy:true}}]});
  const batch=migrated.batches[0];
  assert.equal(migrated.schemaVersion,BATCH_SCHEMA_VERSION);
  assert.equal(BATCH_SCHEMA_VERSION,4);
  assert.deepEqual(batch.tracking,{opaque:true});
  assert.equal(batch.estimatedCosts.legacy,true);
  assert.equal(batch.actualCosts.legacy,true);
  assert.equal(batch.settlement,null);
});

test('settled batch persists and reloads from repository storage', () => {
  const storage=createMemoryStorage();
  const repository=createBatchRepository(storage);
  repository.initialize({items:[]});
  const batch=fillActuals(snapshotBatch());
  const created=repository.create(batch);
  settleBatch(created,{now:'2026-09-28T04:00:00.000Z'});
  repository.update(created);
  const second=createBatchRepository(storage);
  second.initialize();
  const restored=second.get(created.id);
  assert.equal(restored.status,'settled');
  assert.equal(restored.settlement.settledAt,'2026-09-28T04:00:00.000Z');
  assert.equal(restored.settlement.actualItemCosts.length,2);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion,4);
});
