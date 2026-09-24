import {createFreightQuote} from '../models/quote.mjs';
import {createChargeLine,CHARGE_CATEGORIES,CHARGE_UNITS} from '../models/chargeLine.mjs';
import {normalizeQuoteRows,parseQuoteText,pdfTextLines} from '../services/quoteParser.mjs';
import {calculateQuoteTotal,quoteValidity,eligibleQuotes} from '../calculators/quotes.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const metaFields=[['forwarderName','text'],['forwarderContact','text'],['quoteNumber','text'],['quoteDate','date'],['validUntil','date'],['origin','text'],['destination','text'],['carrier','text'],['vesselOrFlight','text'],['etd','date'],['eta','date'],['transitDays','number'],['remarks','text']];
const opt=(name,values,value,tx,prefix='')=>`<select name="${name}" aria-label="${esc(tx('fcl_'+name))}">${value&&!values.includes(value)?`<option value="${esc(value)}" selected>${esc(value)}${name==='unit'?` · ${esc(tx('quoteUnknownUnit'))}`:''}</option>`:''}${values.map(entry=>`<option value="${esc(entry)}"${entry===value?' selected':''}>${esc(prefix?tx(prefix+entry):entry)}</option>`).join('')}</select>`;
const context=batch=>({weightKg:batch.items.reduce((sum,item)=>sum+item.quantity*item.unitWeightKg,0),volumeM3:batch.items.reduce((sum,item)=>sum+item.quantity*item.unitVolumeM3,0),containerCount:1});

export function mountQuoteManager({state,tx,money,onChange}) {
  const root=document.querySelector('#quotes'),comparison=document.querySelector('#quoteCompare');
  let editingId=null,noticeKey='quoteEmptyHint';
  const getQuote=()=>state.activeBatch.quotes.find(quote=>quote.id===editingId)||null;
  const totals=quote=>calculateQuoteTotal(quote,state.activeBatch.exchangeRates,context(state.activeBatch));
  function invalidate(quote){quote.confirmed=false;quote.updatedAt=new Date().toISOString();if(state.activeBatch.selectedQuoteId===quote.id){state.activeBatch.selectedQuoteId=null;state.activeBatch.selectedRoute=null}}
  function render() {
    const batch=state.activeBatch;
    if(editingId&&!getQuote())editingId=null;
    const quote=getQuote();
    root.innerHTML=`<div class="section-head"><div><h2>${esc(tx('quoteTitle'))}</h2><div class="hint">${esc(tx('quoteHint'))}</div></div><button id="newQuote" class="btn primary" type="button">${esc(tx('quoteNew'))}</button></div>
      <div class="tablewrap"><table class="table p1-table"><thead><tr><th>${esc(tx('quote_forwarderName'))}</th><th>${esc(tx('quote_quoteNumber'))}</th><th>${esc(tx('quote_transportMode'))}</th><th>${esc(tx('quote_validUntil'))}</th><th>${esc(tx('quoteAllIn'))}</th><th>${esc(tx('batchStatusLabel'))}</th><th>${esc(tx('batchActions'))}</th></tr></thead><tbody>${batch.quotes.map(entry=>{const result=totals(entry),validity=quoteValidity(entry.validUntil);return `<tr><td>${esc(entry.forwarderName||'—')}</td><td>${esc(entry.quoteNumber||'—')}</td><td>${esc(tx('mode_'+entry.transportMode))}</td><td>${esc(entry.validUntil||'—')} · ${esc(tx('validity_'+validity.status))}</td><td>${result.totalCny==null?'—':money(result.totalCny)}</td><td>${esc(tx(entry.confirmed?'quoteConfirmed':'quoteDraft'))}${batch.selectedQuoteId===entry.id?' · '+esc(tx('quoteSelected')):''}</td><td><button type="button" class="btn secondary" data-open="${esc(entry.id)}">${esc(tx('batchOpen'))}</button>${entry.confirmed?`<button type="button" class="btn secondary" data-select="${esc(entry.id)}">${esc(tx('quoteSelect'))}</button>`:''}<button type="button" class="btn secondary" data-delete="${esc(entry.id)}">${esc(tx('batchDelete'))}</button></td></tr>`}).join('')}</tbody></table></div>
      ${quote?renderReview(quote):`<p class="hint">${esc(tx(batch.quotes.length?'quoteOpenHint':'quoteEmptyHint'))}</p>`}`;
    root.querySelector('#newQuote').onclick=()=>{const created=createFreightQuote({batchId:batch.id,origin:batch.originPort,destination:batch.destinationPort});batch.quotes.push(created);editingId=created.id;noticeKey='quoteDraft';onChange();render()};
    root.querySelector('tbody').onclick=event=>{const open=event.target.closest('[data-open]')?.dataset.open,select=event.target.closest('[data-select]')?.dataset.select,remove=event.target.closest('[data-delete]')?.dataset.delete;if(open){editingId=open;noticeKey='quoteDraft';render()}else if(select){const chosen=batch.quotes.find(entry=>entry.id===select);if(chosen?.confirmed&&totals(chosen).totalCny!=null){batch.selectedQuoteId=chosen.id;batch.selectedRoute=chosen.transportMode;onChange();render()}}else if(remove){if(!window.confirm(tx('quoteDeleteConfirm')))return;batch.quotes=batch.quotes.filter(entry=>entry.id!==remove);if(batch.selectedQuoteId===remove){batch.selectedQuoteId=null;batch.selectedRoute=null}if(editingId===remove)editingId=null;onChange();render()}};
    if(quote)bindReview(quote);
    renderComparison();
  }
  function renderReview(quote) {
    const result=totals(quote),validity=quoteValidity(quote.validUntil);
    return `<div class="p1-section"><div class="section-head"><div><h2>${esc(tx('quoteReview'))}</h2><div class="hint">${esc(tx('quoteReviewHint'))}</div></div><strong>${result.totalCny==null?'—':money(result.totalCny)}</strong></div>
      <div class="p1-grid" id="quoteMeta">${metaFields.map(([key,type])=>`<div class="field"><label for="quote-${key}">${esc(tx('quote_'+key))}</label><input id="quote-${key}" name="${key}" type="${type}"${type==='number'?' min="0" step="any"':''} value="${esc(quote[key]??'')}"></div>`).join('')}
        <div class="field"><label for="quoteMode">${esc(tx('quote_transportMode'))}</label><select id="quoteMode" name="transportMode">${['air','lcl','fcl'].map(mode=>`<option value="${mode}"${quote.transportMode===mode?' selected':''}>${esc(tx('mode_'+mode))}</option>`).join('')}</select></div>
        <div class="field"><label for="quoteContainer">${esc(tx('quote_containerType'))}</label><select id="quoteContainer" name="containerType"><option value="">—</option>${['20GP','40GP','40HQ'].map(type=>`<option value="${type}"${quote.containerType===type?' selected':''}>${type}</option>`).join('')}</select></div></div>
      <div class="p1-toolbar"><label class="btn file">${esc(tx('quoteImport'))}<input id="quoteFile" type="file" accept=".xlsx,.xls,.csv,.pdf" aria-label="${esc(tx('quoteImport'))}"></label><button id="quoteAddLine" class="btn secondary" type="button">${esc(tx('fclAddLine'))}</button></div>
      <div class="tablewrap"><table class="table p1-table quote-review"><thead><tr>${['name','category','currency','unitPrice','unit','quantity','minimumCharge','originalTotal','total','included','note'].map(key=>`<th>${esc(tx('fcl_'+key))}</th>`).join('')}<th>${esc(tx('batchActions'))}</th></tr></thead><tbody>${quote.chargeLines.map((line,index)=>`<tr data-line="${esc(line.id)}"><td><input name="originalName" value="${esc(line.originalName)}" aria-label="${esc(tx('fcl_name'))}"></td><td>${opt('category',CHARGE_CATEGORIES,line.category,tx,'charge_')}</td><td>${opt('currency',['JPY','USD','CNY'],line.currency,tx)}</td><td><input name="unitPrice" type="number" step="any" value="${esc(line.unitPrice??'')}" aria-label="${esc(tx('fcl_unitPrice'))}"></td><td>${opt('unit',CHARGE_UNITS,line.unit,tx)}</td><td><input name="quantity" type="number" step="any" value="${esc(line.quantity??'')}" aria-label="${esc(tx('fcl_quantity'))}"></td><td><input name="minimumCharge" type="number" step="any" value="${esc(line.minimumCharge??'')}" aria-label="${esc(tx('fcl_minimumCharge'))}"></td><td><input name="totalOriginalCurrency" type="number" step="any" value="${esc(line.totalOriginalCurrency??'')}" aria-label="${esc(tx('fcl_originalTotal'))}"></td><td>${result.breakdown[index]?.totalCny==null?'—':money(result.breakdown[index].totalCny)}</td><td><input name="included" type="checkbox"${line.included?' checked':''} aria-label="${esc(tx('fcl_included'))}"></td><td><input name="note" value="${esc(line.note)}" aria-label="${esc(tx('fcl_note'))}"></td><td><button class="btn secondary" type="button" data-remove-line="${esc(line.id)}">${esc(tx('batchDelete'))}</button></td></tr>`).join('')}</tbody></table></div>
      <div class="p1-toolbar"><button id="quoteConfirm" class="btn primary" type="button"${result.totalCny==null?' disabled':''}>${esc(tx('quoteConfirm'))}</button><span class="hint">${esc(tx('validity_'+validity.status))}</span></div>
      <div id="quoteNotice" class="uploadnote show" role="status">${esc(tx(noticeKey))}${result.warnings.length?' · '+result.warnings.map(code=>esc(warningText(code))).join(' · '):''}</div></div>`;
  }
  function warningText(code){return tx(code.startsWith('CHECK_')?'quoteCheck_'+code.slice(6).toLowerCase():code==='UNKNOWN_UNIT'?'quoteUnknownUnit':code==='INCOMPLETE_TOTAL'?'quoteIncomplete':code==='MISSING_CONTAINER'?'quoteMissingContainer':'quoteReviewWarning')}
  function bindReview(quote) {
    root.querySelector('#quoteMeta').onchange=event=>{if(!event.target.name)return;quote[event.target.name]=event.target.type==='number'?(event.target.value===''?null:Number(event.target.value)):event.target.value;invalidate(quote);onChange();render()};
    root.querySelector('#quoteAddLine').onclick=()=>{quote.chargeLines.push(createChargeLine({currency:'CNY',unit:'CUSTOM',category:'other',quantity:1}));invalidate(quote);onChange();render()};
    root.querySelector('.quote-review tbody').onchange=event=>{const row=event.target.closest('[data-line]');if(!row)return;const line=quote.chargeLines.find(entry=>entry.id===row.dataset.line);if(!line)return;const {name,type}=event.target;line[name]=type==='checkbox'?event.target.checked:type==='number'?(event.target.value===''?null:Number(event.target.value)):event.target.value;if(name==='originalName')line.normalizedName=line.originalName;if(['quantity','unitPrice','minimumCharge','unit','currency'].includes(name))line.totalOriginalCurrency=null;invalidate(quote);onChange();render()};
    root.querySelector('.quote-review tbody').onclick=event=>{const id=event.target.closest('[data-remove-line]')?.dataset.removeLine;if(!id)return;quote.chargeLines=quote.chargeLines.filter(entry=>entry.id!==id);invalidate(quote);onChange();render()};
    root.querySelector('#quoteConfirm').onclick=()=>{if(totals(quote).totalCny==null)return;quote.confirmed=true;quote.parserStatus='reviewed';quote.updatedAt=new Date().toISOString();noticeKey='quoteConfirmed';onChange();render()};
    root.querySelector('#quoteFile').onchange=event=>importFile(quote,event.target.files?.[0]);
  }
  async function importFile(quote,file) {
    if(!file)return;
    const batchId=state.activeBatch.id;
    try{
      let parsed=[];
      if(/\.pdf$/i.test(file.name)){
        const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.min.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.8.69/pdf.worker.min.mjs';
        const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;let text='';
        for(let pageNo=1;pageNo<=pdf.numPages;pageNo++){const page=await pdf.getPage(pageNo),content=await page.getTextContent();text+=pdfTextLines(content.items)+'\n'}
        parsed=parseQuoteText(text);
        if(!parsed.length)throw new Error('SCAN_OR_UNRECOGNIZED');
      }else{
        if(!globalThis.XLSX)throw new Error('PARSER_UNAVAILABLE');
        const workbook=XLSX.read(await file.arrayBuffer(),{type:'array'});
        parsed=normalizeQuoteRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{defval:''}));
        if(!parsed.length)throw new Error('UNRECOGNIZED');
      }
      if(state.activeBatch.id!==batchId)return;
      const current=state.activeBatch.quotes.find(entry=>entry.id===quote.id);
      if(!current)return;
      current.chargeLines.push(...parsed);current.sourceFileReference=file.name;current.parserStatus='parsed';invalidate(current);noticeKey='quoteImportReview';onChange();render();
    }catch(error){if(state.activeBatch.id===batchId){noticeKey=error.message==='SCAN_OR_UNRECOGNIZED'?'quoteScannedPdf':'quoteImportError';render()}}
  }
  function renderComparison() {
    const batch=state.activeBatch;
    const quotes=eligibleQuotes(batch);
    if(!quotes.length){comparison.innerHTML=`<p class="hint">${esc(tx('quoteNoConfirmed'))}</p>`;return}
    const fields=[['forwarderName',q=>q.forwarderName],['transportMode',q=>tx('mode_'+q.transportMode)],['carrier',q=>q.carrier],['origin',q=>q.origin],['destination',q=>q.destination],['containerType',q=>q.containerType],['etd',q=>q.etd],['eta',q=>q.eta],['transitDays',q=>q.transitDays],['internationalFreight',q=>money(totals(q).comparison.internationalFreight)],['originCharges',q=>money(totals(q).comparison.originCharges)],['destinationCharges',q=>money(totals(q).comparison.destinationCharges)],['customsCharges',q=>money(totals(q).comparison.customsCharges)],['trucking',q=>money(totals(q).comparison.trucking)],['insurance',q=>money(totals(q).comparison.insurance)],['other',q=>money(totals(q).comparison.other)],['allIn',q=>money(totals(q).totalCny)],['validUntil',q=>q.validUntil],['warnings',q=>totals(q).warnings.map(warningText).join('; ')]];
    comparison.innerHTML=`<div class="section-head"><div><h2>${esc(tx('quoteCompareTitle'))}</h2><div class="hint">${esc(tx('quoteCompareHint'))}</div></div></div><div class="tablewrap"><table class="table p1-table quote-matrix"><thead><tr><th>${esc(tx('quoteCompareField'))}</th>${quotes.map(q=>`<th>${esc(q.forwarderName||q.quoteNumber||'—')}</th>`).join('')}</tr></thead><tbody>${fields.map(([key,value])=>`<tr><th>${esc(tx('quoteCompare_'+key))}</th>${quotes.map(q=>`<td>${esc(value(q)??'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const lcl=quotes.filter(q=>q.transportMode==='lcl').map(q=>totals(q).totalCny);
    const fclByType=['20GP','40GP','40HQ'].map(type=>({type,values:quotes.filter(q=>q.transportMode==='fcl'&&q.containerType===type).map(q=>totals(q).totalCny)}));
    if(lcl.length&&fclByType.some(entry=>entry.values.length)){
      const bestLcl=Math.min(...lcl),volume=context(batch).volumeM3,weight=context(batch).weightKg;
      const prices=fclByType.map(entry=>{
        if(!entry.values.length)return `${entry.type} —`;
        const price=Math.min(...entry.values),direction=price<bestLcl?'quoteLower':price>bestLcl?'quoteHigher':'quoteSame';
        return `${entry.type} ${money(price)} (${esc(tx(direction))}${price===bestLcl?'':` ${money(Math.abs(bestLcl-price))}`})`;
      });
      comparison.innerHTML+=`<p class="hint">${esc(tx('quoteLclFcl'))}: ${volume.toFixed(3)} CBM · ${weight.toFixed(2)} kg · LCL ${money(bestLcl)} · ${prices.join(' · ')}</p>`;
    }
  }
  render();return {render,renderComparison};
}
