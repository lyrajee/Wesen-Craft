import {applyPositionSnapshot,createRouteLeg,createTrackingEvent,detectTrackingAlerts,getSuggestedBatchStatus,normalizeTrackingEvent,SEA_TIMELINE_TYPES,AIR_TIMELINE_TYPES} from '../models/tracking.mjs';
import {createTrackingRepository} from '../repositories/trackingRepository.mjs';
import {renderTrackingMap} from './trackingMap.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const localeFor=lang=>lang==='zh'?'zh-CN':lang==='ja'?'ja-JP':'en-US';
const completeTypes=new Set(['warehouse_received','completed']);
const seaEvents=SEA_TIMELINE_TYPES,airEvents=AIR_TIMELINE_TYPES;
const errorKey={AISSTREAM_API_KEY_MISSING:'trackingSeaKeyMissing',AIS_POSITION_NOT_AVAILABLE:'trackingNoRecentAis',TRACKING_INVALID_ICAO24:'trackingInvalidIcao24',TRACKING_INVALID_CALLSIGN:'trackingInvalidCallsign',TRACKING_INVALID_MMSI:'trackingInvalidMmsi',TRACKING_IDENTIFIER_REQUIRES_MMSI:'trackingIdentifierNeeded',TRACKING_IDENTIFIER_REQUIRED:'trackingIdentifierRequired',TRACKING_NO_RESULT:'trackingNoProviderResult',AIRCRAFT_NOT_FOUND:'trackingAircraftNotFound',PROVIDER_RATE_LIMITED:'trackingRateLimited',PROVIDER_SUBSCRIPTION_TIMEOUT:'trackingSubscriptionTimeout',PROVIDER_SUBSCRIPTION_REJECTED:'trackingSubscriptionRejected',PROVIDER_TIMEOUT:'trackingTimeout',PROVIDER_UNAVAILABLE:'trackingUnavailable',PROVIDER_INVALID_RESPONSE:'trackingInvalidResponse',PROVIDER_UNAUTHORIZED:'trackingUnauthorized',PROVIDER_REQUEST_FAILED:'trackingUnavailable'};

export function buildTrackingIdentifierFields(mode,field){
  const specs=mode==='sea' ? [
    ['containerNo','trackingContainer','text','',''],['blNo','trackingBl','text','',''],['vesselName','trackingVessel','text','',''],
    ['imo','trackingImo','text','inputmode="numeric"',''],['mmsi','trackingMmsi','text','inputmode="numeric"','trackingMmsiLiveHint'],['voyageNo','trackingVoyage','text','','']
  ]:[
    ['flightNo','trackingFlight','text','','trackingFlightNoHint'],['callsign','trackingCallsign','text','','trackingCallsignHint'],
    ['icao24','trackingIcao24','text','maxlength="6" autocapitalize="characters"','trackingIcao24Hint'],['awbNo','trackingAwb','text','',''],
    ['departureAirport','trackingDepartureAirport','text','',''],['arrivalAirport','trackingArrivalAirport','text','',''],['flightDate','trackingFlightDate','date','','']
  ];
  return specs.map(([name,key,type,attrs,hint])=>field(name,key,type,'',attrs,hint)).join('');
}
export function addFormState(currentMode,isOpen){return {mode:currentMode,open:!isOpen};}
export function trackingLookupError(mode,identifiers={}){
  if(mode==='sea'){
    const mmsi=String(identifiers.mmsi||'').trim();
    return !mmsi?'TRACKING_IDENTIFIER_REQUIRES_MMSI':/^\d{9}$/.test(mmsi)?'':'TRACKING_INVALID_MMSI';
  }
  const icao24=String(identifiers.icao24||'').trim();
  const callsign=String(identifiers.callsign||'').trim().replace(/\s+/g,'');
  if(icao24&&!/^[0-9a-f]{6}$/i.test(icao24))return 'TRACKING_INVALID_ICAO24';
  if(callsign&&!/^[a-z0-9]{2,8}$/i.test(callsign))return 'TRACKING_INVALID_CALLSIGN';
  return icao24||callsign?'':'TRACKING_IDENTIFIER_REQUIRED';
}

export function mountTrackingPanel({state,tx,getLang,onMutation}){
  const root=document.querySelector('#trackingPanel'),repository=createTrackingRepository(state.repository);
  let mode='sea',selectedId=null,openForm=false,active=false,initialModeChosen=false,timer=null,lastError='',seaProviderConfigured=null,providerStatusRequest=null,refreshingTrackingId=null;
  const refreshControllers=new Map();
  const isRefreshing=id=>{const controller=refreshControllers.get(id);return refreshingTrackingId===id&&Boolean(controller&&!controller.signal.aborted);};
  const abortRefresh=id=>{const controller=refreshControllers.get(id);if(controller&&!controller.signal.aborted)controller.abort();};
  const activeBatch=()=>state.activeBatch;
  const fmt=value=>{if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?esc(value):date.toLocaleString(localeFor(getLang()),{dateStyle:'medium',timeStyle:'short'});};
  const label=(key,fallback='')=>{const value=tx(key);return value===key?fallback:value;};
  function saveTracking(tracking){const saved=repository.update(tracking.batchId,tracking);onMutation?.(saved);return saved;}
  async function loadSeaProviderStatus(){
    if(seaProviderConfigured!==null)return seaProviderConfigured;
    if(!providerStatusRequest)providerStatusRequest=(async()=>{
      try{const response=await fetch('/api/tracking/status',{cache:'no-store'}),data=await response.json().catch(()=>null);if(response.ok&&typeof data?.configured==='boolean')seaProviderConfigured=data.configured;}
      catch{seaProviderConfigured=null;}
      finally{providerStatusRequest=null;}
      return seaProviderConfigured;
    })();
    return providerStatusRequest;
  }
  function providerBanner(tracking){
    if(!tracking){const message=mode==='air'?tx('trackingProviderReady'):seaProviderConfigured===false?tx('trackingSeaKeyMissing'):seaProviderConfigured===true?tx('trackingProviderConfigured'):tx('trackingProviderChecking');return `<div class="tracking-notice info" role="status">${esc(message)}</div>`;}
    if(isRefreshing(tracking.id)&&tracking.mode==='sea')return `<div class="tracking-notice info" role="status">${esc(tx('trackingWaitingForPosition'))}</div>`;
    const providerState=tracking.lastProviderState||'';
    const stateMessage={no_live_signal:'trackingNoLiveSignal',no_new_position:'trackingNoNewPosition',last_known:'trackingLastKnownMessage'}[providerState]|| (tracking.trackingStatus==='last_known'?'trackingLastKnownMessage':'');
    if(stateMessage&&!tracking.lastProviderError){const lastPosition=tracking.position?.timestamp||tracking.position?.lastSeen||tracking.lastSuccessfulUpdate;return `<div class="tracking-notice info" role="status">${esc(tx(stateMessage))}${lastPosition&&tracking.trackingStatus==='last_known'?`<span>${esc(tx('trackingLastKnownPosition'))}: ${esc(fmt(lastPosition))}</span>`:''}</div>`;}
    const key=tracking.lastProviderError||'';
    if(key){const message=key==='TRACKING_IDENTIFIER_REQUIRED'?tx('trackingAirFlightOnly').replace('{flightNo}',tracking.identifiers.flightNo||''):tx(errorKey[key]||'trackingUnavailable');const lastPosition=tracking.position?.timestamp||tracking.position?.lastSeen||tracking.lastSuccessfulUpdate;return `<div class="tracking-notice ${key.includes('MISSING')?'info':'warning'}" role="status">${esc(message)}${lastPosition?`<span>${esc(tx('trackingLastKnownPosition'))}: ${esc(fmt(lastPosition))}</span>`:''}</div>`;}
    return `<div class="tracking-notice info" role="status">${esc(tx(mode==='sea'?'trackingSeaDisclaimer':'trackingAirDisclaimer'))}</div>`;
  }
  function formField(name,key,type='text',value='',attrs='',hintKey=''){
    return `<label class="tracking-field"><span>${esc(tx(key))}</span><input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}>${hintKey?`<small>${esc(tx(hintKey))}</small>`:''}</label>`;
  }
  function seedForBatch(batch){
    const quote=(batch.quotes||[]).find(item=>item.id===batch.selectedQuoteId)||null;
    const selected=quote?.transportMode||batch.selectedRoute||'air';const nextMode=selected==='air'?'air':'sea';
    return {mode:nextMode,quote};
  }
  function renderCreateForm(batch){
    const ids=buildTrackingIdentifierFields(mode,formField);
    const seed=seedForBatch(batch),quote=seed.quote;
    return `<form id="trackingCreateForm" class="tracking-form"><div class="tracking-form-head"><h3>${esc(tx('trackingAddTitle'))}</h3><p>${esc(tx('trackingPrefilledRoute'))}</p></div><div class="tracking-form-grid">${ids}${formField('origin','trackingOrigin','text',quote?.origin||batch.originPort)}${formField('destination','trackingDestination','text',quote?.destination||batch.destinationPort)}${formField('carrier','trackingCarrier','text',quote?.carrier||quote?.forwarderName||'')}${formField('etd','trackingEtd','datetime-local',quote?.etd||batch.etd)}${formField('eta','trackingEta','datetime-local',quote?.eta||batch.eta)}${formField('freeTimeDays','trackingFreeTimeDays','number','','min="0" step="1"')}${formField('freeTimeEndDate','trackingFreeTimeEnd','date')}</div><div class="tracking-form-actions"><button class="btn primary" type="submit">${esc(tx('trackingCreate'))}</button><button class="btn secondary" id="trackingCancelCreate" type="button">${esc(tx('cancel'))}</button></div></form>`;
  }
  function render(batch=activeBatch()){
    if(!batch)return;
    root.querySelector('#trackingMap')?._wesenMap?.remove();
    const all=batch.trackings||[];let records=all.filter(item=>item.mode===mode);
    if(selectedId&&!records.some(item=>item.id===selectedId))selectedId=null;
    const tracking=records.find(item=>item.id===selectedId)||records[0]||null;if(tracking)selectedId=tracking.id;
    const tab=(value,key)=>`<button type="button" role="tab" aria-selected="${mode===value}" class="tracking-mode-tab ${mode===value?'on':''}" data-mode="${value}">${esc(tx(key))}</button>`;
    const providerKey=mode==='sea'?'trackingSeaProvider':'trackingAirProvider';
    const tabs=`<div class="tracking-mode-tabs" role="tablist" aria-label="${esc(tx('trackingMode'))}">${tab('sea','trackingSea')}${tab('air','trackingAir')}</div>`;
    const refreshing=isRefreshing(tracking?.id);
    const controls=`<div class="tracking-toolbar">${tabs}<button class="btn secondary" id="trackingRefresh" type="button" ${!tracking||refreshing?'disabled':''}><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-refresh"></use></svg>${esc(refreshing?tx('trackingRefreshing'):tx('trackingRefresh'))}</button><button class="btn primary" id="trackingAdd" type="button">${esc(tx(openForm?'trackingCloseAdd':'trackingAdd'))}</button></div>`;
    const list=records.length?`<div class="tracking-record-list" role="list">${records.map(item=>`<button class="tracking-record ${item.id===tracking?.id?'selected':''}" type="button" role="listitem" data-record="${esc(item.id)}"><strong>${esc(item.identifiers?.containerNo||item.identifiers?.flightNo||item.identifiers?.callsign||item.identifiers?.icao24||item.identifiers?.vesselName||item.identifiers?.imo||item.identifiers?.mmsi||item.identifiers?.awbNo||tx('trackingUnidentified'))}</strong><span>${esc(item.carrier?.name||item.carrier?.vesselOrFlight||tx(providerKey))}</span><small>${esc(tx(isRefreshing(item.id)?'trackingStatus_querying':`trackingStatus_${item.trackingStatus}`))}</small></button>`).join('')}</div>`:`<div class="tracking-empty"><strong>${esc(tx('trackingEmpty'))}</strong><p>${esc(mode==='sea'?tx('trackingEmptySea'):tx('trackingEmptyAir'))}</p></div>`;
    const form=openForm?renderCreateForm(batch):'';
    root.innerHTML=`<div class="tracking-batch-line"><div><span>${esc(tx('trackingCurrentBatch'))}</span><strong>${esc(batch.name||batch.batchNo||tx('unnamedBatch'))}</strong></div><div class="tracking-batch-status"><span>${esc(tx('batchStatusLabel'))}</span><strong>${esc(tx(`batchStatus_${batch.status}`))}</strong></div></div>${controls}${providerBanner(tracking)}${form}<div class="tracking-content">${list}<div class="tracking-detail" id="trackingDetail">${tracking?renderDetail(tracking,batch):''}</div></div>`;
    root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{clearTimeout(timer);timer=null;abortRefresh(selectedId);mode=button.dataset.mode;selectedId=all.find(item=>item.mode===mode)?.id||null;openForm=false;render();activateSelected();});
    root.querySelectorAll('[data-record]').forEach(button=>button.onclick=()=>{clearTimeout(timer);timer=null;const nextId=button.dataset.record;if(nextId!==selectedId)abortRefresh(selectedId);selectedId=nextId;lastError='';render();activateSelected();});
    root.querySelector('#trackingAdd').onclick=()=>{const next=addFormState(mode,openForm);mode=next.mode;openForm=next.open;render();};
    root.querySelector('#trackingRefresh')?.addEventListener('click',()=>tracking&&refresh(tracking));
    root.querySelector('#trackingCancelCreate')?.addEventListener('click',()=>{openForm=false;render();});
    root.querySelector('#trackingCreateForm')?.addEventListener('submit',create);
    const remove=root.querySelector('#trackingDelete');if(remove)remove.onclick=()=>{if(!globalThis.confirm(tx('trackingDeleteConfirm')))return;clearTimeout(timer);timer=null;repository.remove(batch.id,tracking.id);selectedId=null;onMutation?.();render();schedulePoll();};
    root.querySelector('#trackingManualForm')?.addEventListener('submit',addManualEvent);
    root.querySelector('#trackingFreeTimeForm')?.addEventListener('submit',saveFreeTime);
    root.querySelectorAll('[data-apply-batch-status]').forEach(button=>button.onclick=()=>applyBatchStatus(tracking,batch,button.dataset.applyBatchStatus));
    if(tracking)void renderTrackingMap(root.querySelector('#trackingMap'),tracking,tx);
  }
  function renderDetail(tracking,batch){
    const position=tracking.position?.lat!=null?`${tracking.position.lat.toFixed(4)}, ${tracking.position.lng.toFixed(4)}`:'—';
    const lookupIdentifier=tracking.mode==='sea'?tracking.identifiers.mmsi:tracking.identifiers.icao24||tracking.identifiers.callsign;
    const positionLabel=tracking.position&&tracking.trackingStatus!=='live'?'trackingLastKnownPosition':'trackingCurrentPosition';
    const ids=tracking.mode==='sea'?[
      ['trackingVessel',tracking.identifiers.vesselName||tracking.carrier?.vesselOrFlight],['trackingVoyage',tracking.identifiers.voyageNo||tracking.carrier?.voyageNo],['trackingContainer',tracking.identifiers.containerNo],['trackingBl',tracking.identifiers.blNo],['trackingImo',tracking.identifiers.imo],['trackingMmsi',tracking.identifiers.mmsi]
    ]:[['trackingFlight',tracking.identifiers.flightNo],['trackingCallsign',tracking.identifiers.callsign],['trackingIcao24',tracking.identifiers.icao24],['trackingRegistration',tracking.identifiers.registration],['trackingAirline',tracking.carrier?.name],['trackingAwb',tracking.identifiers.awbNo],['trackingDepartureAirport',tracking.schedule.departureAirport?.code||tracking.identifiers.departureAirport],['trackingArrivalAirport',tracking.schedule.arrivalAirport?.code||tracking.identifiers.arrivalAirport]];
    const fields=[['trackingLookupIdentifier',lookupIdentifier],['trackingOrigin',tracking.origin?.name||tracking.origin?.code],['trackingDestination',tracking.destination?.name||tracking.destination?.code],['trackingEtd',tracking.schedule.etd||tracking.schedule.scheduledDeparture],['trackingEta',tracking.schedule.eta||tracking.schedule.estimatedArrival],['trackingPositionTimestamp',tracking.position?.timestamp||tracking.position?.lastSeen],['trackingLastSuccessful',tracking.lastSuccessfulUpdate],['trackingLastProviderUpdate',tracking.lastProviderUpdate],['trackingRefreshState',isRefreshing(tracking.id)?tx('trackingStatus_querying'):tx(`trackingStatus_${tracking.trackingStatus}`)]];
    const item=(key,value)=>`<div class="tracking-value"><dt>${esc(tx(key))}</dt><dd>${esc(value?fmt(value):'—')}</dd></div>`;
    const idsHtml=ids.map(([key,value])=>item(key,value)).join(''),summaryHtml=fields.map(([key,value])=>item(key,value)).join('');
    const detailRows=[
      ['trackingLatitude',tracking.position?.lat==null?'':tracking.position.lat],
      ['trackingLongitude',tracking.position?.lng==null?'':tracking.position.lng],
      ['trackingGroundSpeed',tracking.position?.speed==null?'':`${tracking.position.speed} kn`],
      ['trackingAltitude',tracking.mode==='air'&&tracking.position?.altitude!=null?`${tracking.position.altitude} ft`:'' ],
      ['trackingHeading',tracking.position?.heading==null?'':`${tracking.position.heading}°`],
      ['trackingCourse',tracking.position?.course==null?'':`${tracking.position.course}°`],
      ['trackingNavigationStatus',tracking.mode==='sea'&&tracking.position?.navigationStatus!=null?tracking.position.navigationStatus:'']
    ].filter(([,value])=>value!=='').map(([key,value])=>`<div class="tracking-value"><dt>${esc(tx(key))}</dt><dd>${esc(value)}</dd></div>`).join('');
    const etaSource=tracking.schedule.etaSource||'—',etaUpdated=tracking.schedule.etaUpdatedAt||null;
    const alerts=(tracking.alerts||[]).filter(alert=>!alert.resolvedAt);
    const alertHtml=alerts.length?alerts.map(alert=>`<li class="tracking-alert ${esc(alert.severity)}"><div><strong>${esc(tx(alert.title))}</strong><span>${esc(alert.metadata?.delayHours?`${alert.metadata.delayHours}h`:alert.metadata?.daysRemaining!=null?`${alert.metadata.daysRemaining}d`:'')}</span></div><p>${esc(alert.source==='provider'?tx('trackingSourceProvider'):alert.source==='manual'?tx('trackingSourceManual'):tx('trackingSourceSystem'))}</p></li>`).join(''):`<li class="tracking-no-alerts">${esc(tx('trackingNoAlerts'))}</li>`;
    const events=(tracking.events||[]).slice().sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
    const timeline=events.length?events.map(event=>`<li class="tracking-event ${event.source==='manual'?'manual':''}"><span class="tracking-event-dot" aria-hidden="true"></span><div><div class="tracking-event-head"><strong>${esc(tx(`trackingStatus_${event.normalizedType}`)===`trackingStatus_${event.normalizedType}`?event.description||event.originalType:tx(`trackingStatus_${event.normalizedType}`))}</strong><time>${esc(fmt(event.timestamp))}</time></div><p>${esc(event.description)}${event.location?` · ${esc(event.location)}`:''}</p><small>${esc(event.source==='manual'?tx('trackingSourceManual'):tx('trackingSourceProvider'))} · ${esc(event.provider)}</small></div></li>`).join(''):`<li class="tracking-no-alerts">${esc(tx('trackingNoEvents'))}</li>`;
    const suggestion=getSuggestedBatchStatus(tracking,batch.status);
    const suggestionHtml=suggestion?`<div class="tracking-suggestion" role="status"><span>${esc(tx('trackingBatchSuggestion'))}: <strong>${esc(tx(`batchStatus_${suggestion.status}`))}</strong></span><button class="btn secondary" type="button" data-apply-batch-status="${esc(suggestion.status)}">${esc(tx('trackingApplySuggestion'))}</button></div>`:'';
    const eventOptions=(tracking.mode==='air'?airEvents:seaEvents).map(type=>`<option value="${esc(type)}">${esc(tx(`trackingStatus_${type}`))}</option>`).join('');
     return `<div class="tracking-summary-head"><div><span class="tracking-status ${esc(tracking.trackingStatus)}">${esc(tx(`trackingStatus_${tracking.trackingStatus}`))}</span><h2>${esc(tracking.carrier?.vesselOrFlight||tracking.identifiers.vesselName||tracking.identifiers.flightNo||tracking.identifiers.callsign||tracking.identifiers.icao24||tracking.identifiers.containerNo||tracking.identifiers.awbNo||tx('trackingUnidentified'))}</h2></div><button class="btn secondary" type="button" id="trackingDelete">${esc(tx('trackingRemove'))}</button></div>${suggestionHtml}<section class="tracking-section"><div class="tracking-section-title"><h3>${esc(tx('trackingSummary'))}</h3><span>${esc(tx(tracking.mode==='sea'?'trackingVesselOnly':'trackingFlightOnly'))}</span></div><dl class="tracking-values">${summaryHtml}<div class="tracking-value"><dt>${esc(tx('trackingEtaSource'))}</dt><dd>${esc(etaSource)}</dd></div><div class="tracking-value"><dt>${esc(tx('trackingEtaUpdated'))}</dt><dd>${esc(fmt(etaUpdated))}</dd></div><div class="tracking-value"><dt>${esc(tx(positionLabel))}</dt><dd>${esc(position)}</dd></div></dl></section><section class="tracking-section"><div class="tracking-section-title"><h3>${esc(tx('trackingMap'))}</h3><span>${esc(tracking.position?.source||'')}</span></div><div id="trackingMap" class="tracking-map"></div></section><section class="tracking-section"><div class="tracking-section-title"><h3>${esc(tx('trackingTimeline'))}</h3><details class="tracking-add-event"><summary>${esc(tx('trackingAddEvent'))}</summary><form id="trackingManualForm" class="tracking-manual-form"><label><span>${esc(tx('trackingEventType'))}</span><select name="normalizedType">${eventOptions}</select></label><label><span>${esc(tx('trackingEventDescription'))}</span><input name="description" required maxlength="200"></label><label><span>${esc(tx('trackingEventLocation'))}</span><input name="location" maxlength="120"></label><label><span>${esc(tx('trackingEventTime'))}</span><input name="timestamp" type="datetime-local"></label><button class="btn primary" type="submit">${esc(tx('trackingSaveEvent'))}</button></form></details></div><ol class="tracking-timeline">${timeline}</ol></section><details class="tracking-section tracking-details"><summary>${esc(tx('trackingDetails'))}</summary><dl class="tracking-values">${idsHtml}${detailRows}<div class="tracking-value"><dt>${esc(tx('trackingProvider'))}</dt><dd>${esc(tracking.provider)}</dd></div><div class="tracking-value"><dt>${esc(tx(positionLabel))}</dt><dd>${esc(position)}</dd></div><div class="tracking-value"><dt>${esc(tx('trackingLastSystemUpdate'))}</dt><dd>${esc(fmt(tracking.lastSystemUpdate))}</dd></div><div class="tracking-value"><dt>${esc(tx('trackingLastSuccessful'))}</dt><dd>${esc(fmt(tracking.lastSuccessfulUpdate))}</dd></div><div class="tracking-value"><dt>${esc(tx('trackingLastProviderUpdate'))}</dt><dd>${esc(fmt(tracking.lastProviderUpdate))}</dd></div></dl>${tracking.routeLegs?.length?`<ol class="tracking-legs">${tracking.routeLegs.slice().sort((a,b)=>a.sequence-b.sequence).map(leg=>`<li><strong>${esc(leg.sequence)}. ${esc(leg.origin.name||leg.origin.code||'—')} → ${esc(leg.destination.name||leg.destination.code||'—')}</strong><span>${esc(leg.carrier)} ${esc(leg.vesselOrFlight)} · ${esc(leg.status)}</span></li>`).join('')}</ol>`:''}<form id="trackingFreeTimeForm" class="tracking-free-time">${formField('freeTimeDays','trackingFreeTimeDays','number',tracking.freeTimeDays??'','min="0" step="1"')}${formField('freeTimeEndDate','trackingFreeTimeEnd','date',tracking.freeTimeEndDate||'')}<button class="btn secondary" type="submit">${esc(tx('trackingSaveFreeTime'))}</button></form></details><section class="tracking-section"><div class="tracking-section-title"><h3>${esc(tx('trackingAlerts'))}</h3></div><ul class="tracking-alerts">${alertHtml}</ul></section><p class="tracking-cargo-note">${esc(tx(tracking.mode==='sea'?'trackingSeaCargoNote':'trackingAirCargoNote'))}</p>`;
  }
  function create(event){
    event.preventDefault();const batch=activeBatch(),form=new FormData(event.currentTarget),value=key=>String(form.get(key)||'').trim();
    const selected=seedForBatch(batch),quote=selected.quote,formMode=mode;
    const origin=value('origin'),destination=value('destination'),carrier=value('carrier');
    const leg=createRouteLeg({sequence:1,mode:formMode,origin:{name:origin},destination:{name:destination},carrier:carrier||quote?.forwarderName||'',vesselOrFlight:formMode==='sea'?value('vesselName'):value('flightNo'),etd:value('etd'),eta:value('eta'),status:'planned'});
    const identifiers=formMode==='sea'?{containerNo:value('containerNo'),blNo:value('blNo'),vesselName:value('vesselName'),imo:value('imo'),mmsi:value('mmsi'),voyageNo:value('voyageNo')}:{flightNo:value('flightNo').toUpperCase(),callsign:value('callsign').toUpperCase(),icao24:value('icao24').toLowerCase(),awbNo:value('awbNo'),departureAirport:value('departureAirport').toUpperCase(),arrivalAirport:value('arrivalAirport').toUpperCase(),flightDate:value('flightDate')};
    const tracking=repository.create(batch.id,{mode:formMode,provider:formMode==='sea'?'AISStream.io':'adsb.fi',trackingStatus:'configured',identifiers,origin:{name:origin},destination:{name:destination},carrier:{name:carrier,vesselOrFlight:formMode==='sea'?value('vesselName'):value('flightNo')||value('callsign'),voyageNo:value('voyageNo')},schedule:{etd:value('etd'),eta:value('eta'),etaSource:value('eta')?'Manual':null,etaUpdatedAt:value('eta')?new Date().toISOString():null,scheduledDeparture:formMode==='air'?value('etd'):null},etaHistory:value('eta')?[{eta:value('eta'),source:'Manual',observedAt:new Date().toISOString()}]:[],routeLegs:[leg],freeTimeDays:value('freeTimeDays')===''?null:Number(value('freeTimeDays')),freeTimeEndDate:value('freeTimeEndDate')||null});
    selectedId=tracking.id;openForm=false;const stored=repository.get(batch.id,tracking.id);if(stored){recomputeAlerts(stored);saveTracking(stored);}onMutation?.();render();if(stored&&root.closest('#tracking')?.classList.contains('on'))void refresh(stored);
  }
  function addManualEvent(event){
    event.preventDefault();const batch=activeBatch(),tracking=repository.get(batch.id,selectedId);if(!tracking)return;
    const form=new FormData(event.currentTarget),normalizedType=String(form.get('normalizedType')),rawTime=String(form.get('timestamp')||'');
    const entry=createTrackingEvent({normalizedType,originalType:tx(`trackingStatus_${normalizedType}`),description:String(form.get('description')||'').trim(),location:String(form.get('location')||'').trim(),timestamp:rawTime?new Date(rawTime).toISOString():new Date().toISOString(),provider:'Manual',source:'manual',confirmed:true});
    tracking.events.push(entry);tracking.trackingStatus=completeTypes.has(normalizedType)?'completed':'configured';tracking.lastSystemUpdate=new Date().toISOString();recomputeAlerts(tracking);saveTracking(tracking);render();
  }
  function saveFreeTime(event){event.preventDefault();const tracking=repository.get(activeBatch().id,selectedId);if(!tracking)return;const form=new FormData(event.currentTarget),days=String(form.get('freeTimeDays')||''),date=String(form.get('freeTimeEndDate')||'');tracking.freeTimeDays=days===''?null:Number(days);tracking.freeTimeEndDate=date||null;recomputeAlerts(tracking);saveTracking(tracking);render();}
  function recomputeAlerts(tracking){tracking.alerts=detectTrackingAlerts(tracking);tracking.lastSystemUpdate=new Date().toISOString();}
  function applyBatchStatus(tracking,batch,status){batch.status=status;state.repository.update(batch);onMutation?.();render();}
  async function refresh(tracking){
    if(isRefreshing(tracking.id))return;
    const validation=trackingLookupError(tracking.mode,tracking.identifiers);
    if(validation){const latest=repository.get(tracking.batchId,tracking.id);if(latest){latest.lastProviderError=validation;latest.trackingStatus=latest.position?.lat!=null?'last_known':'configured';latest.lastProviderState=validation;saveTracking(latest);}lastError=validation;if(selectedId===tracking.id)render();return;}
    const controller=new AbortController();
    refreshControllers.set(tracking.id,controller);refreshingTrackingId=tracking.id;lastError='';
    if(selectedId===tracking.id)render();
    try{
      if(tracking.mode==='sea'&&await loadSeaProviderStatus()===false){const latest=repository.get(tracking.batchId,tracking.id);if(latest){latest.lastProviderError='AISSTREAM_API_KEY_MISSING';latest.lastProviderState='provider_not_configured';latest.trackingStatus='provider_not_configured';saveTracking(latest);}return;}
      if(controller.signal.aborted)return;
      const response=await fetch(`/api/tracking/${tracking.mode}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({identifiers:tracking.identifiers}),signal:controller.signal});
      const data=await response.json().catch(()=>null);if(!response.ok||!data||data.ok!==true||data.error)throw new Error(data?.error||'PROVIDER_UNAVAILABLE');
      if(controller.signal.aborted)return;
      const latest=repository.get(tracking.batchId,tracking.id);if(!latest)return;
      const nextEta=data.schedule?.eta||data.schedule?.estimatedArrival||'';
      if(nextEta&&nextEta!==latest.schedule.eta)latest.etaHistory.push({eta:nextEta,source:data.schedule.etaSource||data.provider,observedAt:data.fetchedAt||new Date().toISOString()});
      latest.schedule={...latest.schedule,...data.schedule,eta:nextEta||latest.schedule.eta,etaSource:nextEta?(data.schedule?.etaSource||data.provider):latest.schedule.etaSource,etaUpdatedAt:nextEta?(data.schedule?.etaUpdatedAt||data.fetchedAt):latest.schedule.etaUpdatedAt};
      latest.carrier={...latest.carrier,name:data.identifiers?.airline||latest.carrier.name,vesselOrFlight:data.identifiers?.vesselName||data.identifiers?.flightNo||latest.carrier.vesselOrFlight};
      for(const key of ['imo','mmsi','callsign','icao24','registration'])if(data.identifiers?.[key])latest.identifiers[key]=data.identifiers[key];
      if(data.schedule?.departureAirport?.lat!=null)latest.origin={...latest.origin,...data.schedule.departureAirport};if(data.schedule?.arrivalAirport?.lat!=null)latest.destination={...latest.destination,...data.schedule.arrivalAirport};
      for(const raw of data.events||[]){const normalized=normalizeTrackingEvent(raw,data.provider,'provider');if(!latest.events.some(item=>item.source==='provider'&&item.originalType===normalized.originalType&&item.timestamp===normalized.timestamp))latest.events.push(normalized);}
      const completed=Boolean(data.status?.completed||data.status?.landed||completeTypes.has(latest.events.at(-1)?.normalizedType));
      applyPositionSnapshot(latest,data.position,data.fetchedAt||new Date().toISOString(),completed,data.state);
      latest.lastProviderError='';
      recomputeAlerts(latest);saveTracking(latest);
    }catch(error){
      if(controller.signal.aborted||error?.name==='AbortError')return;
      const code=String(error?.message||'PROVIDER_UNAVAILABLE'),latest=repository.get(tracking.batchId,tracking.id);if(latest){latest.lastProviderError=code;latest.lastProviderUpdate=new Date().toISOString();const hasLastPosition=latest.position?.lat!=null&&latest.position?.lng!=null;const invalid=code.startsWith('TRACKING_IDENTIFIER')||code==='TRACKING_INVALID_MMSI'||code==='TRACKING_INVALID_ICAO24';latest.lastProviderState=code==='AISSTREAM_API_KEY_MISSING'?'provider_not_configured':invalid?code:'provider_unavailable';latest.trackingStatus=code==='AISSTREAM_API_KEY_MISSING'?'provider_not_configured':invalid?(hasLastPosition?'last_known':'configured'):hasLastPosition?'last_known':'provider_unavailable';recomputeAlerts(latest);saveTracking(latest);}lastError=code;
    }finally{
      const ownsRequest=refreshControllers.get(tracking.id)===controller;
      if(ownsRequest)refreshControllers.delete(tracking.id);
      if(refreshingTrackingId===tracking.id)refreshingTrackingId=null;
      if(selectedId===tracking.id&&active)render();
      if(selectedId===tracking.id)schedulePoll();
    }
  }
  function schedulePoll(){clearTimeout(timer);timer=null;if(!active||!root.closest('#tracking')?.classList.contains('on')||document.hidden)return;const tracking=repository.get(activeBatch().id,selectedId);if(!tracking||trackingLookupError(tracking.mode,tracking.identifiers)||tracking.trackingStatus==='completed'||completeTypes.has(tracking.events?.at(-1)?.normalizedType))return;if(tracking.mode==='air'&&(tracking.status?.landed||tracking.position?.onGround))return;timer=setTimeout(()=>void refresh(tracking),tracking.mode==='air'?60000:180000);}
  function activateSelected(){if(!active)return;const tracking=repository.get(activeBatch().id,selectedId);if(!tracking)return;const interval=tracking.mode==='air'?60000:150000,last=Date.parse(tracking.lastProviderUpdate||'');if(!Number.isFinite(last)||Date.now()-last>=interval)void refresh(tracking);else schedulePoll();}
  function enter(){active=true;const batch=activeBatch();if(!initialModeChosen){mode=seedForBatch(batch).mode;initialModeChosen=true;}if(!selectedId)selectedId=batch.trackings?.find(item=>item.mode===mode)?.id||null;render();if(mode==='sea')void loadSeaProviderStatus().then(()=>{if(active)render();});const tracking=repository.get(batch.id,selectedId);if(!tracking)return;const interval=tracking.mode==='air'?60000:150000,last=Date.parse(tracking.lastProviderUpdate||'');if(!Number.isFinite(last)||Date.now()-last>=interval)void refresh(tracking);else schedulePoll();}
  function leave(){active=false;clearTimeout(timer);timer=null;refreshingTrackingId=null;for(const controller of refreshControllers.values())if(!controller.signal.aborted)controller.abort();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)leave();else if(root.closest('#tracking')?.classList.contains('on'))enter();});
  render();
  return {render,enter,leave};
}



