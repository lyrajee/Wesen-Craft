import {calculateChargeLine} from './fcl.mjs';
const chargeTypes = ['ocean_freight','air_freight','baf','lss','pss','origin_thc','destination_thc','doc','seal','vgm','export_customs','import_customs','port_charges','trucking','insurance','other'];
const international = new Set(['ocean_freight','air_freight','baf','lss','pss']);
const domestic = new Set(['destination_thc','port_charges','trucking']);
export function quoteValidity(validUntil,now=new Date()) {
  if(!validUntil)return {status:'unknown',days:null};
  const date=new Date(`${validUntil}T23:59:59`);
  if(Number.isNaN(date.getTime()))return {status:'unknown',days:null};
  const days=Math.ceil((date.getTime()-now.getTime())/86400000);
  return {status:days<0?'expired':days<=2?'expiring':'valid',days};
}
export function calculateQuoteTotal(quote,fx,context={}) {
  const breakdown=(quote.chargeLines||[]).map(line=>calculateChargeLine(line,fx,context));
  const chargeable=breakdown.filter(entry=>!entry.line.included);
  const warnings=[];
  for(const entry of breakdown)warnings.push(...entry.warnings);
  for(const category of ['destination_thc','import_customs','trucking','insurance'])if(!breakdown.some(entry=>entry.line.category===category))warnings.push(`CHECK_${category.toUpperCase()}`);
  const missingContainer=quote.transportMode==='fcl'&&!['20GP','40GP','40HQ'].includes(quote.containerType);
  if(missingContainer)warnings.push('MISSING_CONTAINER');
  const incomplete=missingContainer||!chargeable.length||chargeable.some(entry=>entry.totalCny==null);
  if(incomplete)warnings.push('INCOMPLETE_TOTAL');
  const totals={international:0,domestic:0,insurance:0,other:0};
  const comparison={internationalFreight:0,originCharges:0,destinationCharges:0,customsCharges:0,trucking:0,insurance:0,other:0};
  for(const entry of chargeable){
    if(entry.totalCny==null)continue;
    const category=chargeTypes.includes(entry.line.category)?entry.line.category:'other';
    const key=category==='insurance'?'insurance':international.has(category)?'international':domestic.has(category)?'domestic':'other';
    totals[key]+=entry.totalCny;
    const comparisonKey=category==='insurance'?'insurance':['air_freight','ocean_freight','baf','lss','pss'].includes(category)?'internationalFreight':['origin_thc','doc','seal','vgm'].includes(category)?'originCharges':['destination_thc','port_charges'].includes(category)?'destinationCharges':['export_customs','import_customs'].includes(category)?'customsCharges':category==='trucking'?'trucking':'other';
    comparison[comparisonKey]+=entry.totalCny;
  }
  return {totalCny:incomplete?null:chargeable.reduce((sum,entry)=>sum+entry.totalCny,0),totals,comparison,breakdown,warnings};
}
export function eligibleQuotes(batch) {
  const context={weightKg:(batch.items||[]).reduce((sum,item)=>sum+(item.quantity??item.qty)*(item.unitWeightKg??item.weight),0),volumeM3:(batch.items||[]).reduce((sum,item)=>sum+(item.quantity??item.qty)*(item.unitVolumeM3??item.volume),0),containerCount:1};
  return (batch.quotes||[]).filter(quote=>quote.batchId===batch.id&&quote.confirmed&&calculateQuoteTotal(quote,batch.exchangeRates,context).totalCny!=null);
}
export function selectedConfirmedQuote(batch) {
  return eligibleQuotes(batch).find(quote=>quote.id===batch.selectedQuoteId)||null;
}
