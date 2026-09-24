import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuoteRows,parseQuoteText,normalizeChargeName,pdfTextLines} from '../src/services/quoteParser.mjs';
import {calculateQuoteTotal,eligibleQuotes,selectedConfirmedQuote,quoteValidity} from '../src/calculators/quotes.mjs';
import {createFreightQuote} from '../src/models/quote.mjs';

const fx={JPY_CNY:{rate:.05},USD_CNY:{rate:7.2}};
test('spreadsheet and text-PDF parsing require explicit charge fields and keep original names',()=>{
  const rows=normalizeQuoteRows([{ChargeName:'O/F',Currency:'USD',Unit:'RT',Quantity:2,UnitPrice:30},{ChargeName:'Loose number',Amount:999},{ChargeName:'Destination THC',Currency:'CNY',Unit:'SET',Quantity:1,UnitPrice:300}]);
  assert.equal(rows.length,2);assert.equal(rows[0].originalName,'O/F');assert.equal(rows[0].category,'ocean_freight');
  assert.equal(rows[1].category,'destination_thc');
  assert.equal(normalizeChargeName('Freight'),'ocean_freight');
  const pdf=parseQuoteText('O/F  USD RT 2 30\nRandom 5000\nInsurance  CNY SET 1 50');
  assert.equal(pdf.length,2);assert.equal(pdf[1].category,'insurance');
  assert.deepEqual(parseQuoteText('Scanned page with no readable rows 123'),[]);
  const unusual=normalizeQuoteRows([{ChargeName:'Terminal fee',Currency:'CNY',UnitPrice:25,'Billing Unit':'PALLET',Quantity:2}]);
  assert.equal(unusual[0].unit,'PALLET');
  assert.ok(calculateQuoteTotal({chargeLines:unusual},fx).warnings.includes('UNKNOWN_UNIT'));
  const pdfItems=[
    {str:'30',transform:[1,0,0,1,300,100]},
    {str:'O/F',transform:[1,0,0,1,10,100]},
    {str:'USD',transform:[1,0,0,1,110,100]},
    {str:'RT',transform:[1,0,0,1,180,100]},
    {str:'2',transform:[1,0,0,1,240,100]},
    {str:'Insurance',transform:[1,0,0,1,10,80]},
    {str:'CNY',transform:[1,0,0,1,110,80]},
    {str:'SET',transform:[1,0,0,1,180,80]},
    {str:'1',transform:[1,0,0,1,240,80]},
    {str:'50',transform:[1,0,0,1,300,80]}
  ];
  assert.equal(parseQuoteText(pdfTextLines(pdfItems)).length,2);
});

test('only confirmed, batch-owned, complete quotes can be selected',()=>{
  const confirmed=createFreightQuote({batchId:'batch-a',confirmed:true,transportMode:'lcl',chargeLines:[{originalName:'O/F',category:'ocean_freight',currency:'USD',unit:'SET',quantity:1,unitPrice:100}]});
  const draft=createFreightQuote({batchId:'batch-a',confirmed:false,chargeLines:confirmed.chargeLines});
  const other=createFreightQuote({batchId:'batch-b',confirmed:true,chargeLines:confirmed.chargeLines});
  const incomplete=createFreightQuote({batchId:'batch-a',confirmed:true,chargeLines:[{originalName:'DOC',currency:'USD',unit:'SET'}]});
  const batch={id:'batch-a',quotes:[draft,confirmed,other,incomplete],selectedQuoteId:confirmed.id,exchangeRates:fx};
  assert.deepEqual(eligibleQuotes(batch).map(q=>q.id),[confirmed.id]);
  assert.equal(selectedConfirmedQuote(batch)?.id,confirmed.id);
  assert.equal(calculateQuoteTotal(confirmed,fx).totalCny,720);
  assert.ok(calculateQuoteTotal(confirmed,fx).warnings.includes('CHECK_DESTINATION_THC'));
  batch.selectedQuoteId=draft.id;assert.equal(selectedConfirmedQuote(batch),null);
});

test('quote validity preserves expired history',()=>{
  assert.equal(quoteValidity('2026-01-01',new Date('2026-09-24T00:00:00Z')).status,'expired');
  assert.equal(quoteValidity('2026-09-25',new Date('2026-09-24T00:00:00Z')).status,'expiring');
});

test('quote comparison categories reconcile, and FCL needs a container type',()=>{
  const lines=[
    {category:'ocean_freight',currency:'USD',unit:'SET',quantity:1,unitPrice:100},
    {category:'origin_thc',currency:'CNY',unit:'SET',quantity:1,unitPrice:80},
    {category:'destination_thc',currency:'CNY',unit:'SET',quantity:1,unitPrice:60},
    {category:'import_customs',currency:'CNY',unit:'SET',quantity:1,unitPrice:40},
    {category:'trucking',currency:'CNY',unit:'SET',quantity:1,unitPrice:50},
    {category:'insurance',currency:'CNY',unit:'SET',quantity:1,unitPrice:20}
  ];
  const quote=createFreightQuote({batchId:'b',transportMode:'fcl',chargeLines:lines});
  assert.equal(calculateQuoteTotal(quote,fx).totalCny,null);
  assert.ok(calculateQuoteTotal(quote,fx).warnings.includes('MISSING_CONTAINER'));
  quote.containerType='20GP';
  const result=calculateQuoteTotal(quote,fx);
  assert.equal(result.totalCny,970);
  assert.equal(Object.values(result.comparison).reduce((a,b)=>a+b,0),result.totalCny);
  assert.equal(result.comparison.internationalFreight,720);
  assert.equal(result.comparison.customsCharges,40);
  assert.deepEqual(result.totals,{international:720,domestic:110,insurance:20,other:120});
});
