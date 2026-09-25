import {isoNow, makeId} from './product.mjs';

export const SEA_TIMELINE_TYPES = [
  'booking_confirmed','empty_pickup','gate_in','loaded','departed','transshipment',
  'arrived','discharged','customs_processing','inspection','sampling','laboratory_testing',
  'customs_released','pickup_available','domestic_delivery','warehouse_received','completed'
];
export const AIR_TIMELINE_TYPES = [
  'booking_confirmed','cargo_received','accepted_by_airline','scheduled','departed','in_flight',
  'arrived','cargo_unloaded','customs_processing','inspection','sampling','laboratory_testing',
  'customs_released','domestic_delivery','warehouse_received','completed'
];
const text = value => value == null ? '' : String(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export function createTrackingEvent(input = {}, now = isoNow()) {
  const normalizedType = text(input.normalizedType || input.type || '');
  return {
    id: text(input.id) || makeId('event'), normalizedType,
    originalType: text(input.originalType || input.originalStatus || input.type || normalizedType),
    description: text(input.description), location: text(input.location),
    timestamp: text(input.timestamp || input.providerTimestamp || now),
    provider: text(input.provider || 'Manual'), source: ['manual','provider','system'].includes(input.source) ? input.source : 'manual',
    confirmed: input.confirmed === undefined ? true : Boolean(input.confirmed), metadata: object(input.metadata)
  };
}

export function createRouteLeg(input = {}) {
  const point = value => ({name:text(value?.name),code:text(value?.code),lat:value?.lat==null||!Number.isFinite(Number(value.lat))?null:Number(value.lat),lng:value?.lng==null||!Number.isFinite(Number(value.lng))?null:Number(value.lng)});
  return {id:text(input.id)||makeId('leg'),sequence:Math.max(1,Number(input.sequence)||1),mode:input.mode==='air'?'air':'sea',origin:point(input.origin),destination:point(input.destination),carrier:text(input.carrier),vesselOrFlight:text(input.vesselOrFlight),etd:text(input.etd),eta:text(input.eta),actualDeparture:text(input.actualDeparture),actualArrival:text(input.actualArrival),status:text(input.status)};
}

export function createShipmentTracking(input = {}, now = isoNow()) {
  const mode = input.mode === 'air' ? 'air' : 'sea';
  const identifiers = object(input.identifiers);
  const rawPosition=object(input.position);
  const hasPosition=rawPosition.lat!=null&&rawPosition.lng!=null&&Number.isFinite(Number(rawPosition.lat))&&Number.isFinite(Number(rawPosition.lng))&&Math.abs(Number(rawPosition.lat))<=90&&Math.abs(Number(rawPosition.lng))<=180;
  const requestedStatus=text(input.trackingStatus||'configured');
  const storedPositionStamp=rawPosition.timestamp||rawPosition.lastSeen||input.lastSuccessfulUpdate||input.lastProviderUpdate||'';
  const storedPositionTime=Date.parse(storedPositionStamp);
  const storedAgeMs=Date.parse(now)-storedPositionTime;
  const storedPositionIsStale=hasPosition&&(!Number.isFinite(storedPositionTime)||!Number.isFinite(storedAgeMs)||storedAgeMs>(mode==='air'?10:30)*60*1000);
  const trackingStatus=hasPosition&&(['no_result','stale'].includes(requestedStatus)||(requestedStatus==='live'&&storedPositionIsStale))?'last_known':requestedStatus==='no_result'?'configured':requestedStatus==='stale'?'provider_unavailable':requestedStatus;
  const etaHistory = Array.isArray(input.etaHistory) ? input.etaHistory.map(entry => ({eta:text(entry.eta),source:text(entry.source||'Unknown'),observedAt:text(entry.observedAt||now)})).filter(entry => entry.eta) : [];
  return {
    id:text(input.id)||makeId('tracking'), batchId:text(input.batchId), mode,
    provider:text(input.provider || (mode==='sea'?'AISStream.io':'adsb.fi')),
    trackingStatus, identifiers:{...identifiers},
    origin:{...object(input.origin),name:text(input.origin?.name),code:text(input.origin?.code),lat:input.origin?.lat==null?null:Number(input.origin.lat),lng:input.origin?.lng==null?null:Number(input.origin.lng)},
    destination:{...object(input.destination),name:text(input.destination?.name),code:text(input.destination?.code),lat:input.destination?.lat==null?null:Number(input.destination.lat),lng:input.destination?.lng==null?null:Number(input.destination.lng)},
    carrier:{...object(input.carrier),name:text(input.carrier?.name),vesselOrFlight:text(input.carrier?.vesselOrFlight),voyageNo:text(input.carrier?.voyageNo)},
    schedule:{...object(input.schedule),etd:text(input.schedule?.etd),eta:text(input.schedule?.eta),etaSource:text(input.schedule?.etaSource),etaUpdatedAt:text(input.schedule?.etaUpdatedAt),scheduledDeparture:text(input.schedule?.scheduledDeparture),actualDeparture:text(input.schedule?.actualDeparture),estimatedArrival:text(input.schedule?.estimatedArrival),actualArrival:text(input.schedule?.actualArrival),flightStatus:text(input.schedule?.flightStatus),delayMinutes:Number(input.schedule?.delayMinutes)||0},
    position:{...rawPosition,lat:rawPosition.lat==null?null:Number(rawPosition.lat),lng:rawPosition.lng==null?null:Number(rawPosition.lng),speed:rawPosition.speed==null?null:Number(rawPosition.speed),course:rawPosition.course==null?null:Number(rawPosition.course),altitude:rawPosition.altitude==null?null:Number(rawPosition.altitude),heading:rawPosition.heading==null?null:Number(rawPosition.heading),verticalRate:rawPosition.verticalRate==null?null:Number(rawPosition.verticalRate),timestamp:text(rawPosition.timestamp),lastSeen:text(rawPosition.lastSeen),source:text(rawPosition.source)},
    events:Array.isArray(input.events)?input.events.map(event=>createTrackingEvent(event,now)):[],
    alerts:Array.isArray(input.alerts)?input.alerts.map(alert=>({...alert,id:text(alert.id)||makeId('alert')})):[],
    etaHistory,routeLegs:Array.isArray(input.routeLegs)?input.routeLegs.map(createRouteLeg):[],
    freeTimeDays:input.freeTimeDays==null||input.freeTimeDays===''?null:Math.max(0,Number(input.freeTimeDays)||0),
    freeTimeEndDate:text(input.freeTimeEndDate)||null,
    lastProviderUpdate:text(input.lastProviderUpdate)||null,lastProviderState:text(input.lastProviderState)||(trackingStatus==='live'?'live':trackingStatus==='last_known'?(storedPositionIsStale?'last_known':'no_live_signal'):trackingStatus),lastSystemUpdate:text(input.lastSystemUpdate)||now,
    lastSuccessfulUpdate:text(input.lastSuccessfulUpdate)||null,lastProviderError:text(input.lastProviderError)||'',
    createdAt:text(input.createdAt)||now,updatedAt:text(input.updatedAt)||now
  };
}

export function applyPositionSnapshot(tracking, position, fetchedAt, completed = false, providerState = '') {
  const lat=Number(position?.lat),lng=Number(position?.lng);
  const validPosition=position&&position.lat!=null&&position.lat!==''&&position.lng!=null&&position.lng!==''&&Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
  if(validPosition){
    const updateTime=fetchedAt||new Date().toISOString();
    const positionTime=Date.parse(position.timestamp||position.lastSeen||updateTime),fetchedTime=Date.parse(updateTime);
    const maxLiveAgeMs=tracking.mode==='air'?10*60*1000:30*60*1000;
    const ageMs=fetchedTime-positionTime;
    const recent=Number.isFinite(positionTime)&&Number.isFinite(fetchedTime)&&ageMs>=-5*60*1000&&ageMs<=maxLiveAgeMs;
    const previousTime=Date.parse(tracking.position?.timestamp||tracking.position?.lastSeen||'');
    const notOlder=!Number.isFinite(previousTime)||!Number.isFinite(positionTime)||positionTime>=previousTime;
    if(notOlder)tracking.position={...position,lat,lng};
    if(recent&&notOlder){
      tracking.lastSuccessfulUpdate=updateTime;
      tracking.lastProviderState='live';
      tracking.trackingStatus=completed?'completed':'live';
    }else{
      tracking.lastProviderState='last_known';
      tracking.trackingStatus=completed?'completed':'last_known';
    }
  }else{
    const state=providerState|| (tracking.mode==='sea'?'no_new_position':'no_live_signal');
    tracking.lastProviderState=state;
    const hasLastPosition=tracking.position?.lat!=null&&tracking.position?.lng!=null&&Number.isFinite(Number(tracking.position.lat))&&Number.isFinite(Number(tracking.position.lng));
    tracking.trackingStatus=completed?'completed':hasLastPosition?'last_known':state;
  }
  if(fetchedAt)tracking.lastProviderUpdate=fetchedAt;
  return tracking;
}

const eventRules = [
  [/booking confirmed|booking|booked|订舱|予約/i,'booking_confirmed'],[/empty pickup|empty container|提空箱/i,'empty_pickup'],
  [/gate.?in|terminal received|进港|入场/i,'gate_in'],[/loaded on|loaded|装船/i,'loaded'],
  [/vessel departed|departed|take.?off|airborne|起飞|離陸|开航|出港/i,'departed'],
  [/transshipment|transship|转运|中转/i,'transshipment'],[/vessel arrived|flight arrived|arrived|到港|到达/i,'arrived'],
  [/discharged|unloaded|cargo unloaded|卸船|卸货/i,'discharged'],[/customs processing|customs clearance|清关中|通関中/i,'customs_processing'],
  [/inspection|查验|検査/i,'inspection'],[/sampling|sample|抽样|サンプリング/i,'sampling'],
  [/laboratory|testing|检测|試験/i,'laboratory_testing'],[/customs released|released by customs|海关放行|通関許可/i,'customs_released'],
  [/pickup available|available for pickup|可提货/i,'pickup_available'],[/domestic delivery|out for delivery|国内运输|国内配送/i,'domestic_delivery'],
  [/warehouse received|delivered to warehouse|已到仓|倉庫到着/i,'warehouse_received'],[/completed|complete|已完成|完了/i,'completed'],
  [/accepted by airline|accepted|收货/i,'accepted_by_airline'],[/scheduled|计划/i,'scheduled'],[/in flight|en route|巡航中/i,'in_flight'],
  [/cargo received/i,'cargo_received'],[/cancelled|canceled|航班取消/i,'flight_cancelled'],[/delay|delayed|延误/i,'flight_delayed']
];

export function normalizeTrackingEvent(raw = {}, provider = 'Unknown', source = 'provider') {
  const originalType=text(raw.originalType||raw.originalStatus||raw.status||raw.event||raw.description||raw.type);
  const normalizedType=text(raw.normalizedType)||eventRules.find(([pattern])=>pattern.test(originalType))?.[1]||'status_update';
  return createTrackingEvent({normalizedType,originalType,description:text(raw.description||raw.event||originalType),location:text(raw.location||raw.port||raw.airport),timestamp:text(raw.timestamp||raw.providerTimestamp||raw.time),provider:text(raw.provider||provider),source:raw.source||source,confirmed:raw.confirmed??source==='provider',metadata:raw.metadata||{} });
}

function hoursBetween(a,b){const ms=new Date(b).getTime()-new Date(a).getTime();return Number.isFinite(ms)?ms/3600000:null}
export function detectTrackingAlerts(tracking, now = new Date()) {
  const current=new Date(now), alerts=[];
  const add=(type,severity,title,description,source='system',metadata={})=>alerts.push({id:`${tracking.id}:${type}`,type,severity,title,description,detectedAt:current.toISOString(),resolvedAt:null,source,metadata});
  const history=tracking.etaHistory||[], previous=history.length>1?history.at(-2):null, eta=tracking.schedule?.eta||tracking.schedule?.estimatedArrival;
  const delta=previous&&eta?hoursBetween(previous.eta,eta):null;
  if(delta>24)add('eta_changed','warning','etaDelay24','', 'system',{delayHours:Math.round(delta)});
  else if(delta>12)add('eta_changed','warning','etaDelay12','', 'system',{delayHours:Math.round(delta)});
  const lastProviderUpdate=tracking.lastProviderUpdate||tracking.position?.timestamp;
  const age=lastProviderUpdate?hoursBetween(lastProviderUpdate,current.toISOString()):null;
  if(age!=null&&age>(tracking.mode==='air'?0.25:1))add('provider_stale','info','trackingStale','', 'system',{ageHours:Math.round(age*10)/10});
  if(tracking.lastProviderError)add('provider_unavailable','info','providerUnavailable','', 'system',{errorCode:tracking.lastProviderError});
  const flightStatus=String(tracking.schedule?.flightStatus||'').toLowerCase();
  if(flightStatus.includes('cancel'))add('flight_cancelled','warning','flightCancelled','', 'provider');
  else if(flightStatus.includes('delay')||Number(tracking.schedule?.delayMinutes)>0)add('flight_delayed','warning','flightDelayed','', 'provider',{delayMinutes:Number(tracking.schedule?.delayMinutes)||0});
  const arrived=tracking.events?.filter(event=>event.normalizedType==='arrived').at(-1);
  const discharged=tracking.events?.some(event=>event.normalizedType==='discharged'&&(!arrived||event.timestamp>=arrived.timestamp));
  if(tracking.mode==='sea'&&arrived&&!discharged&&hoursBetween(arrived.timestamp,current.toISOString())>=24)add('arrival_not_discharged','warning','arrivedNotDischarged','', 'system');
  if(tracking.freeTimeEndDate){const days=(new Date(`${tracking.freeTimeEndDate}T23:59:59Z`).getTime()-current.getTime())/86400000;if(days>=0&&days<=2)add('free_time_ending','warning','freeTimeEnding','', 'system',{daysRemaining:Math.ceil(days)});}
  const previousAlerts=tracking.alerts||[];
  return alerts.map(alert=>{const old=previousAlerts.find(item=>item.id===alert.id&&!item.resolvedAt);return old?{...old,description:alert.description,metadata:alert.metadata}:alert;});
}

const batchStatusForEvent={booking_confirmed:'booked',departed:'departed',in_flight:'in_transit',arrived:'arrived',customs_processing:'customs',customs_released:'released',domestic_delivery:'domestic_delivery',warehouse_received:'warehouse_received',completed:'warehouse_received'};
export function getSuggestedBatchStatus(tracking,batchStatus) {
  const latest=[...(tracking.events||[])].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)).at(-1);
  if(!latest)return null;
  const status=batchStatusForEvent[latest.normalizedType];
  if(!status||status===batchStatus)return null;
  return {status,event:latest,requiresConfirmation:['released','warehouse_received'].includes(status)||latest.source==='manual'};
}
