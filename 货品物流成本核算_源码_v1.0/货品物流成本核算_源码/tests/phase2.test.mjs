import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {BATCH_SCHEMA_VERSION,createBatch,duplicateBatch} from '../src/models/batch.mjs';
import {createTrackingEvent,createShipmentTracking,applyPositionSnapshot,detectTrackingAlerts,getSuggestedBatchStatus} from '../src/models/tracking.mjs';
import {createBatchRepository,createMemoryStorage,migrateStoredData} from '../src/repositories/batchRepository.mjs';
import {createTrackingRepository} from '../src/repositories/trackingRepository.mjs';
import {createAirTrackingProvider,createSeaTrackingProvider,fetchTrackingSnapshot,clearTrackingCache,validMmsi,validIcao24,validCallsign} from '../api/_lib/trackingProviders.js';
import seaHandler from '../api/tracking/sea.js';
import {createTrackingHandler} from '../api/_lib/trackingHandler.js';
import {buildRouteSegments} from '../src/ui/trackingMap.mjs';
import {resolveTrackingLocation} from '../src/models/trackingLocations.mjs';
import {addFormState,buildTrackingIdentifierFields,trackingLookupError} from '../src/ui/trackingPanel.mjs';
import providerStatusHandler,{createProviderStatusHandler} from '../api/tracking/status.js';

const jsonResponse=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});
const validMmsiValue='538003913';
const fixedNow=new Date('2026-09-25T04:00:00.000Z');

function makePositionEnvelope(overrides={}){
  return {
    MessageType:'PositionReport',
    MetaData:{MMSI:Number(validMmsiValue),ShipName:'SUNNY STAR',Latitude:37.38843,Longitude:123.87123,time_utc:'2026-09-25T04:00:00.000Z'},
    Message:{PositionReport:{UserID:Number(validMmsiValue),Sog:6.4,Cog:41.2,TrueHeading:42,NavigationalStatus:0,...overrides}}
  };
}
class AisSocket extends EventEmitter{
  static last=null;
  constructor(url,options){super();this.url=url;this.options=options;this.readyState=0;this.sent=null;this.closed=false;AisSocket.last=this;setImmediate(()=>{this.readyState=1;this.emit('open');});}
  send(value){this.sent=JSON.parse(value);this.onSubscribed?.(this);}
  close(){this.closed=true;this.readyState=3;setImmediate(()=>this.emit('close',1000));}
}
function encoded(value){return Buffer.from(JSON.stringify(value));}

test('sea endpoint rejects other methods and returns missing AIS credentials safely',async()=>{
  const invoke=async(method,body)=>{let status=0,payload=null,headers={};const res={setHeader:(key,value)=>{headers[key]=value;return res},status:value=>{status=value;return res},json:value=>{payload=value;return res}};await seaHandler({method,body},res);return {status,payload,headers}};
  const method=await invoke('GET',{});assert.equal(method.status,405);assert.equal(method.payload.error,'METHOD_NOT_ALLOWED');
  const missing=await invoke('POST',{identifiers:{mmsi:validMmsiValue}});assert.equal(missing.status,503);assert.equal(missing.payload.error,'AISSTREAM_API_KEY_MISSING');assert.equal(missing.headers['Cache-Control'],'private, no-store');
  const invalid=await invoke('POST',{identifiers:{mmsi:'123'}});assert.equal(invalid.status,400);assert.equal(invalid.payload.error,'TRACKING_INVALID_MMSI');
});

test('AISStream validates MMSI and rejects invalid identifiers before opening a socket',async()=>{
  assert.equal(validMmsi(validMmsiValue),true);assert.equal(validMmsi('53800391'),false);
  let opens=0;class NeverSocket extends AisSocket{constructor(...args){super(...args);opens++;}}
  const provider=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'server-secret'},WebSocketImpl:NeverSocket});
  await assert.rejects(()=>provider.search({mmsi:'123'}),error=>error.code==='TRACKING_INVALID_MMSI');
  assert.equal(opens,0);
});

test('AISStream subscribes server-side by MMSI and normalizes AIS position without speed scaling',async()=>{
  clearTrackingCache();
  class UsefulSocket extends AisSocket{
    send(value){super.send(value);setImmediate(()=>{
      this.emit('message',encoded({MessageType:'SubscriptionConfirmation',Message:{}}));
      this.emit('message',encoded({MessageType:'ShipStaticData',MetaData:{MMSI:Number(validMmsiValue)},Message:{ShipStaticData:{UserID:Number(validMmsiValue),Name:'SUNNY STAR'}}}));
      this.emit('message',encoded(makePositionEnvelope()));
    });}
  }
  const provider=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'server-secret'},WebSocketImpl:UsefulSocket,now:()=>fixedNow});
  const result=await provider.search({mmsi:validMmsiValue});
  const socket=UsefulSocket.last;
  assert.equal(socket.url,'wss://stream.aisstream.io/v0/stream');
  assert.equal(socket.options.perMessageDeflate,true);
  assert.equal(socket.options.handshakeTimeout,3000);
  assert.equal(socket.sent.APIKey,'server-secret');
  assert.deepEqual(socket.sent.FiltersShipMMSI,[validMmsiValue]);
  assert.deepEqual(socket.sent.FilterMessageTypes,['PositionReport','ShipStaticData']);
  assert.deepEqual(socket.sent.BoundingBoxes,[[[45,120],[20,150]]]);
  assert.equal(socket.url.includes('server-secret'),false);
  assert.equal(result.provider,'AISStream.io');
  assert.deepEqual(result.position,{lat:37.38843,lng:123.87123,speed:6.4,course:41.2,heading:42,navigationStatus:0,timestamp:'2026-09-25T04:00:00.000Z',lastSeen:'2026-09-25T04:00:00.000Z',source:'AISStream.io',mmsi:validMmsiValue,shipName:'SUNNY STAR'});
  assert.equal(socket.closed,true);
});

test('AISStream returns a successful no-new-position state after subscription confirmation',async()=>{
  class QuietSocket extends AisSocket{send(value){super.send(value);setImmediate(()=>this.emit('message',encoded({MessageType:'SubscriptionConfirmation',Message:{}})));}}
  const provider=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'server-secret'},WebSocketImpl:QuietSocket,timeoutMs:20});
  const result=await provider.search({mmsi:validMmsiValue});
  assert.equal(result.ok,true);assert.equal(result.state,'no_new_position');assert.equal(result.position,null);assert.equal(result.provider,'AISStream.io');
  assert.equal(QuietSocket.last.closed,true);
});

test('AISStream distinguishes unconfirmed subscription timeout, rejection, and invalid key',async()=>{
  class UnconfirmedSocket extends AisSocket{send(value){super.send(value);}}
  const timeout=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'secret'},WebSocketImpl:UnconfirmedSocket,timeoutMs:15});
  await assert.rejects(()=>timeout.search({mmsi:validMmsiValue}),error=>error.code==='PROVIDER_SUBSCRIPTION_TIMEOUT');
  class RejectedSocket extends AisSocket{send(value){super.send(value);setImmediate(()=>this.emit('message',encoded({MessageType:'Error',Error:'Invalid subscription'})));}}
  await assert.rejects(()=>createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'secret'},WebSocketImpl:RejectedSocket}).search({mmsi:validMmsiValue}),error=>error.code==='PROVIDER_SUBSCRIPTION_REJECTED');
  class UnauthorizedSocket extends AisSocket{send(value){super.send(value);setImmediate(()=>this.emit('message',encoded({MessageType:'Error',Error:'Invalid API key'})));}}
  await assert.rejects(()=>createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'bad'},WebSocketImpl:UnauthorizedSocket}).search({mmsi:validMmsiValue}),error=>error.code==='PROVIDER_UNAUTHORIZED');
});

test('AISStream distinguishes a websocket handshake timeout from a disconnect',async()=>{
  class HandshakeSocket extends EventEmitter{
    static last=null;constructor(url,options){super();this.url=url;this.options=options;this.readyState=0;this.closed=false;HandshakeSocket.last=this;}
    close(){this.closed=true;this.readyState=3;}
  }
  const provider=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'server-secret'},WebSocketImpl:HandshakeSocket,timeoutMs:15});
  await assert.rejects(()=>provider.search({mmsi:validMmsiValue}),error=>error.code==='PROVIDER_TIMEOUT');
  class DisconnectSocket extends AisSocket{send(value){super.send(value);setImmediate(()=>this.emit('close',1006));}}
  const disconnected=createSeaTrackingProvider({env:{AISSTREAM_API_KEY:'server-secret'},WebSocketImpl:DisconnectSocket,timeoutMs:100});
  await assert.rejects(()=>disconnected.search({mmsi:validMmsiValue}),error=>error.code==='PROVIDER_UNAVAILABLE');
});

test('adsb.fi queries by callsign only when explicitly supplied and normalizes aircraft fields',async()=>{
  clearTrackingCache();
  const urls=[],nowMilliseconds=fixedNow.getTime();
  const provider=createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async url=>{urls.push(String(url));return jsonResponse({now:nowMilliseconds,ac:[{hex:'abc123',flight:'ANA967 ',r:'JA123A',lat:35.5,lon:139.7,alt_baro:32000,gs:450,track:82,baro_rate:-700,seen_pos:8,on_ground:false}]});},now:()=>fixedNow});
  const result=await provider.fetch({flightNo:'NH967',callsign:'ANA967'});
  assert.equal(validIcao24(result.identifiers.icao24),true);
  assert.equal(urls[0],'https://opendata.adsb.fi/api/v2/callsign/ANA967');
  assert.deepEqual(result.identifiers,{flightNo:'NH967',callsign:'ANA967',icao24:'abc123',registration:'JA123A'});
  assert.deepEqual(result.position,{lat:35.5,lng:139.7,altitude:32000,speed:450,course:82,heading:82,verticalRate:-700,timestamp:'2026-09-25T03:59:52.000Z',lastSeen:'2026-09-25T03:59:52.000Z',source:'adsb.fi',icao24:'abc123',callsign:'ANA967',registration:'JA123A'});
  assert.deepEqual(result.schedule,{});
  assert.equal(result.identifiers.flightNo,'NH967');
  assert.notEqual(result.identifiers.flightNo,result.identifiers.callsign);
});

test('adsb.fi prefers discovered ICAO24 over the airline flight number and callsign',async()=>{
  clearTrackingCache();
  const urls=[];
  const provider=createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async url=>{urls.push(String(url));return jsonResponse({ac:[{hex:'abc123',flight:'ANA967 ',r:'JA123A',lat:35.5,lon:139.7,seen:1}]});}});
  const result=await provider.fetch({flightNo:'NH967',callsign:'ANA967',icao24:'ABC123'});
  assert.equal(urls[0],'https://opendata.adsb.fi/api/v2/icao/abc123');
  assert.equal(result.identifiers.flightNo,'NH967');assert.equal(result.identifiers.callsign,'ANA967');assert.equal(result.identifiers.icao24,'abc123');
  assert.equal(validIcao24('nothex'),false);
});

test('adsb.fi never maps flightNo into callsign and treats no aircraft as a successful no-live-signal state',async()=>{
  clearTrackingCache();
  const provider=createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async()=>jsonResponse({ac:[]})});
  await assert.rejects(()=>provider.fetch({flightNo:'NH967'}),error=>error.code==='TRACKING_IDENTIFIER_REQUIRED');
  const missing=await provider.fetch({callsign:'ANA967'});assert.equal(missing.ok,true);assert.equal(missing.state,'no_live_signal');assert.equal(missing.position,null);
  const rateLimited=createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async()=>jsonResponse({},429)});
  await assert.rejects(()=>rateLimited.fetch({icao24:'abc123'}),error=>error.code==='PROVIDER_RATE_LIMITED');
  await assert.rejects(()=>provider.fetch({callsign:'bad-call'}),error=>error.code==='TRACKING_INVALID_CALLSIGN'&&error.status===400);
  assert.equal(validCallsign('ANA967'),true);assert.equal(validCallsign('bad-call'),false);
});

test('adsb.fi maps upstream 404 with no current target to no_live_signal and times out as 504',async()=>{
  clearTrackingCache();
  const missing=await createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async()=>jsonResponse({},404)}).fetch({icao24:'abc123'});
  assert.equal(missing.ok,true);assert.equal(missing.state,'no_live_signal');assert.equal(missing.position,null);
  const timed=createAirTrackingProvider({minRequestIntervalMs:0,timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))});
  await assert.rejects(()=>timed.fetch({icao24:'abc123'}),error=>error.code==='PROVIDER_TIMEOUT'&&error.status===504);
});

test('tracking HTTP handler returns successful no-position states as HTTP 200',async()=>{
  const invoke=async(handler,identifiers)=>{let status=0,payload=null,headers={};const res={setHeader:(key,value)=>{headers[key]=value;return res},status:value=>{status=value;return res},json:value=>{payload=value;return res}};await handler({method:'POST',body:{identifiers}},res);return {status,payload,headers};};
  const air=await invoke(createTrackingHandler('air',{fetchSnapshot:async()=>({state:'no_live_signal',provider:'adsb.fi',position:null,fetchedAt:'2026-09-25T00:00:00.000Z'})}),{icao24:'abc123'});
  assert.equal(air.status,200);assert.equal(air.payload.ok,true);assert.equal(air.payload.state,'no_live_signal');assert.equal(air.payload.position,null);assert.equal(air.headers['Cache-Control'],'private, no-store');
  const sea=await invoke(createTrackingHandler('sea',{fetchSnapshot:async()=>({state:'no_new_position',provider:'AISStream.io',position:null,fetchedAt:'2026-09-25T00:00:00.000Z'})}),{mmsi:validMmsiValue});
  assert.equal(sea.status,200);assert.equal(sea.payload.ok,true);assert.equal(sea.payload.state,'no_new_position');assert.equal(sea.payload.position,null);
});

test('adsb.fi marks landed aircraft complete and does not invent origin, destination, or ETA',async()=>{
  clearTrackingCache();
  const provider=createAirTrackingProvider({minRequestIntervalMs:0,fetchImpl:async()=>jsonResponse({ac:[{hex:'abc123',flight:'ANA967 ',r:'JA123A',lat:35.5,lon:139.7,alt_baro:'ground',on_ground:true,seen:1}]})});
  const result=await provider.fetch({callsign:'ANA967'});
  assert.equal(result.status.landed,true);assert.equal(result.status.completed,true);
  assert.equal(result.events[0].normalizedType,'arrived');assert.deepEqual(result.schedule,{});
  assert.equal(Object.hasOwn(result,'origin'),false);assert.equal(Object.hasOwn(result,'destination'),false);
});

test('adsb.fi provider cache keeps public endpoint requests below its per-second limit',async()=>{
  clearTrackingCache();let calls=0;
  const options={minRequestIntervalMs:0,fetchImpl:async()=>{calls++;return jsonResponse({ac:[{hex:'abc999',flight:'TEST123'}]});}};
  const first=await fetchTrackingSnapshot('air',{callsign:'TEST123'},options),second=await fetchTrackingSnapshot('air',{callsign:'TEST123'},options);
  assert.equal(calls,1);assert.equal(first.cached,false);assert.equal(second.cached,true);
});

test('P0/P1 batch data and costing fields survive schema v3 migration',()=>{
  const old={schemaVersion:2,activeBatchId:'batch-a',batches:[{id:'batch-a',name:'P1 batch',selectedRoute:'fcl',selectedQuoteId:'quote-1',quotes:[{id:'quote-1',confirmed:true,transportMode:'fcl',chargeLines:[]}],fcl:{containerType:'40HQ',chargeLines:[{category:'ocean_freight',currency:'CNY',quantity:1,unitPrice:1500}]},customs:{defaultRate:9},items:[{name:'Goods',qty:2,price:100}],tracking:{}}]};
  const migrated=migrateStoredData(old);
  assert.equal(BATCH_SCHEMA_VERSION,3);assert.equal(migrated.schemaVersion,3);assert.equal(migrated.activeBatchId,'batch-a');
  const batch=migrated.batches[0];assert.equal(batch.selectedQuoteId,'quote-1');assert.equal(batch.selectedRoute,'fcl');assert.equal(batch.fcl.containerType,'40HQ');assert.equal(batch.items[0].price,100);assert.deepEqual(batch.trackings,[]);
});

test('tracking records persist within their owning batch and are excluded from duplicates',()=>{
  const storage=createMemoryStorage(),batchRepo=createBatchRepository(storage),data=batchRepo.initialize(),first=data.batches[0],second=batchRepo.create(createBatch({name:'Other batch'})),repo=createTrackingRepository(batchRepo);
  const tracking=repo.create(first.id,{mode:'sea',identifiers:{mmsi:validMmsiValue},routeLegs:[{sequence:1,origin:{name:'Kobe'},destination:{name:'Busan'}},{sequence:2,origin:{name:'Busan'},destination:{name:'Shanghai'}}]});
  assert.equal(repo.list(first.id).length,1);assert.equal(repo.list(second.id).length,0);assert.equal(repo.get(first.id,tracking.id).batchId,first.id);assert.equal(repo.get(first.id,tracking.id).routeLegs.length,2);
  const restored=createBatchRepository(storage).initialize();assert.equal(restored.batches.find(batch=>batch.id===first.id).trackings[0].identifiers.mmsi,validMmsiValue);
  const duplicate=duplicateBatch(batchRepo.get(first.id),'copy');assert.deepEqual(duplicate.trackings,[]);
});

test('IMO and MMSI validation reject invalid identifiers',()=>{assert.equal(validMmsi(validMmsiValue),true);assert.equal(validMmsi('123'),false);});

test('alerts use ETA changes, stale data, and manually supplied free time',()=>{
  const now=new Date('2026-09-25T00:00:00Z'),tracking=createShipmentTracking({id:'track-1',mode:'sea',lastProviderUpdate:'2026-09-25T00:00:00Z',position:{timestamp:'2026-09-24T20:00:00Z'},schedule:{eta:'2026-09-27T14:00:00Z'},etaHistory:[{eta:'2026-09-26T00:00:00Z',source:'Manual',observedAt:'2026-09-24T00:00:00Z'},{eta:'2026-09-27T14:00:00Z',source:'AISStream.io',observedAt:'2026-09-25T00:00:00Z'}],freeTimeEndDate:'2026-09-26'});
  const types=detectTrackingAlerts(tracking,now).map(alert=>alert.type);assert.ok(types.includes('eta_changed'));assert.ok(types.includes('free_time_ending'));assert.ok(!types.includes('provider_stale'));
  const stale=detectTrackingAlerts({...tracking,lastProviderUpdate:'2026-09-23T00:00:00Z',position:{timestamp:'2026-09-23T00:00:00Z'}},now);assert.ok(stale.some(alert=>alert.type==='provider_stale'));
});

test('vessel and flight arrival suggest arrived, never customs release',()=>{
  const vessel=createShipmentTracking({id:'sea-1',mode:'sea',events:[createTrackingEvent({normalizedType:'arrived',source:'provider',provider:'AISStream.io',timestamp:'2026-09-25T00:00:00Z'})]});
  const flight=createShipmentTracking({id:'air-1',mode:'air',events:[createTrackingEvent({normalizedType:'arrived',source:'provider',provider:'adsb.fi',timestamp:'2026-09-25T00:00:00Z'})]});
  assert.equal(getSuggestedBatchStatus(vessel,'in_transit').status,'arrived');assert.equal(getSuggestedBatchStatus(flight,'in_transit').status,'arrived');
  const customs=createShipmentTracking({id:'sea-2',mode:'sea',events:[createTrackingEvent({normalizedType:'customs_released',source:'manual',timestamp:'2026-09-25T00:00:00Z'})]});
  assert.equal(getSuggestedBatchStatus(customs,'customs').status,'released');assert.equal(getSuggestedBatchStatus(customs,'customs').requiresConfirmation,true);
});

test('map draws origin to position solid and position to destination dashed, with no false route lines',()=>{
  const origin={lat:31.2,lng:121.4},position={lat:32,lng:123},destination={lat:35.6,lng:139.7};
  assert.deepEqual(buildRouteSegments({origin,position,destination}),[
    {kind:'solid',points:[[31.2,121.4],[32,123]]},
    {kind:'dashed',points:[[32,123],[35.6,139.7]]}
  ]);
  assert.deepEqual(buildRouteSegments({origin,position:null,destination}),[]);
  assert.deepEqual(buildRouteSegments({origin:null,position,destination:null}),[]);
  assert.deepEqual(buildRouteSegments({origin:{lat:null,lng:null},position:{lat:null,lng:null},destination:null}),[]);
  assert.deepEqual(buildRouteSegments({origin,position:{lat:100,lng:200},destination}),[]);
  assert.deepEqual(buildRouteSegments({origin,position,destination:null}),[{kind:'solid',points:[[31.2,121.4],[32,123]]}]);
  assert.deepEqual(buildRouteSegments({origin:null,position,destination}),[{kind:'dashed',points:[[32,123],[35.6,139.7]]}]);
});

test('tracking form keeps the selected mode when Add toggles the form and exposes only that mode identifiers',()=>{
  const renderField=(name)=>`<input name="${name}">`;
  let sea=addFormState('sea',false);assert.deepEqual(sea,{mode:'sea',open:true});
  const seaForm=buildTrackingIdentifierFields(sea.mode,renderField);
  assert.match(seaForm,/name="mmsi"/);assert.match(seaForm,/name="containerNo"/);assert.doesNotMatch(seaForm,/name="flightNo"|name="callsign"|name="icao24"/);
  let air=addFormState('air',false);assert.deepEqual(air,{mode:'air',open:true});
  const airForm=buildTrackingIdentifierFields(air.mode,renderField);
  assert.match(airForm,/name="flightNo"/);assert.match(airForm,/name="callsign"/);assert.match(airForm,/name="icao24"/);assert.doesNotMatch(airForm,/name="mmsi"/);
});

test('live lookup preflight requires valid MMSI or Callsign/ICAO24, never flight number',()=>{
  assert.equal(trackingLookupError('sea',{}),'TRACKING_IDENTIFIER_REQUIRES_MMSI');
  assert.equal(trackingLookupError('sea',{mmsi:'123'}),'TRACKING_INVALID_MMSI');
  assert.equal(trackingLookupError('sea',{mmsi:validMmsiValue}),'');
  assert.equal(trackingLookupError('air',{flightNo:'NH967'}),'TRACKING_IDENTIFIER_REQUIRED');
  assert.equal(trackingLookupError('air',{callsign:'ANA967'}),'');
  assert.equal(trackingLookupError('air',{callsign:'bad-call'}),'TRACKING_INVALID_CALLSIGN');
  assert.equal(trackingLookupError('air',{icao24:'abc123'}),'');
  assert.equal(trackingLookupError('air',{icao24:'nope'}),'TRACKING_INVALID_ICAO24');
});

test('provider status endpoint returns only configured state and rejects other methods',async()=>{
  const invoke=async(handler,method)=>{let status=0,payload=null;const res={setHeader:()=>res,status:value=>{status=value;return res},json:value=>{payload=value;return res}};await handler({method},res);return {status,payload};};
  assert.deepEqual(await invoke(createProviderStatusHandler({AISSTREAM_API_KEY:'server-only'}),'GET'),{status:200,payload:{configured:true}});
  assert.deepEqual(await invoke(createProviderStatusHandler({AISSTREAM_API_KEY:''}),'GET'),{status:200,payload:{configured:false}});
  assert.deepEqual(await invoke(providerStatusHandler,'POST'),{status:405,payload:{error:'METHOD_NOT_ALLOWED'}});
});

test('last known position and successful timestamp survive a refresh without a new AIS position',()=>{
  const lastKnown={lat:35.1,lng:129.04,timestamp:'2026-09-24T00:00:00.000Z',source:'AISStream.io'};
  const tracking=createShipmentTracking({mode:'sea',position:lastKnown,lastSuccessfulUpdate:'2026-09-24T00:00:00.000Z',trackingStatus:'live'});
  applyPositionSnapshot(tracking,null,'2026-09-25T04:00:00.000Z');
  assert.equal(tracking.position.lat,lastKnown.lat);assert.equal(tracking.position.lng,lastKnown.lng);assert.equal(tracking.position.timestamp,lastKnown.timestamp);assert.equal(tracking.lastSuccessfulUpdate,'2026-09-24T00:00:00.000Z');assert.equal(tracking.lastProviderUpdate,'2026-09-25T04:00:00.000Z');assert.equal(tracking.trackingStatus,'last_known');assert.equal(tracking.lastProviderState,'no_new_position');
  applyPositionSnapshot(tracking,{lat:null,lng:null},'2026-09-25T04:30:00.000Z');
  assert.equal(tracking.position.lat,lastKnown.lat);assert.equal(tracking.lastSuccessfulUpdate,'2026-09-24T00:00:00.000Z');
});

test('legacy no_result or stale records with a saved position migrate to last_known',()=>{
  const position={lat:31.2,lng:121.4,timestamp:'2026-09-24T00:00:00.000Z'};
  assert.equal(createShipmentTracking({trackingStatus:'no_result',position}).trackingStatus,'last_known');
  assert.equal(createShipmentTracking({trackingStatus:'stale',position}).trackingStatus,'last_known');
});

test('old provider position timestamps remain last_known and do not replace a newer saved point',()=>{
  const current=createShipmentTracking({mode:'air',position:{lat:36,lng:140,timestamp:'2026-09-25T03:59:00.000Z'},lastSuccessfulUpdate:'2026-09-25T03:59:00.000Z'});
  applyPositionSnapshot(current,{lat:35,lng:139,timestamp:'2026-09-25T03:00:00.000Z'},'2026-09-25T04:00:00.000Z',false,'live');
  assert.equal(current.position.lat,36);assert.equal(current.trackingStatus,'last_known');assert.equal(current.lastProviderState,'last_known');assert.equal(current.lastSuccessfulUpdate,'2026-09-25T03:59:00.000Z');
});

test('known route names resolve to real port and airport locations while unknown names stay unresolved',()=>{
  assert.deepEqual(resolveTrackingLocation('Kobe','port')?.lat,34.681);assert.equal(resolveTrackingLocation('上海','port')?.lng,121.49);
  assert.equal(resolveTrackingLocation('NRT','airport')?.lat,35.772);assert.equal(resolveTrackingLocation('PVG','airport')?.lng,121.808);
  assert.equal(resolveTrackingLocation('user entered terminal','port'),null);assert.equal(resolveTrackingLocation('KIX','port'),null);
});
