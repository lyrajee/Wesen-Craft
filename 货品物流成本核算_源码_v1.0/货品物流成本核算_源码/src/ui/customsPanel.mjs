import {createCustomsRateSnapshot} from '../models/customs.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fields = [
  ['hsCode','text'],['productName','text'],['mfnRate','number'],['provisionalRate','number'],
  ['agreementRate','number'],['effectiveDutyRate','number'],['vatRate','number'],
  ['consumptionTaxRate','number'],['antiDumpingRate','number'],['countervailingRate','number'],
  ['safeguardRate','number'],['regulatoryConditions','text'],['effectiveDate','date'],
  ['source','text'],['sourceReference','text']
];

export function mountCustomsPanel({state,tx,onApply}) {
  const root=document.querySelector('#customs');
  let result=null, noticeKey='customsUnconfigured';
  const fieldHtml=(key,type)=>`<div class="field"><label for="customs-${key}">${esc(tx(`customs_${key}`))}</label><input id="customs-${key}" name="${key}" type="${type}"${type==='number'?' step="any" min="0"':''} value="${esc(result?.[key] ?? '')}"></div>`;
  function render() {
    const batch=state.activeBatch;
    root.innerHTML=`<div class="p1-toolbar"><div class="field p1-query"><label for="customs-query">${esc(tx('customsQueryLabel'))}</label><input id="customs-query" placeholder="${esc(tx('customsQueryPlaceholder'))}"></div><button id="customs-search" class="btn primary" type="button">${esc(tx('customsSearch'))}</button></div>
      <p class="hint">${esc(tx('customsOrigin'))}: ${esc(batch.originCountry)} · ${esc(tx('customsDestination'))}: ${esc(batch.destinationCountry)}</p>
      <p id="customs-notice" class="uploadnote show" role="status" aria-live="polite">${esc(tx(noticeKey))}</p>
      <div class="section-head"><div><h2>${esc(tx('customsManualTitle'))}</h2><div class="hint">${esc(tx('customsManualHint'))}</div></div></div>
      <form id="customs-form" class="p1-grid">${fields.map(([key,type])=>fieldHtml(key,type)).join('')}
        <div class="field"><label for="customs-item">${esc(tx('customsApplyTarget'))}</label><select id="customs-item" required><option value="">${esc(tx('customsSelectItem'))}</option>${batch.items.map(item=>`<option value="${esc(item.id)}">${esc(item.name||item.hsCode||item.id)}</option>`).join('')}</select></div>
        <div class="p1-actions"><button class="btn primary" type="submit">${esc(tx('customsApply'))}</button></div></form>`;
    root.querySelector('#customs-search').onclick=search;
    root.querySelector('#customs-form').onsubmit=apply;
  }
  async function search() {
    const input=root.querySelector('#customs-query');
    const q=input.value.trim();if(!q){input.focus();return}
    const batchId=state.activeBatch.id;
    const button=root.querySelector('#customs-search');button.disabled=true;
    const notice=root.querySelector('#customs-notice');notice.textContent=tx('customsSearching');
    try {
      const response=await fetch('/api/customs?q='+encodeURIComponent(q));
      const data=await response.json().catch(()=>null);
      if(state.activeBatch.id!==batchId)return;
      if(data?.error==='CUSTOMS_PROVIDER_NOT_CONFIGURED'){noticeKey='customsUnconfigured';notice.textContent=tx(noticeKey);return}
      if(!response.ok||!Array.isArray(data?.results))throw new Error('Lookup failed');
      if(!data.results.length){noticeKey='customsNoResults';notice.textContent=tx(noticeKey);return}
      result=createCustomsRateSnapshot({...data.results[0],source:data.results[0].source||data.source,queriedAt:new Date().toISOString()});
      noticeKey='customsReview';render();
    }catch(error){if(state.activeBatch.id===batchId){noticeKey='customsUnavailable';notice.textContent=tx(noticeKey)}}finally{button.disabled=false}
  }
  function apply(event) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const id=root.querySelector('#customs-item').value;
    const item=state.activeBatch.items.find(entry=>entry.id===id);
    if(!item)return;
    const input=Object.fromEntries(fields.map(([key])=>[key,form.get(key)]));
    if(input.effectiveDutyRate===''||input.vatRate===''){
      root.querySelector('#customs-notice').textContent=tx('customsRatesRequired');return;
    }
    const snapshot=createCustomsRateSnapshot({...input,originCountry:state.activeBatch.originCountry,destinationCountry:state.activeBatch.destinationCountry,source:input.source||'Manual',queriedAt:result?.queriedAt||new Date().toISOString(),confirmedByUser:true});
    item.hsCode=snapshot.hsCode;
    item.dutyRate=snapshot.effectiveDutyRate;
    item.vatRate=snapshot.vatRate;
    item.customsRateSnapshot=snapshot;
    item.updatedAt=new Date().toISOString();
    onApply();
    result=null;noticeKey='customsApplied';render();
  }
  render();
  return {render,reset(){result=null;noticeKey='customsUnconfigured';render()}};
}
