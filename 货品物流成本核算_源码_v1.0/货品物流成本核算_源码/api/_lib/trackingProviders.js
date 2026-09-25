const cache = new Map();
const SEA_TTL = 3 * 60 * 1000;
const AIR_TTL = 60 * 1000;

class TrackingProviderError extends Error {
  constructor(code, status = 502) { super(code); this.code = code; this.status = status; }
}

function isValidImo(value) {
  const imo = String(value || '').replace(/\s/g, '');
  if (!/^\d{7}$/.test(imo)) return false;
  const sum = imo.slice(0, 6).split('').reduce((total, digit, index) => total + Number(digit) * (7 - index), 0);
  return sum % 10 === Number(imo[6]);
}
function isValidMmsi(value) { return /^\d{9}$/.test(String(value || '').replace(/\s/g, '')); }
function normalizeIdentifier(value) { return String(value || '').trim(); }
function numberOrNull(value) { if (value === '' || value == null) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function coordinate(lat, lng) { const latitude=numberOrNull(lat),longitude=numberOrNull(lng);return latitude!=null&&longitude!=null&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{lat:latitude,lng:longitude}:null; }
function parseTimestamp(value) { const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toISOString():null; }

async function requestJson(url, options, fetchImpl) {
  let response;
  try { response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(9000)}); }
  catch(error) { if(error?.name==='TimeoutError'||error?.name==='AbortError')throw new TrackingProviderError('PROVIDER_TIMEOUT',504);throw new TrackingProviderError('PROVIDER_UNAVAILABLE',502); }
  if(response.status===401)throw new TrackingProviderError('PROVIDER_UNAUTHORIZED',502);
  if(response.status===403)throw new TrackingProviderError('PROVIDER_PERMISSION_UNAVAILABLE',502);
  if(response.status===404)throw new TrackingProviderError('TRACKING_NO_RESULT',404);
  if(response.status===429)throw new TrackingProviderError('PROVIDER_QUOTA_EXCEEDED',429);
  if(response.status>=500)throw new TrackingProviderError('PROVIDER_UNAVAILABLE',502);
  if(!response.ok)throw new TrackingProviderError('PROVIDER_REQUEST_FAILED',502);
  try{return await response.json();}catch{throw new TrackingProviderError('PROVIDER_INVALID_RESPONSE',502);}
}

function createSeaTrackingProvider({env=process.env,fetchImpl=fetch}={}) {
  const apiKey=String(env.MARINETRAFFIC_API_KEY||'').trim();
  const unavailable=()=>{if(!apiKey)throw new TrackingProviderError('MARINETRAFFIC_API_KEY_MISSING',503);};
  return {
    async search(identifiers={}) {
      unavailable();
      const imo=normalizeIdentifier(identifiers.imo),mmsi=normalizeIdentifier(identifiers.mmsi);
      if(imo&&!isValidImo(imo))throw new TrackingProviderError('TRACKING_INVALID_IMO',400);
      if(mmsi&&!isValidMmsi(mmsi))throw new TrackingProviderError('TRACKING_INVALID_MMSI',400);
      if(!imo&&!mmsi)throw new TrackingProviderError('TRACKING_IDENTIFIER_REQUIRES_IMO_OR_MMSI',400);
      const url=new URL(`https://services.marinetraffic.com/api/exportvessel/${encodeURIComponent(apiKey)}`);
      url.searchParams.set('v','6');url.searchParams.set('protocol','jsono');url.searchParams.set('timespan','1440');
      url.searchParams.set(imo?'imo':'mmsi',imo||mmsi);
      const payload=await requestJson(url,{headers:{accept:'application/json'}},fetchImpl);
      const record=Array.isArray(payload)?payload[0]:Array.isArray(payload?.DATA)?payload.DATA[0]:payload?.DATA||payload?.data?.[0]||null;
      if(!record)throw new TrackingProviderError('TRACKING_NO_RESULT',404);
      return record;
    },
    getStatus(record) { return {vesselStatus:String(record.STATUS??''),destination:textField(record.DESTINATION),navigationStatus:String(record.STATUS??''),vesselOnly:true}; },
    getPosition(record) { const point=coordinate(record.LAT,record.LON);return point?{...point,speed:numberOrNull(record.SPEED),course:numberOrNull(record.COURSE),timestamp:parseTimestamp(record.TIMESTAMP),source:'MarineTraffic'}:null; },
    getSchedule(record) { return {eta:parseTimestamp(record.ETA_CALC||record.ETA),etaSource:'MarineTraffic',etaUpdatedAt:parseTimestamp(record.ETA_UPDATED||record.TIMESTAMP),lastPort:textField(record.LAST_PORT),destinationPort:textField(record.NEXT_PORT_NAME||record.DESTINATION)}; },
    getEvents(record) { return Array.isArray(record.events)?record.events:[]; }
  };
}

function textField(value) { return value == null ? '' : String(value).trim(); }

function createAirTrackingProvider({env=process.env,fetchImpl=fetch}={}) {
  const apiKey=String(env.AIRNAV_API_KEY||'').trim();
  const unavailable=()=>{if(!apiKey)throw new TrackingProviderError('AIRNAV_API_KEY_MISSING',503);};
  return {
    async search(identifiers={}) {
      unavailable();
      const flightNo=normalizeIdentifier(identifiers.flightNo).toUpperCase().replace(/\s+/g,'');
      if(!/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(flightNo))throw new TrackingProviderError('TRACKING_INVALID_FLIGHT',400);
      const payload=await requestJson('https://api.airnavradar.com/v2/flights/live',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json',accept:'application/json'},body:JSON.stringify({flightIds:[flightNo],incLastKnownPos:true})},fetchImpl);
      if(payload?.success===false)throw new TrackingProviderError('PROVIDER_REQUEST_FAILED',502);
      const flights=Array.isArray(payload?.flights)?payload.flights:[];
      let record=flights.find(flight=>[flight.flightNumberIata,flight.flightNumberIcao,flight.callsign].some(value=>String(value||'').replace(/\s+/g,'').toUpperCase()===flightNo))||flights[0];
      if(!record){
        const url=new URL('https://api.airnavradar.com/v2/flights/schedules');url.searchParams.set('flightId',flightNo);
        if(identifiers.flightDate){const start=new Date(`${identifiers.flightDate}T00:00:00Z`),end=new Date(start.getTime()+86400000);if(!Number.isNaN(start.getTime())){url.searchParams.set('departureFromDate',start.toISOString());url.searchParams.set('departureToDate',end.toISOString());}}
        const schedules=await requestJson(url,{headers:{authorization:`Bearer ${apiKey}`,accept:'application/json'}},fetchImpl);
        record=(Array.isArray(schedules?.flights)?schedules.flights:[]).find(flight=>[flight.flightNumberIata,flight.flightNumberIcao,flight.callsign].some(value=>String(value||'').replace(/\s+/g,'').toUpperCase()===flightNo))||schedules?.flights?.[0]||null;
      }
      if(!record)throw new TrackingProviderError('TRACKING_NO_RESULT',404);
      return record;
    },
    getStatus(record) { return {flightStatus:textField(record.status||record.arrivalStatus||record.departureStatus),delayMinutes:Math.max(0,Math.round((new Date(record.estimatedDeparture||record.actualDeparture||0)-new Date(record.scheduledDeparture||0))/60000)||0)}; },
    getPosition(record) { const point=coordinate(record.latitude,record.longitude);return point?{...point,speed:numberOrNull(record.groundSpeed),course:numberOrNull(record.heading),altitude:numberOrNull(record.altitude),timestamp:parseTimestamp(record.updated||record.created||record.positions?.at(-1)?.timestamp),source:'AirNav Radar'}:null; },
    getSchedule(record) {
      const departure=coordinate(record.depAirportLatitude,record.depAirportLongitude),arrival=coordinate(record.arrAirportLatitude,record.arrAirportLongitude);
      return {scheduledDeparture:parseTimestamp(record.scheduledDeparture),actualDeparture:parseTimestamp(record.actualDeparture||record.actualTakeoff),eta:parseTimestamp(record.estimatedArrival||record.scheduledArrival),etaSource:'AirNav Radar',etaUpdatedAt:parseTimestamp(record.updated),estimatedArrival:parseTimestamp(record.estimatedArrival),actualArrival:parseTimestamp(record.actualArrival||record.actualLanding),flightStatus:textField(record.status||record.arrivalStatus||record.departureStatus),delayMinutes:this.getStatus(record).delayMinutes,departureAirport:{name:textField(record.depAirportName),code:textField(record.depAirportIata||record.depAirportIcao),...departure},arrivalAirport:{name:textField(record.arrAirportName),code:textField(record.arrAirportIata||record.arrAirportIcao),...arrival}};
    },
    getEvents(record) {
      const schedule=this.getSchedule(record),events=[];
      if(schedule.scheduledDeparture)events.push({status:'Scheduled',description:'Scheduled departure',timestamp:schedule.scheduledDeparture,location:schedule.departureAirport.code});
      if(schedule.actualDeparture)events.push({status:'Departed',description:'Actual departure',timestamp:schedule.actualDeparture,location:schedule.departureAirport.code});
      if(schedule.actualArrival)events.push({status:'Arrived',description:'Actual arrival',timestamp:schedule.actualArrival,location:schedule.arrivalAirport.code});
      const status=schedule.flightStatus.toUpperCase();if(status.includes('CANCEL'))events.push({status:'Cancelled',description:'Flight cancelled',timestamp:record.updated||new Date().toISOString()});else if(status.includes('DELAY'))events.push({status:'Delayed',description:'Flight delayed',timestamp:record.updated||new Date().toISOString()});
      return events;
    }
  };
}

function cacheKey(mode, identifiers) { return `${mode}:${Object.keys(identifiers||{}).sort().map(key=>`${key}=${normalizeIdentifier(identifiers[key])}`).join('&')}`; }
async function fetchTrackingSnapshot(mode, identifiers, options={}) {
  const key=cacheKey(mode,identifiers),now=Date.now(),ttl=mode==='air'?AIR_TTL:SEA_TTL,cached=cache.get(key);
  if(cached&&cached.expiresAt>now)return {...cached.value,cached:true};
  const provider=mode==='air'?createAirTrackingProvider(options):createSeaTrackingProvider(options);
  const record=await provider.search(identifiers);
  const status=provider.getStatus(record),position=provider.getPosition(record),schedule=provider.getSchedule(record);
  const events=provider.getEvents(record).map(event=>({...event,provider:mode==='air'?'AirNav Radar':'MarineTraffic',source:'provider',confirmed:true}));
  const value={provider:mode==='air'?'AirNav Radar':'MarineTraffic',fetchedAt:new Date().toISOString(),status,position,schedule,events,identifiers:mode==='sea'?{imo:textField(record.IMO),mmsi:textField(record.MMSI),vesselName:textField(record.SHIPNAME)}:{flightNo:textField(record.flightNumberIata||record.flightNumberIcao||record.callsign),airline:textField(record.airlineName),aircraft:textField(record.aircraftType)}};
  cache.set(key,{value,expiresAt:now+ttl});
  if(cache.size>500){for(const [cacheKeyValue,item] of cache){if(item.expiresAt<=now)cache.delete(cacheKeyValue);if(cache.size<=400)break;}}
  return {...value,cached:false};
}

module.exports={TrackingProviderError,createSeaTrackingProvider,createAirTrackingProvider,fetchTrackingSnapshot,isValidImo,isValidMmsi};
