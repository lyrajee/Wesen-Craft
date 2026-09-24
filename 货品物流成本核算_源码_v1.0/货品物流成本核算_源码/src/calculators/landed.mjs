import {allocateCost} from './allocation.mjs';
import {calculateProductTaxes} from './customs.mjs';
import {calculateQuoteTotal,selectedConfirmedQuote} from './quotes.mjs';

const sum=values=>values.reduce((total,value)=>total+value,0);
const context=batch=>({weightKg:sum(batch.items.map(item=>item.quantity*item.unitWeightKg)),volumeM3:sum(batch.items.map(item=>item.quantity*item.unitVolumeM3)),containerCount:1});
export function defaultAllocationBasis(route) {return route==='air'?'weight':'volume'}

export function calculateLandedCost({batch,reference=null}) {
  if(!batch.items.length)return {valid:false,warning:'NO_ITEMS',rows:[]};
  const quote=batch.selectedQuoteId?selectedConfirmedQuote(batch):null;
  if(batch.selectedQuoteId&&!quote)return {valid:false,warning:'SELECTED_QUOTE_UNAVAILABLE',rows:[]};
  if(!quote&&!batch.selectedRoute)return {valid:false,warning:batch.legacyRoute==='ddp'?'LEGACY_ROUTE_REMOVED':'NO_ROUTE',rows:[]};
  let charges,source;
  if(quote){
    const quoted=calculateQuoteTotal(quote,batch.exchangeRates,context(batch));
    if(quoted.totalCny==null)return {valid:false,warning:'INCOMPLETE_QUOTE',rows:[]};
    charges={...quoted.totals,other:quoted.totals.other+Number(batch.declarationSettings?.otherFee||0)};
    source={kind:'quote',forwarderName:quote.forwarderName,quoteNumber:quote.quoteNumber,quoteId:quote.id};
  }else{
    if(!reference||reference.freight==null)return {valid:false,warning:'NO_REFERENCE_COST',rows:[]};
    charges={international:Number(reference.international??reference.freight),domestic:Number(reference.domestic||0),insurance:Number(reference.insurance||0),other:Number(reference.otherCharges||0)};
    source={kind:batch.selectedRoute==='fcl'?'manual':'reference',route:batch.selectedRoute};
  }
  if(Object.values(charges).some(value=>!Number.isFinite(value)))return {valid:false,warning:'INVALID_CHARGES',rows:[]};
  const basis=batch.allocationBasis||defaultAllocationBasis(batch.selectedRoute);
  const distributed={};
  for(const [category,totalCost] of Object.entries(charges)){
    const allocation=allocateCost({totalCost,items:batch.items,basis,percentages:batch.allocationPercentages});
    if(!allocation.valid)return {valid:false,warning:allocation.warning,rows:[],basis};
    distributed[category]=allocation.allocations;
  }
  const jpyCny=Number(batch.exchangeRates.JPY_CNY.rate);
  if(!Number.isFinite(jpyCny)||jpyCny<=0)return {valid:false,warning:'MISSING_FX',rows:[]};
  const rows=batch.items.map((item,index)=>{
    const international=distributed.international[index],insurance=distributed.insurance[index],domestic=distributed.domestic[index],other=distributed.other[index];
    const tax=calculateProductTaxes(item,jpyCny,batch.declarationSettings,{internationalFreightCny:international,insuranceCny:insurance});
    const total=tax.consumptionTax==null||tax.vat==null?null:tax.goods+international+insurance+tax.duty+tax.consumptionTax+tax.vat+domestic+other;
    return {itemId:item.id,name:item.name,sku:item.sku,hsCode:item.hsCode,quantity:item.quantity,purchase:tax.goods,international,insurance,customsValue:tax.customsValue,duty:tax.duty,dutyRate:tax.dutyRate,consumptionTax:tax.consumptionTax,vat:tax.vat,vatRate:tax.vatRate,domestic,other,total,unitCost:total!=null&&item.quantity?total/item.quantity:null,customsSource:item.customsRateSnapshot?.source||'Manual'};
  });
  if(rows.some(row=>row.total==null))return {valid:false,warning:'INVALID_CONSUMPTION_RATE',rows,basis,source};
  const totals={purchase:sum(rows.map(row=>row.purchase)),international:charges.international,insurance:charges.insurance,customsValue:sum(rows.map(row=>row.customsValue)),duty:sum(rows.map(row=>row.duty)),consumptionTax:sum(rows.map(row=>row.consumptionTax)),vat:sum(rows.map(row=>row.vat)),domestic:charges.domestic,other:charges.other,total:sum(rows.map(row=>row.total))};
  return {valid:true,rows,totals,charges,basis,source,jpyCny,warning:null};
}
