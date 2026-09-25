import test from 'node:test';
import assert from 'node:assert/strict';
import {BATCH_SCHEMA_VERSION,createBatch,duplicateBatch} from '../src/models/batch.mjs';
import {createTrackingEvent,createShipmentTracking,detectTrackingAlerts,getSuggestedBatchStatus} from '../src/models/tracking.mjs';
import {createBatchRepository,createMemoryStorage,migrateStoredData} from '../src/repositories/batchRepository.mjs';
import {createTrackingRepository} from '../src/repositories/trackingRepository.mjs';
import {createAirTrackingProvider,createSeaTrackingProvider,fetchTrackingSnapshot,isValidImo} from '../api/_lib/trackingProviders.js';
import seaHandler from '../api/tracking/sea.js';

const jsonResponse=(payload,status=200)=>({ok:status>=200&&status<300,status,json:async()=>payload});
const validImo='9074729';

test('sea endpoint rejects other methods and returns missing-credential errors without secrets',async()=>{
  const invoke=async(method,body)=>{let status=0,payload=null,headers={};const res={setHeader:(key,value)=>{headers[key]=value;return res},status:value=>{status=value;return res},json:value=>{payload=value;return res}};await seaHandler({method,body},res);return {status,payload,headers}};
  const method=await invoke('GET',{});assert.equal(method.status,405);assert.equal(method.payload.error,'METHOD_NOT_ALLOWED');
  const missing=await invoke('POST',{identifiers:{imo:validImo}});assert.equal(missing.status,503);assert.equal(missing.payload.error,'MARINETRAFFIC_API_KEY_MISSING');assert.equal(missing.headers['Cache-Control'],'private, no-store');
});

test('schema v3 migrates P0/P1 batches without changing costing data',()=>{
  const old={schemaVersion:2,activeBatchId:'batch-a',batches:[{id:'batch-a',name:'P1 batch',selectedRoute:'fcl',selectedQuoteId:'quote-1',quotes:[{id:'quote-1',confirmed:true,transportMode:'fcl',chargeLines:[]}],fcl:{containerType:'40HQ',chargeLines:[{category:'ocean_freight',currency:'CNY',quantity:1,unitPrice:1500}]},customs:{defaultRate:9},items:[{name:'Goods',qty:2,price:100}],tracking:{}}]};
  const migrated=migrateStoredData(old);
  assert.equal(BATCH_SCHEMA_VERSION,3);assert.equal(migrated.schemaVersion,3);assert.equal(migrated.activeBatchId,'batch-a');
  const batch=migrated.batches[0];assert.equal(batch.selectedQuoteId,'quote-1');assert.equal(batch.selectedRoute,'fcl');assert.equal(batch.fcl.containerType,'40HQ');assert.equal(batch.items[0].price,100);assert.deepEqual(batch.trackings,[]);
});

test('tracking records persist within their owning batch and are excluded from duplicates',()=>{
  const storage=createMemoryStorage(),batchRepo=createBatchRepository(storage),data=batchRepo.initialize(),first=data.batches[0],second=batchRepo.create(createBatch({name:'Other batch'})),repo=createTrackingRepository(batchRepo);
  const tracking=repo.create(first.id,{mode:'sea',identifiers:{containerNo:'ABCD1234567'},routeLegs:[{sequence:1,origin:{name:'Kobe'},destination:{name:'Busan'}},{sequence:2,origin:{name:'Busan'},destination:{name:'Shanghai'}}]});
  assert.equal(repo.list(first.id).length,1);assert.equal(repo.list(second.id).length,0);assert.equal(repo.get(first.id,tracking.id).batchId,first.id);assert.equal(repo.get(first.id,tracking.id).routeLegs.length,2);
  const restored=createBatchRepository(storage).initialize();assert.equal(restored.batches.find(batch=>batch.id===first.id).trackings[0].identifiers.containerNo,'ABCD1234567');
  const duplicate=duplicateBatch(batchRepo.get(first.id),'copy');assert.deepEqual(duplicate.trackings,[]);
});

test('IMO check digit rejects invalid identifiers',()=>{assert.equal(isValidImo(validImo),true);assert.equal(isValidImo('9074728'),false);assert.equal(isValidImo('123'),false);});

test('MarineTraffic never fabricates data when credentials or identifiers are missing',async()=>{
  let requests=0;const noKey=createSeaTrackingProvider({env:{},fetchImpl:async()=>{requests++;return jsonResponse([]);}});
  await assert.rejects(()=>noKey.search({imo:validImo}),error=>error.code==='MARINETRAFFIC_API_KEY_MISSING');
  const provider=createSeaTrackingProvider({env:{MARINETRAFFIC_API_KEY:'test-secret'},fetchImpl:async()=>{requests++;return jsonResponse([]);}});
  await assert.rejects(()=>provider.search({imo:'123'}),error=>error.code==='TRACKING_INVALID_IMO');
  await assert.rejects(()=>provider.search({containerNo:'ABCD1234567'}),error=>error.code==='TRACKING_IDENTIFIER_REQUIRES_IMO_OR_MMSI');
  assert.equal(requests,0);
});

test('MarineTraffic maps vessel position and ETA without inferring cargo clearance',async()=>{
  let calledUrl;
  const provider=createSeaTrackingProvider({env:{MARINETRAFFIC_API_KEY:'server-only'},fetchImpl:async url=>{calledUrl=String(url);return jsonResponse([{IMO:validImo,MMSI:'538003913',SHIPNAME:'SUNNY STAR',LAT:'37.388430',LON:'23.871230',SPEED:'6',COURSE:'41',TIMESTAMP:'2026-09-25T04:00:00Z',ETA:'2026-09-29T13:00:00Z',STATUS:'0'}]);}});
  const record=await provider.search({imo:validImo});
  assert.match(calledUrl,/exportvessel\/server-only/);assert.equal(new URL(calledUrl).searchParams.get('v'),'6');assert.equal(new URL(calledUrl).searchParams.get('imo'),validImo);
  assert.deepEqual(provider.getPosition(record),{lat:37.38843,lng:23.87123,speed:6,course:41,timestamp:'2026-09-25T04:00:00.000Z',source:'MarineTraffic'});
  assert.equal(provider.getSchedule(record).eta,'2026-09-29T13:00:00.000Z');assert.deepEqual(provider.getEvents(record),[]);assert.equal(provider.getStatus(record).vesselOnly,true);
});

test('MarineTraffic provider cache limits repeat queries to one provider call',async()=>{
  let calls=0;const options={env:{MARINETRAFFIC_API_KEY:'cache-test'},fetchImpl:async()=>{calls++;return jsonResponse([{IMO:validImo,LAT:'1',LON:'2',TIMESTAMP:'2026-09-25T04:00:00Z'}]);}};
  const one=await fetchTrackingSnapshot('sea',{imo:validImo},options),two=await fetchTrackingSnapshot('sea',{imo:validImo},options);
  assert.equal(calls,1);assert.equal(one.cached,false);assert.equal(two.cached,true);
});

test('AirNav searches live data and falls back to a scheduled flight without AWB claims',async()=>{
  const calls=[];const flight={flightNumberIata:'NH0003',airlineName:'ANA',depAirportIata:'HND',depAirportName:'Tokyo Haneda',depAirportLatitude:35.55,depAirportLongitude:139.78,arrAirportIata:'PVG',arrAirportName:'Shanghai Pudong',arrAirportLatitude:31.14,arrAirportLongitude:121.8,scheduledDeparture:'2026-09-25T06:00:00Z',scheduledArrival:'2026-09-25T09:00:00Z',status:'SCHEDULED'};
  const provider=createAirTrackingProvider({env:{AIRNAV_API_KEY:'server-only'},fetchImpl:async(url,options)=>{calls.push({url:String(url),options});return calls.length===1?jsonResponse({success:true,flights:[]}):jsonResponse({success:true,flights:[flight]});}});
  const record=await provider.search({flightNo:'NH0003',flightDate:'2026-09-25'});const schedule=provider.getSchedule(record);
  assert.equal(calls.length,2);assert.equal(calls[0].url,'https://api.airnavradar.com/v2/flights/live');assert.equal(calls[0].options.headers.authorization,'Bearer server-only');assert.equal(calls[1].url.includes('departureFromDate'),true);
  assert.equal(schedule.departureAirport.code,'HND');assert.equal(schedule.arrivalAirport.code,'PVG');assert.equal(schedule.eta,'2026-09-25T09:00:00.000Z');assert.deepEqual(provider.getPosition(record),null);assert.equal(provider.getEvents(record)[0].status,'Scheduled');
  assert.equal(Object.hasOwn(record,'awbNo'),false);
});

test('AirNav reports current position and delay from provider data',async()=>{
  const flight={flightNumberIata:'NH0003',scheduledDeparture:'2026-09-25T06:00:00Z',actualDeparture:'2026-09-25T06:20:00Z',estimatedArrival:'2026-09-25T09:30:00Z',latitude:31.2,longitude:121.4,groundSpeed:770,heading:190,altitude:10600,updated:'2026-09-25T07:00:00Z',status:'IN_FLIGHT'};
  const provider=createAirTrackingProvider({env:{AIRNAV_API_KEY:'key'},fetchImpl:async()=>jsonResponse({success:true,flights:[flight]})});
  const record=await provider.search({flightNo:'NH0003'});assert.equal(provider.getStatus(record).delayMinutes,20);assert.deepEqual(provider.getPosition(record),{lat:31.2,lng:121.4,speed:770,course:190,altitude:10600,timestamp:'2026-09-25T07:00:00.000Z',source:'AirNav Radar'});
});

test('alerts use ETA changes, stale data, and manually supplied free time',()=>{
  const now=new Date('2026-09-25T00:00:00Z'),tracking=createShipmentTracking({id:'track-1',mode:'sea',lastProviderUpdate:'2026-09-25T00:00:00Z',position:{timestamp:'2026-09-24T20:00:00Z'},schedule:{eta:'2026-09-27T14:00:00Z'},etaHistory:[{eta:'2026-09-26T00:00:00Z',source:'Manual',observedAt:'2026-09-24T00:00:00Z'},{eta:'2026-09-27T14:00:00Z',source:'MarineTraffic',observedAt:'2026-09-25T00:00:00Z'}],freeTimeEndDate:'2026-09-26'});
  const types=detectTrackingAlerts(tracking,now).map(alert=>alert.type);assert.ok(types.includes('eta_changed'));assert.ok(types.includes('free_time_ending'));assert.ok(!types.includes('provider_stale'));
  const stale=detectTrackingAlerts({...tracking,lastProviderUpdate:'2026-09-23T00:00:00Z',position:{timestamp:'2026-09-23T00:00:00Z'}},now);assert.ok(stale.some(alert=>alert.type==='provider_stale'));
});

test('vessel and flight arrival suggest arrived, never customs release',()=>{
  const vessel=createShipmentTracking({id:'sea-1',mode:'sea',events:[createTrackingEvent({normalizedType:'arrived',source:'provider',provider:'MarineTraffic',timestamp:'2026-09-25T00:00:00Z'})]});
  const flight=createShipmentTracking({id:'air-1',mode:'air',events:[createTrackingEvent({normalizedType:'arrived',source:'provider',provider:'AirNav Radar',timestamp:'2026-09-25T00:00:00Z'})]});
  assert.equal(getSuggestedBatchStatus(vessel,'in_transit').status,'arrived');assert.equal(getSuggestedBatchStatus(flight,'in_transit').status,'arrived');
  const customs=createShipmentTracking({id:'sea-2',mode:'sea',events:[createTrackingEvent({normalizedType:'customs_released',source:'manual',timestamp:'2026-09-25T00:00:00Z'})]});
  assert.equal(getSuggestedBatchStatus(customs,'customs').status,'released');assert.equal(getSuggestedBatchStatus(customs,'customs').requiresConfirmation,true);
});
