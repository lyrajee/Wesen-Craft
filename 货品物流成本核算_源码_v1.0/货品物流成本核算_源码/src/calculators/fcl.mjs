import {CHARGE_UNITS} from '../models/chargeLine.mjs';

const validNumber = value => value !== '' && value != null && Number.isFinite(Number(value));
const validContainer = type => ['20GP','40GP','40HQ'].includes(type);

export function calculateChargeLine(line, fx = {}, context = {}) {
  const warnings=[];
  const unit=String(line.unit || 'CUSTOM').toUpperCase();
  if (!CHARGE_UNITS.includes(unit)) warnings.push('UNKNOWN_UNIT');
  const quantity=validNumber(line.quantity)?Number(line.quantity):!CHARGE_UNITS.includes(unit)?null:unit==='KG'?context.weightKg:unit==='CBM'?context.volumeM3:unit==='RT'||unit==='W/M'?Math.max(context.volumeM3||0,(context.weightKg||0)/1000):['20GP','40GP','40HQ','CONTAINER'].includes(unit)?context.containerCount:1;
  if(!validNumber(quantity)||Number(quantity)<0)warnings.push('INVALID_QUANTITY');
  let original=validNumber(line.totalOriginalCurrency)?Number(line.totalOriginalCurrency):null;
  if(original==null && validNumber(line.unitPrice) && validNumber(quantity))original=Math.max(Number(line.minimumCharge)||0,Number(line.unitPrice)*Number(quantity));
  if(original==null)warnings.push('MISSING_AMOUNT');
  const currency=String(line.currency||'CNY').toUpperCase();
  const rate=currency==='CNY'?1:currency==='JPY'?Number(fx.JPY_CNY?.rate):currency==='USD'?Number(fx.USD_CNY?.rate):NaN;
  if(!Number.isFinite(rate)||rate<=0)warnings.push('MISSING_FX');
  const totalCny=original!=null&&Number.isFinite(rate)&&rate>0?original*rate:null;
  return {line,quantity:validNumber(quantity)?Number(quantity):null,totalOriginalCurrency:original,totalCny,warnings};
}

export function calculateFclCost({containerType,chargeLines=[],exchangeRates={},weightKg=0,volumeM3=0,containerCount=1}) {
  const warnings=[];
  if(!validContainer(containerType))warnings.push('INVALID_CONTAINER_TYPE');
  if(!chargeLines.length)warnings.push('NO_CHARGE_LINES');
  const breakdown=chargeLines.map(line=>calculateChargeLine(line,exchangeRates,{weightKg,volumeM3,containerCount}));
  for(const entry of breakdown)warnings.push(...entry.warnings.map(code=>`${code}:${entry.line.id||''}`));
  const chargeable=breakdown.filter(entry=>!entry.line.included);
  if(chargeable.some(entry=>entry.totalCny==null))warnings.push('INCOMPLETE_TOTAL');
  const totalCny=chargeable.length && !chargeable.some(entry=>entry.totalCny==null)?chargeable.reduce((sum,entry)=>sum+entry.totalCny,0):null;
  const originals={};
  for(const entry of chargeable){if(entry.totalOriginalCurrency==null)continue;const currency=String(entry.line.currency||'CNY').toUpperCase();originals[currency]=(originals[currency]||0)+entry.totalOriginalCurrency}
  return {containerType,originals,totalCny,breakdown,warnings};
}
