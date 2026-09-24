import {createChargeLine} from '../models/chargeLine.mjs';
const currency=token=>/^(CNY|RMB|JPY|YEN|USD|US\$)$/i.test(String(token).trim());
const normalizedCurrency=token=>({RMB:'CNY',YEN:'JPY','US$':'USD'}[String(token).toUpperCase()]||String(token).toUpperCase());
export function normalizeChargeName(name) {
  const text=String(name||'').trim().toLowerCase();
  if(/^(o\/f|ocean freight|sea freight|freight)$/.test(text))return 'ocean_freight';
  if(/air freight|air cargo/.test(text))return 'air_freight';
  if(/destination.*thc|dest.*thc/.test(text))return 'destination_thc';
  if(/origin.*thc/.test(text))return 'origin_thc';
  if(/import customs|customs.*import|进口报关/.test(text))return 'import_customs';
  if(/export customs|customs.*export|出口报关/.test(text))return 'export_customs';
  if(/trucking|truck|拖车/.test(text))return 'trucking';
  if(/insurance|保险/.test(text))return 'insurance';
  if(/\bbaf\b/.test(text))return 'baf';if(/\blss\b/.test(text))return 'lss';if(/\bpss\b/.test(text))return 'pss';
  if(/\bvgm\b/.test(text))return 'vgm';if(/seal/.test(text))return 'seal';if(/doc|document/.test(text))return 'doc';
  if(/port|terminal/.test(text))return 'port_charges';
  return 'other';
}
const get=(row,names)=>{
  const entries=Object.entries(row).map(([key,value])=>[key.toLowerCase().replace(/[\s_\-/]/g,''),value]);
  for(const name of names){const exact=entries.find(([key])=>key===name);if(exact)return exact[1]}
  for(const name of names){const partial=entries.find(([key])=>key.includes(name)&&!(name==='unit'&&/(unitprice|priceunit)/.test(key)));if(partial)return partial[1]}
  return null;
};
const numeric=value=>value==null||String(value).trim()===''?null:Number(String(value).replace(/,/g,''));
export function normalizeQuoteRows(rows) {
  if(!Array.isArray(rows))return [];
  return rows.map(row=>{
    const originalName=String(get(row,['feename','chargename','description','originalname','费用名称','費用名','项目','item'])||'').trim();
    const rawCurrency=String(get(row,['currency','币种','通貨'])||'').trim().toUpperCase();
    const rawUnit=String(get(row,['billingunit','pricingunit','perunit','unit','计价单位','単位'])||'').trim().toUpperCase();
    const quantity=numeric(get(row,['quantity','qty','数量']));
    const unitPrice=numeric(get(row,['unitprice','rate','单价','単価']));
    const total=numeric(get(row,['total','amount','金额','金額']));
    if(!originalName||!currency(rawCurrency)||!rawUnit||(!Number.isFinite(unitPrice)&&!Number.isFinite(total)))return null;
    return createChargeLine({originalName,normalizedName:originalName,category:normalizeChargeName(originalName),currency:normalizedCurrency(rawCurrency),unit:rawUnit,quantity:Number.isFinite(quantity)?quantity:null,unitPrice:Number.isFinite(unitPrice)?unitPrice:null,totalOriginalCurrency:Number.isFinite(total)?total:null,minimumCharge:numeric(get(row,['minimum','mincharge','最低收费'])),note:String(get(row,['note','remarks','备注'])||'')});
  }).filter(Boolean);
}
export function pdfTextLines(items) {
  const groups=[];
  for(const item of items||[]){
    const value=String(item.str||'').trim(),x=Number(item.transform?.[4]),y=Number(item.transform?.[5]);
    if(!value||!Number.isFinite(x)||!Number.isFinite(y))continue;
    let group=groups.find(entry=>Math.abs(entry.y-y)<=2.5);
    if(!group){group={y,parts:[]};groups.push(group)}
    group.parts.push({x,value});
  }
  return groups.sort((a,b)=>b.y-a.y).map(group=>group.parts.sort((a,b)=>a.x-b.x).map(part=>part.value).join('  ')).join('\n');
}
export function parseQuoteText(text) {
  const lines=String(text||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean),rows=[];
  for(const line of lines){
    // Text PDFs are accepted only when an explicit currency, unit, quantity and price are present.
    const match=line.match(/^(.+?)\s{2,}(CNY|RMB|JPY|YEN|USD|US\$)\s+(KG|CBM|RT|W\/M|20GP|40GP|40HQ|CONTAINER|B\/L|SET|SHIPMENT|TICKET|CARTON|CUSTOM)\s+([\d,.]+)\s+([\d,.]+)(?:\s+([\d,.]+))?$/i);
    if(!match)continue;
    rows.push({ChargeName:match[1],Currency:match[2],Unit:match[3],Quantity:match[4],UnitPrice:match[5],Total:match[6]||''});
  }
  return normalizeQuoteRows(rows);
}
