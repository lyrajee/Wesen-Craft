import {resolveTrackingLocation} from '../models/trackingLocations.mjs';
let leafletPromise;
function loadLeaflet(){
  if(globalThis.L)return Promise.resolve(globalThis.L);
  if(!leafletPromise)leafletPromise=new Promise((resolve,reject)=>{
    const cssId='wesen-leaflet-css';if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(link);}
    const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=()=>resolve(globalThis.L);script.onerror=()=>reject(new Error('MAP_LIBRARY_UNAVAILABLE'));document.head.append(script);
  });
  return leafletPromise;
}
const validPoint=point=>point&&point.lat!=null&&point.lat!==''&&point.lng!=null&&point.lng!==''&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lng))&&Math.abs(Number(point.lat))<=90&&Math.abs(Number(point.lng))<=180;
export function buildRouteSegments({origin,position,destination}={}){
  if(!validPoint(position))return [];
  const segments=[];
  if(validPoint(origin))segments.push({kind:'solid',points:[[Number(origin.lat),Number(origin.lng)],[Number(position.lat),Number(position.lng)]]});
  if(validPoint(destination))segments.push({kind:'dashed',points:[[Number(position.lat),Number(position.lng)],[Number(destination.lat),Number(destination.lng)]]});
  return segments;
}
export async function renderTrackingMap(container,tracking,tx){
  const renderVersion=(container._wesenMapVersion||0)+1;container._wesenMapVersion=renderVersion;
  const position=tracking.position,legs=tracking.routeLegs||[],firstLeg=legs.slice().sort((a,b)=>a.sequence-b.sequence)[0],lastLeg=legs.slice().sort((a,b)=>b.sequence-a.sequence)[0];
  const locationKind=tracking.mode==='air'?'airport':'port';
  const origin=resolveTrackingLocation(tracking.origin,locationKind)||resolveTrackingLocation(firstLeg?.origin,locationKind);
  const destination=resolveTrackingLocation(tracking.destination,locationKind)||resolveTrackingLocation(lastLeg?.destination,locationKind);
  const points=[];
  const add=(label,point,type)=>{if(validPoint(point))points.push({label,lat:Number(point.lat),lng:Number(point.lng),type});};
  add(tx('trackingOrigin'),origin,'endpoint');
  if(!validPoint(origin))for(const leg of legs)add(leg.origin.name||tx('trackingOrigin'),resolveTrackingLocation(leg.origin,locationKind),'endpoint');
  if(!validPoint(destination))for(const leg of legs)add(leg.destination.name||tx('trackingDestination'),resolveTrackingLocation(leg.destination,locationKind),'endpoint');
  add(tx('trackingDestination'),destination,'endpoint');
  const hasPosition=validPoint(position),lastKnown=hasPosition&&tracking.trackingStatus!=='live';
  const rawPositionTime=position.timestamp||position.lastSeen||tracking.lastSuccessfulUpdate||'';
  const parsedPositionTime=rawPositionTime?new Date(rawPositionTime):null;
  const formattedPositionTime=parsedPositionTime&&!Number.isNaN(parsedPositionTime.getTime())?parsedPositionTime.toLocaleString():rawPositionTime||'—';
  const positionLabel=lastKnown?`${tx('trackingLastKnownPosition')} · ${formattedPositionTime}`:tx('trackingCurrentPosition');
  add(positionLabel,position,lastKnown?'last-known':'current');
  const sources=tracking.mode==='sea'?tx('trackingMapSourceSea'):tx('trackingMapSourceAir');
  const attribution=tx('trackingMapCredit');
  if(!points.length){container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingNoPosition')}</strong><span>${tx('trackingMapWaiting')}</span><small>${sources} · ${attribution}</small></div>`;return;}
  container.innerHTML='<div class="tracking-map-canvas" role="img" aria-label="'+tx('trackingMapLabel')+'"></div><div class="tracking-map-source">'+sources+' · '+attribution+'</div>';
  try{
    const L=await loadLeaflet();if(!container.isConnected||container._wesenMapVersion!==renderVersion)return;
    const element=container.querySelector('.tracking-map-canvas');const map=L.map(element,{zoomControl:true,scrollWheelZoom:false,attributionControl:true,keyboard:true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    const markers=points.map(point=>L.circleMarker([point.lat,point.lng],{radius:point.type==='endpoint'?5:7,color:point.type==='last-known'?'#777':'#1c1c1e',weight:2,fillColor:'#fff',fillOpacity:1}).bindTooltip(point.label).addTo(map));
    const segments=buildRouteSegments({origin,position,destination});
    for(const segment of segments)L.polyline(segment.points,{color:'#686966',weight:2,opacity:.8,dashArray:segment.kind==='dashed'?'5 6':null}).addTo(map);
    map.fitBounds(L.latLngBounds(points.map(point=>[point.lat,point.lng])),{padding:[24,24],maxZoom:6});
    container._wesenMap=map;
  }catch{if(container._wesenMapVersion===renderVersion)container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingMapUnavailable')}</strong><span>${tx('trackingMapWaiting')}</span><small>${sources} · ${attribution}</small></div>`;}
}
