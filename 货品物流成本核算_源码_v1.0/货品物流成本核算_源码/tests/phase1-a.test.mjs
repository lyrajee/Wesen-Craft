import test from 'node:test';
import assert from 'node:assert/strict';
import {createProductItem} from '../src/models/product.mjs';
import {createCustomsRateSnapshot} from '../src/models/customs.mjs';
import {calculateProductTaxes} from '../src/calculators/customs.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const customsHandler=require('../api/customs.js');

test('each SKU uses its own duty and VAT, including a valid zero rate',()=>{
  const a=createProductItem({qty:2,price:1000,duty:7,vat:13});
  const b=createProductItem({qty:1,price:1000,duty:10,vat:9});
  const c=createProductItem({qty:1,price:1000,duty:0,vat:13});
  const taxes=[a,b,c].map(item=>calculateProductTaxes(item,.05,{dutyRate:12,vatRate:13}));
  assert.deepEqual(taxes.map(t=>t.duty),[7,5,0]);
  assert.deepEqual(taxes.map(t=>t.vat),[13.91,4.95,6.5]);
});

test('missing item rates use batch defaults and blank customs fields remain null',()=>{
  const item=createProductItem({qty:1,price:1000,dutyRate:null,vatRate:null});
  const tax=calculateProductTaxes(item,.05,{dutyRate:8,vatRate:13});
  assert.equal(tax.duty,4);
  assert.equal(tax.vat,7.02);
  const snapshot=createCustomsRateSnapshot({hsCode:'8215',effectiveDutyRate:0,vatRate:13,source:'Manual',confirmedByUser:true});
  assert.equal(snapshot.mfnRate,null);
  assert.equal(snapshot.effectiveDutyRate,0);
  assert.equal(snapshot.confirmedByUser,true);
  item.customsRateSnapshot=snapshot;
  assert.equal(JSON.parse(JSON.stringify(item)).customsRateSnapshot.hsCode,'8215');
});

test('unconfigured customs API returns no fabricated rates',async()=>{
  let statusCode=0,payload=null;
  const response={status(code){statusCode=code;return this},json(data){payload=data;return this}};
  await customsHandler({method:'GET',query:{q:'8215'}},response);
  assert.equal(statusCode,503);
  assert.equal(payload.error,'CUSTOMS_PROVIDER_NOT_CONFIGURED');
  assert.deepEqual(payload.results,[]);
});
