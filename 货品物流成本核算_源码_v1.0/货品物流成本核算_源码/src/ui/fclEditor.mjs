import {createChargeLine,CHARGE_CATEGORIES,CHARGE_UNITS} from '../models/chargeLine.mjs';
import {calculateFclCost} from '../calculators/fcl.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const select=(name,values,chosen,tx,prefix='')=>`<select name="${name}" aria-label="${esc(tx(`fcl_${name}`))}">${values.map(value=>`<option value="${esc(value)}"${value===chosen?' selected':''}>${esc(prefix?tx(prefix+value):value)}</option>`).join('')}</select>`;
export function mountFclEditor({state,tx,money,onChange}) {
  const root=document.querySelector('#fclEditor');
  function render() {
    const batch=state.activeBatch,fcl=batch.fcl;
    const calc=calculateFclCost({containerType:fcl.containerType,chargeLines:fcl.chargeLines,exchangeRates:batch.exchangeRates});
    root.innerHTML=`<div class="section-head"><div><h2>${esc(tx('fclTitle'))}</h2><div class="hint">${esc(tx('fclHint'))}</div></div></div>
      <div class="p1-toolbar"><div class="field"><label for="fclContainer">${esc(tx('fclContainer'))}</label><select id="fclContainer">${['20GP','40GP','40HQ'].map(type=>`<option value="${type}"${fcl.containerType===type?' selected':''}>${type}</option>`).join('')}</select></div><strong>${calc.totalCny==null?'—':money(calc.totalCny)}</strong></div>
      <div class="tablewrap"><table class="table p1-table"><thead><tr><th>${esc(tx('fcl_name'))}</th><th>${esc(tx('fcl_category'))}</th><th>${esc(tx('fcl_currency'))}</th><th>${esc(tx('fcl_unit'))}</th><th>${esc(tx('fcl_quantity'))}</th><th>${esc(tx('fcl_unitPrice'))}</th><th>${esc(tx('fcl_minimumCharge'))}</th><th>${esc(tx('fcl_included'))}</th><th>${esc(tx('fcl_total'))}</th><th>${esc(tx('batchActions'))}</th></tr></thead><tbody>${fcl.chargeLines.map((line,index)=>`<tr data-id="${esc(line.id)}"><td><input name="originalName" aria-label="${esc(tx('fcl_name'))}" value="${esc(line.originalName)}"></td><td>${select('category',CHARGE_CATEGORIES,line.category,tx,'charge_')}</td><td>${select('currency',['JPY','USD','CNY'],line.currency,tx)}</td><td>${select('unit',CHARGE_UNITS,line.unit,tx)}</td><td><input name="quantity" type="number" step="any" aria-label="${esc(tx('fcl_quantity'))}" value="${esc(line.quantity??'')}"></td><td><input name="unitPrice" type="number" step="any" aria-label="${esc(tx('fcl_unitPrice'))}" value="${esc(line.unitPrice??'')}"></td><td><input name="minimumCharge" type="number" step="any" aria-label="${esc(tx('fcl_minimumCharge'))}" value="${esc(line.minimumCharge??'')}"></td><td><input name="included" type="checkbox" aria-label="${esc(tx('fcl_included'))}"${line.included?' checked':''}></td><td>${calc.breakdown[index]?.totalCny==null?'—':money(calc.breakdown[index].totalCny)}</td><td><button type="button" class="btn secondary" data-remove="${esc(line.id)}">${esc(tx('batchDelete'))}</button></td></tr>`).join('')}</tbody></table></div>
      <button id="fclAddLine" class="btn secondary" type="button">${esc(tx('fclAddLine'))}</button><p class="hint" role="status">${calc.warnings.length?esc(tx('fclIncomplete')):''}</p>`;
    root.querySelector('#fclContainer').onchange=event=>{fcl.containerType=event.target.value;onChange();render()};
    root.querySelector('#fclAddLine').onclick=()=>{fcl.chargeLines.push(createChargeLine({originalName:'',category:'ocean_freight',currency:'USD',unit:fcl.containerType,quantity:1}));onChange();render()};
    root.querySelector('tbody').onchange=event=>{
      const row=event.target.closest('[data-id]');if(!row)return;
      const line=fcl.chargeLines.find(entry=>entry.id===row.dataset.id);if(!line)return;
      const {name,type}=event.target;line[name]=type==='checkbox'?event.target.checked:type==='number'?(event.target.value===''?null:Number(event.target.value)):event.target.value;
      if(name==='originalName')line.normalizedName=line.originalName;
      line.totalOriginalCurrency=null;onChange();render();
    };
    root.querySelector('tbody').onclick=event=>{const id=event.target.closest('[data-remove]')?.dataset.remove;if(!id)return;fcl.chargeLines=fcl.chargeLines.filter(line=>line.id!==id);onChange();render()};
  }
  render();return {render};
}
