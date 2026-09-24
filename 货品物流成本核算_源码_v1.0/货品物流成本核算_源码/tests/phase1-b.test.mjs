import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchRepository,createMemoryStorage,STORAGE_KEY} from '../src/repositories/batchRepository.mjs';
import {createChargeLine} from '../src/models/chargeLine.mjs';
import {calculateFclCost} from '../src/calculators/fcl.mjs';
import {routeCost} from '../src/calculators/costs.mjs';

const fx={JPY_CNY:{rate:.05},USD_CNY:{rate:7.2}};
test('air and LCL reference freight retain the P0 pricing baseline',()=>{
  const items=[
    {qty:24,price:2680,weight:.26,volume:.0019},
    {qty:12,price:1980,weight:.55,volume:.0032}
  ];
  const options={routes:[{type:'air'},{type:'lcl'}],items,otherFee:0,usdRate:7.2,lang:'zh',money:value=>`¥${value.toFixed(2)}`};
  assert.equal(routeCost(0,.048,options).freight,998.96);
  assert.equal(routeCost(1,.048,options).freight.toFixed(2),'4196.52');
});
test('v1 batches migrate without dropping products, FX, notes or locations; DDP becomes an explicit unselected legacy route',()=>{
  const old={schemaVersion:1,batches:[{id:'b-1',name:'Old',supplier:'S',originPort:'Kobe',destinationPort:'Shanghai',notes:'keep',items:[{id:'i-1',name:'Item',qty:2,price:100,weight:1,volume:.2,duty:8,vat:13}],exchangeRates:fx,selectedRoute:'ddp'}],activeBatchId:'b-1'};
  const storage=createMemoryStorage({[STORAGE_KEY]:JSON.stringify(old)});
  const repo=createBatchRepository(storage),batch=repo.initialize().batches[0];
  assert.equal(repo.data.schemaVersion,2);
  assert.equal(batch.selectedRoute,null);
  assert.equal(batch.legacyRoute,'ddp');
  assert.equal(batch.items[0].id,'i-1');
  assert.equal(batch.exchangeRates.JPY_CNY.rate,.05);
  assert.equal(batch.supplier,'S');assert.equal(batch.originPort,'Kobe');assert.equal(batch.notes,'keep');
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion,2);
});

test('legacy sea selection maps to LCL and FCL has no fabricated fixed price',()=>{
  const repo=createBatchRepository(createMemoryStorage({[STORAGE_KEY]:JSON.stringify({schemaVersion:1,batches:[{id:'sea-1',selectedRoute:'sea',items:[]}],activeBatchId:'sea-1'})}));
  assert.equal(repo.initialize().batches[0].selectedRoute,'lcl');
  const result=calculateFclCost({containerType:'20GP',chargeLines:[],exchangeRates:fx});
  assert.equal(result.totalCny,null);assert.ok(result.warnings.includes('NO_CHARGE_LINES'));
});

test('FCL supports all container sizes, three currencies, included lines and unknown-unit warnings',()=>{
  for(const containerType of ['20GP','40GP','40HQ']){
    const charges=[createChargeLine({originalName:'O/F',category:'ocean_freight',currency:'USD',unit:containerType,quantity:1,unitPrice:1000}),createChargeLine({originalName:'DOC',currency:'JPY',unit:'SET',quantity:1,unitPrice:2000}),createChargeLine({originalName:'THC',currency:'CNY',unit:'CUSTOM',quantity:1,unitPrice:100}),createChargeLine({originalName:'Included',currency:'CNY',unit:'SET',quantity:1,unitPrice:50,included:true})];
    const result=calculateFclCost({containerType,chargeLines:charges,exchangeRates:fx});
    assert.equal(result.totalCny,7400);assert.equal(result.originals.USD,1000);assert.equal(result.originals.JPY,2000);
  }
  const unknown=calculateFclCost({containerType:'20GP',chargeLines:[createChargeLine({unit:'MYSTERY',quantity:1,unitPrice:50})],exchangeRates:fx});
  assert.equal(unknown.totalCny,50);assert.ok(unknown.warnings.some(w=>w.startsWith('UNKNOWN_UNIT')));
});
