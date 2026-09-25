const AISSTREAM_URL='wss://stream.aisstream.io/v0/stream';
const AIS_EAST_ASIA_BOUNDS=[[[45,120],[20,150]]];
const SEA_CACHE_MS=150000;
const AIR_CACHE_MS=45000;
const cache=new Map();
let lastAdsbRequestAt=0;

class TrackingProviderError extends Error {
  constructor(code,status=502){super(code);this.code=code;this.status=status;}
}
function text(value){return value==null?'':String(value).trim();}
function numberOrNull(value){if(value===''||value==null||value==='ground')return null;const number=Number(value);return Number.isFinite(number)?number:null;}
function validMmsi(value){return /^\d{9}$/.test(text(value));}
function validIcao24(value){return /^[0-9a-f]{6}$/i.test(text(value));}
function validCallsign(value){return /^[A-Z0-9]{2,8}$/.test(text(value).toUpperCase().replace(/\s+/g,''));}
function parseMessage(data){try{return JSON.parse(Buffer.isBuffer(data)?data.toString('utf8'):String(data));}catch{return null;}}
function adsbLastSeen(nowValue,seenSeconds,fallback){
  const now=numberOrNull(nowValue),seen=numberOrNull(seenSeconds);
  if(now==null||seen==null)return fallback;
  const timestampMs=(now>1e12?now:now*1000)-seen*1000,date=new Date(timestampMs);
  return Number.isNaN(date.getTime())?fallback:date.toISOString();
}
function matchingMmsi(message,mmsi){
  const meta=message&&message.MetaData||{},body=message&&message.Message||{};
  const supplied=meta.MMSI||body.PositionReport&&body.PositionReport.UserID||body.ShipStaticData&&body.ShipStaticData.UserID;
  return text(supplied)===mmsi;
}

function createSeaTrackingProvider({env=process.env,WebSocketImpl,timeoutMs=25000,now=()=>new Date(),log=console.info}={}){
  return {
    async search(identifiers={}){
      const mmsi=text(identifiers.mmsi);
      if(!validMmsi(mmsi))throw new TrackingProviderError(mmsi?'TRACKING_INVALID_MMSI':'TRACKING_IDENTIFIER_REQUIRES_MMSI',400);
      const apiKey=text(env.AISSTREAM_API_KEY);
      if(!apiKey)throw new TrackingProviderError('AISSTREAM_API_KEY_MISSING',503);
      const Socket=WebSocketImpl||require('ws');
      return new Promise((resolve,reject)=>{
        let socket,settled=false,subscriptionSent=false,subscribed=false,staticName='';
        const logState=state=>{try{log?.({event:`sea_${state}`,provider:'AISStream.io'});}catch{}};
        const timer=setTimeout(()=>{
          if(subscribed){logState('no_new_position');finish(null,{ok:true,state:'no_new_position',provider:'AISStream.io',fetchedAt:now().toISOString(),position:null,identifiers:{mmsi},status:{},schedule:{},events:[]});}
          else if(subscriptionSent)finish(new TrackingProviderError('PROVIDER_SUBSCRIPTION_TIMEOUT',504));
          else finish(new TrackingProviderError('PROVIDER_TIMEOUT',504));
        },timeoutMs);
        const finish=(error,value)=>{
          if(settled)return;
          settled=true;clearTimeout(timer);
          try{if(socket&&(socket.readyState===0||socket.readyState===1))socket.close();}catch{}
          if(error)reject(error);else resolve(value);
        };
        try{
          socket=new Socket(AISSTREAM_URL,{perMessageDeflate:true,handshakeTimeout:Math.min(3000,timeoutMs)});
          socket.on('open',()=>{
            logState('socket_connected');
            try{
              socket.send(JSON.stringify({
                APIKey:apiKey,
                BoundingBoxes:AIS_EAST_ASIA_BOUNDS,
                FiltersShipMMSI:[mmsi],
                FilterMessageTypes:['PositionReport','ShipStaticData']
              }));
              subscriptionSent=true;
              logState('subscription_sent');
            }catch{finish(new TrackingProviderError('PROVIDER_UNAVAILABLE',502));}
          });
          socket.on('message',raw=>{
            const envelope=parseMessage(raw);
            if(!envelope)return;
            if(envelope.MessageType==='SubscriptionConfirmation'){
              subscribed=true;
              logState('subscription_confirmed');
              return;
            }
            const providerMessage=text(envelope.Error||envelope.Message?.Error||envelope.Message?.error||envelope.error||(typeof envelope.Message==='string'?envelope.Message:''));
            if(envelope.MessageType==='Error'||providerMessage){
              const unauthorized=/api.?key|unauthori[sz]ed|authentication|credential|401/i.test(providerMessage);
              finish(new TrackingProviderError(unauthorized?'PROVIDER_UNAUTHORIZED':'PROVIDER_SUBSCRIPTION_REJECTED',unauthorized?401:502));
              return;
            }
            if(!subscribed||!matchingMmsi(envelope,mmsi))return;
            const meta=envelope.MetaData||{},body=envelope.Message||{};
            if(envelope.MessageType==='ShipStaticData'){
              const data=body.ShipStaticData||{};
              staticName=text(meta.ShipName||data.Name||staticName);
              return;
            }
            if(envelope.MessageType!=='PositionReport')return;
            const data=body.PositionReport||{},lat=numberOrNull(meta.Latitude==null?data.Latitude:meta.Latitude),lng=numberOrNull(meta.Longitude==null?data.Longitude:meta.Longitude);
            if(lat==null||lng==null||Math.abs(lat)>90||Math.abs(lng)>180)return;
            const fetchedAt=now().toISOString(),timestamp=text(meta.time_utc||meta.TimeUTC)||fetchedAt;
            const shipName=text(meta.ShipName||staticName);
            const position={
              lat,lng,speed:numberOrNull(data.Sog),course:numberOrNull(data.Cog),heading:numberOrNull(data.TrueHeading),
              navigationStatus:numberOrNull(data.NavigationalStatus),timestamp,lastSeen:timestamp,source:'AISStream.io',mmsi,shipName
            };
            finish(null,{
              ok:true,state:'live',provider:'AISStream.io',fetchedAt,
              status:{navigationStatus:position.navigationStatus},
              position,
              identifiers:{mmsi,vesselName:shipName},
              schedule:{},events:[]
            });
            logState('position_received');
          });
          socket.on('error',error=>{
            const timeout=/timeout/i.test(text(error&&error.message));
            logState('provider_error');
            finish(new TrackingProviderError(timeout?'PROVIDER_TIMEOUT':'PROVIDER_UNAVAILABLE',timeout?504:502));
          });
          socket.on('close',(code)=>{
            logState('socket_closed');
            if(!subscribed){
              const rejected=code===1000||code===1008;
              finish(new TrackingProviderError(code===1008?'PROVIDER_UNAUTHORIZED':rejected?'PROVIDER_SUBSCRIPTION_REJECTED':'PROVIDER_UNAVAILABLE',code===1008?401:rejected?502:502));
              return;
            }
            if(code===1000){logState('no_new_position');finish(null,{ok:true,state:'no_new_position',provider:'AISStream.io',fetchedAt:now().toISOString(),position:null,identifiers:{mmsi},status:{},schedule:{},events:[]});return;}
            finish(new TrackingProviderError('PROVIDER_UNAVAILABLE',502));
          });
        }catch(error){
          clearTimeout(timer);
          reject(error instanceof TrackingProviderError?error:new TrackingProviderError('PROVIDER_UNAVAILABLE',502));
        }
      });
    }
  };
}

function createAirTrackingProvider({fetchImpl=fetch,now=()=>new Date(),minRequestIntervalMs=1000,clock=()=>Date.now(),timeoutMs=8000,log=console.info}={}){
  return {
    async search(identifiers={}){
      const icao24=text(identifiers.icao24).toLowerCase(),callsign=text(identifiers.callsign).toUpperCase().replace(/\s+/g,'');
      let path='';
      if(icao24){
        if(!validIcao24(icao24))throw new TrackingProviderError('TRACKING_INVALID_ICAO24',400);
        if(callsign&&!validCallsign(callsign))throw new TrackingProviderError('TRACKING_INVALID_CALLSIGN',400);
        path='v2/icao/'+encodeURIComponent(icao24);
      }else if(callsign){
        if(!validCallsign(callsign))throw new TrackingProviderError('TRACKING_INVALID_CALLSIGN',400);
        path='v2/callsign/'+encodeURIComponent(callsign);
      }else{
        throw new TrackingProviderError('TRACKING_IDENTIFIER_REQUIRED',400);
      }
      const requestStartedAt=clock();
      if(minRequestIntervalMs>0&&requestStartedAt-lastAdsbRequestAt<minRequestIntervalMs)throw new TrackingProviderError('PROVIDER_RATE_LIMITED',429);
      lastAdsbRequestAt=requestStartedAt;
      try{log?.({event:icao24?'air_lookup_by_icao24':'air_lookup_by_callsign',provider:'adsb.fi'});}catch{}
      const controller=new AbortController();let timeout;
      let response,payload;
      try{
        const request=(async()=>{
          const result=await fetchImpl('https://opendata.adsb.fi/api/'+path,{headers:{accept:'application/json'},signal:controller.signal});
          if(result.status===404||result.status===429||result.status>=500||!result.ok)return {response:result,payload:null};
          let data;try{data=await result.json();}catch{throw new TrackingProviderError('PROVIDER_INVALID_RESPONSE',502);}
          return {response:result,payload:data};
        })();
        ({response,payload}=await Promise.race([
          request,
          new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new TrackingProviderError('PROVIDER_TIMEOUT',504));},timeoutMs);})
        ]));
      }catch(error){if(error instanceof TrackingProviderError)throw error;throw new TrackingProviderError('PROVIDER_UNAVAILABLE',502);}
      finally{clearTimeout(timeout);}
      if(response.status===429)throw new TrackingProviderError('PROVIDER_RATE_LIMITED',429);
      if(response.status===404){try{log?.({event:'air_no_live_signal',provider:'adsb.fi',upstreamStatus:404});}catch{}return {record:null,fetchedAt:now().toISOString(),lastSeen:null,identifiers:{icao24,callsign}};}
      if(response.status>=500)throw new TrackingProviderError('PROVIDER_UNAVAILABLE',502);
      if(!response.ok)throw new TrackingProviderError('PROVIDER_REQUEST_FAILED',502);
      try{log?.({event:'air_provider_status',provider:'adsb.fi',status:response.status});}catch{}
      const aircraft=Array.isArray(payload)?payload:Array.isArray(payload&&payload.ac)?payload.ac:Array.isArray(payload&&payload.aircraft)?payload.aircraft:payload&&payload.hex?[payload]:[];
      if(!Array.isArray(payload)&&!Array.isArray(payload?.ac)&&!Array.isArray(payload?.aircraft)&&!payload?.hex)throw new TrackingProviderError('PROVIDER_INVALID_RESPONSE',502);
      const record=aircraft.find(item=>{
        const hex=text(item.hex||item.icao24).toLowerCase(),flight=text(item.flight||item.callsign).toUpperCase().replace(/\s+/g,'');
        return icao24?hex===icao24:flight===callsign;
      });
      if(!record){try{log?.({event:'air_no_live_signal',provider:'adsb.fi'});}catch{}return {record:null,fetchedAt:now().toISOString(),lastSeen:null,identifiers:{icao24,callsign}};}
      try{log?.({event:'aircraft_found',provider:'adsb.fi'});}catch{}
      const fetchedAt=now().toISOString(),seen=numberOrNull(record.seen_pos==null?record.seen:record.seen_pos);
      return {record,fetchedAt,lastSeen:adsbLastSeen(payload&&payload.now,seen,fetchedAt)};
    },
    async fetch(identifiers={}){
      const result=await this.search(identifiers),record=result.record;
      if(!record)return {ok:true,state:'no_live_signal',provider:'adsb.fi',fetchedAt:result.fetchedAt,position:null,identifiers:{flightNo:text(identifiers.flightNo),callsign:result.identifiers.callsign,icao24:result.identifiers.icao24},status:{},schedule:{},events:[]};
      const lat=numberOrNull(record.lat),lng=numberOrNull(record.lon);
      const icao24=text(record.hex||record.icao24).toLowerCase(),callsign=text(record.flight||record.callsign).trim(),registration=text(record.r||record.registration);
      const position=lat!=null&&lng!=null&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{
        lat,lng,altitude:numberOrNull(record.alt_baro==null?record.alt_geom:record.alt_baro),
        speed:numberOrNull(record.gs),course:numberOrNull(record.track),heading:numberOrNull(record.track),
        verticalRate:numberOrNull(record.baro_rate==null?record.geom_rate:record.baro_rate),
        timestamp:result.lastSeen,lastSeen:result.lastSeen,source:'adsb.fi',icao24,callsign,registration
      }:null;
      const landed=record.on_ground===true||record.alt_baro==='ground';
      return {
        ok:true,state:position?'live':'no_live_signal',provider:'adsb.fi',fetchedAt:result.fetchedAt,
        status:{flightStatus:landed?'landed':text(record.flight_status),landed,completed:landed},
        position,
        identifiers:{
          flightNo:text(identifiers.flightNo),callsign,icao24,registration
        },
        schedule:{},
        events:landed?[{normalizedType:'arrived',originalType:'landed',description:'Aircraft landed',timestamp:result.lastSeen,provider:'adsb.fi',source:'provider',confirmed:true}]:[]
      };
    }
  };
}

function cacheKey(mode,identifiers){
  const fields=mode==='sea'?['mmsi']:['icao24','callsign'];
  return mode+':'+fields.map(key=>key+'='+text(identifiers&&identifiers[key]).toLowerCase()).join('&');
}
async function fetchTrackingSnapshot(mode,identifiers,options={}){
  const key=cacheKey(mode,identifiers),now=Date.now(),ttl=mode==='air'?AIR_CACHE_MS:SEA_CACHE_MS,cached=cache.get(key);
  if(cached&&cached.expiresAt>now)return {...cached.value,cached:true};
  const provider=mode==='air'?createAirTrackingProvider(options):createSeaTrackingProvider(options);
  const value=mode==='air'?await provider.fetch(identifiers):await provider.search(identifiers);
  cache.set(key,{value,expiresAt:now+ttl});
  if(cache.size>500){for(const [entry,item] of cache){if(item.expiresAt<=now)cache.delete(entry);if(cache.size<=400)break;}}
  return {...value,cached:false};
}
function clearTrackingCache(){cache.clear();lastAdsbRequestAt=0;}

module.exports={TrackingProviderError,createSeaTrackingProvider,createAirTrackingProvider,fetchTrackingSnapshot,clearTrackingCache,validMmsi,validIcao24,validCallsign};
