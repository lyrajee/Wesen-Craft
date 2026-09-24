import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductItem} from '../src/models/product.mjs';
import {createBatchRepository, createMemoryStorage, STORAGE_KEY} from '../src/repositories/batchRepository.mjs';

const initialItems = [
  {name:'保温杯 480ml',sku:'SM-ZB48',qty:24,price:2680,weight:.26,volume:.0019,duty:10,vat:13},
  {name:'厨房电子秤',sku:'KS-711',qty:12,price:1980,weight:.55,volume:.0032,duty:8,vat:13}
];
const seed = {items:initialItems, exchangeRates:{JPY_CNY:{rate:.048,source:'Default',mode:'locked'},USD_CNY:{rate:7.2,source:'Default',mode:'locked'}}, declarationSettings:{dutyRate:10,vatRate:13,otherFee:0}, selectedRoute:'air'};

test('product serialization stores canonical fields and restores legacy aliases', () => {
  const item = createProductItem(initialItems[0]);
  assert.equal(item.hsCode, '');
  assert.equal(item.sku, 'SM-ZB48');
  item.qty = 36;
  assert.equal(item.quantity, 36);
  const parsed = JSON.parse(JSON.stringify(item));
  assert.equal(parsed.quantity, 36);
  assert.equal(parsed.qty, undefined);
});

test('repository seeds, persists and isolates batches', () => {
  const storage = createMemoryStorage();
  const repo = createBatchRepository(storage);
  const original = repo.initialize(seed).batches[0];
  assert.equal(original.items.length, 2);
  const second = repo.create({name:'Second', items:[], exchangeRates:{JPY_CNY:{rate:.05,mode:'manual'}}, declarationSettings:{dutyRate:5,vatRate:13}});
  repo.setActiveBatchId(second.id);
  second.exchangeRates.JPY_CNY.rate = .051;
  repo.update(second);
  const reload = createBatchRepository(storage);
  const restored = reload.initialize(seed);
  assert.equal(restored.batches.length, 2);
  assert.equal(reload.get(original.id).exchangeRates.JPY_CNY.rate, .048);
  assert.equal(reload.get(second.id).exchangeRates.JPY_CNY.rate, .051);
  assert.equal(reload.getActiveBatchId(), second.id);
  assert.ok(storage.getItem(STORAGE_KEY));
});

test('duplicate copies products and rates with fresh product IDs but clears operational records', () => {
  const repo = createBatchRepository(createMemoryStorage());
  const source = repo.initialize(seed).batches[0];
  source.quotes = [{id:'quote-1'}]; source.tracking = {trackingNo:'x'}; source.actualCosts = {freight:1}; repo.update(source);
  const copy = repo.duplicate(source.id, 'Copy');
  assert.equal(copy.items.length, 2);
  assert.notEqual(copy.items[0].id, source.items[0].id);
  assert.equal(copy.exchangeRates.JPY_CNY.rate, source.exchangeRates.JPY_CNY.rate);
  assert.equal(copy.quotes.length, 0);
  assert.deepEqual(copy.tracking, {});
  assert.deepEqual(copy.actualCosts, {});
  assert.equal(copy.status, 'draft');
});

test('legacy array migration creates one active batch and deletion retains a batch', () => {
  const repo = createBatchRepository(createMemoryStorage({[STORAGE_KEY]:JSON.stringify(initialItems)}));
  const data = repo.initialize(seed);
  assert.equal(data.batches.length, 1);
  assert.equal(data.batches[0].items.length, 2);
  repo.remove(data.batches[0].id);
  assert.equal(repo.list().length, 1);
  assert.ok(repo.getActiveBatchId());
});
