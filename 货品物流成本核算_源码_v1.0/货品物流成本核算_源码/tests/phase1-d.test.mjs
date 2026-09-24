import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateCost,allocateByWeight,allocateByVolume,allocateByValue,allocateByQuantity,allocateCustom} from '../src/calculators/allocation.mjs';
import {calculateLandedCost} from '../src/calculators/landed.mjs';
import {createBatch} from '../src/models/batch.mjs';
import {createFreightQuote} from '../src/models/quote.mjs';
import {calculateConsumptionTax} from '../src/calculators/customs.mjs';

const items=[{id:'a',name:'A',sku:'SKU-A',hsCode:'8215',qty:2,price:1000,weight:2,volume:1,duty:7,vat:13},{id:'b',name:'B',sku:'SKU-B',hsCode:'7323',qty:1,price:1000,weight:1,volume:2,duty:10,vat:9}];
const fx={JPY_CNY:{rate:.05},USD_CNY:{rate:7.2}};
const batch=()=>createBatch({id:'batch-1',items,exchangeRates:fx,selectedRoute:'air',declarationSettings:{dutyRate:10,vatRate:13,otherFee:0}});

test('all allocation bases reconcile; zero bases and bad custom percentages fail safely',()=>{
  const productItems=batch().items;
  for(const basis of ['weight','volume','value','quantity']){
    const result=allocateCost({totalCost:100,items:productItems,basis});
    assert.equal(result.valid,true);assert.ok(Math.abs(result.allocations.reduce((a,b)=>a+b,0)-100)<1e-8);
  }
  assert.equal(allocateCustom(100,productItems,{a:50,b:30}).warning,'PERCENTAGES_NOT_100');
  assert.deepEqual(allocateCustom(100,productItems,{a:50,b:50}).allocations,[50,50]);
  assert.equal(allocateByWeight(10,[{id:'x',qty:1,weight:0}]).warning,'ZERO_WEIGHT');
  assert.equal(allocateByVolume(10,[{id:'x',qty:1,volume:0}]).warning,'ZERO_VOLUME');
  assert.equal(allocateByValue(10,[{id:'x',qty:1,price:0}]).warning,'ZERO_VALUE');
  assert.equal(allocateByQuantity(10,[{id:'x',qty:0}]).warning,'ZERO_QUANTITY');
});

test('selected confirmed quote overrides reference and customs value includes international freight and insurance',()=>{
  const data=batch();
  const quote=createFreightQuote({batchId:data.id,confirmed:true,forwarderName:'Forwarder A',quoteNumber:'Q-1',transportMode:'air',chargeLines:[{category:'air_freight',originalName:'Air Freight',currency:'CNY',unit:'SET',quantity:1,unitPrice:300},{category:'insurance',originalName:'Insurance',currency:'CNY',unit:'SET',quantity:1,unitPrice:30},{category:'trucking',originalName:'Trucking',currency:'CNY',unit:'SET',quantity:1,unitPrice:70},{category:'origin_thc',originalName:'Origin THC',currency:'CNY',unit:'SET',quantity:1,unitPrice:20},{category:'export_customs',originalName:'Export Customs',currency:'CNY',unit:'SET',quantity:1,unitPrice:10}]});
  data.quotes=[quote];data.selectedQuoteId=quote.id;data.allocationBasis='value';
  const result=calculateLandedCost({batch:data,reference:{freight:99999,international:99999}});
  assert.equal(result.valid,true);assert.equal(result.source.kind,'quote');assert.equal(result.totals.international,300);assert.equal(result.totals.insurance,30);assert.equal(result.totals.domestic,70);assert.equal(result.totals.other,30);
  assert.equal(result.totals.purchase,150);
  assert.equal(result.totals.customsValue,480);
  assert.ok(Math.abs(result.totals.total-result.rows.reduce((sum,row)=>sum+row.total,0))<1e-9);
  assert.equal(result.rows[0].dutyRate,7);assert.equal(result.rows[1].dutyRate,10);
  assert.equal(result.rows[0].sku,'SKU-A');assert.equal(result.rows[0].hsCode,'8215');
  quote.confirmed=false;
  assert.equal(calculateLandedCost({batch:data,reference:{freight:1}}).warning,'SELECTED_QUOTE_UNAVAILABLE');
});

test('ad valorem import consumption tax uses grossed-up base',()=>{
  assert.equal(calculateConsumptionTax(100,10,10),110/0.9*0.1);
  assert.equal(calculateConsumptionTax(100,10,0),0);
  assert.equal(calculateConsumptionTax(100,10,100),null);
});
