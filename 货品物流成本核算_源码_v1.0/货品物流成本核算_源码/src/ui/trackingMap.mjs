let leafletPromise;
function loadLeaflet(){
  if(globalThis.L)return Promise.resolve(globalThis.L);
  if(!leafletPromise)leafletPromise=new Promise((resolve,reject)=>{
    const cssId='wesen-leaflet-css';if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(link);}
    const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=()=>resolve(globalThis.L);script.onerror=()=>reject(new Error('MAP_LIBRARY_UNAVAILABLE'));document.head.append(script);
  });
  return leafletPromise;
}
const validPoint=point=>point&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lng));
export function buildRouteSegments({origin,position,destination}={}){
  if(!validPoint(position))return [];
  const segments=[];
  if(validPoint(origin))segments.push({kind:'solid',points:[[Number(origin.lat),Number(origin.lng)],[Number(position.lat),Number(position.lng)]]});
  if(validPoint(destination))segments.push({kind:'dashed',points:[[Number(position.lat),Number(position.lng)],[Number(destination.lat),Number(destination.lng)]]});
  return segments;
}
export async function renderTrackingMap(container,tracking,tx){
  const position=tracking.position,origin=tracking.origin,destination=tracking.destination,points=[];
  const add=(label,point,type)=>{if(validPoint(point))points.push({label,lat:Number(point.lat),lng:Number(point.lng),type});};
  add(tx('trackingOrigin'),origin,'endpoint');
  (tracking.routeLegs||[]).forEach(leg=>{if(!validPoint(origin))add(leg.origin.name||tx('trackingOrigin'),leg.origin,'endpoint');if(!validPoint(destination))add(leg.destination.name||tx('trackingDestination'),leg.destination,'endpoint');});
  add(tx('trackingDestination'),destination,'endpoint');
  add(tx('trackingCurrentPosition'),position,'current');
  const sources=tracking.mode==='sea'?tx('trackingMapSourceSea'):tx('trackingMapSourceAir');
  const attribution=tx('trackingMapCredit');
  if(!points.length){container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingNoPosition')}</strong><span>${tx('trackingMapWaiting')}</span><small>${sources} · ${attribution}</small></div>`;return;}
  container.innerHTML='<div class="tracking-map-canvas" role="img" aria-label="'+tx('trackingMapLabel')+'"></div><div class="tracking-map-source">'+sources+' · '+attribution+'</div>';
  try{
    const L=await loadLeaflet();if(!container.isConnected)return;
    const element=container.querySelector('.tracking-map-canvas');const map=L.map(element,{zoomControl:true,scrollWheelZoom:false,attributionControl:true,keyboard:true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    const markers=points.map(point=>L.circleMarker([point.lat,point.lng],{radius:point.type==='current'?7:5,color:'#1c1c1e',weight:2,fillColor:'#fff',fillOpacity:1}).bindTooltip(point.label).addTo(map));
    const segments=buildRouteSegments({origin,position,destination});
    for(const segment of segments)L.polyline(segment.points,{color:'#686966',weight:2,opacity:.8,dashArray:segment.kind==='dashed'?'5 6':null}).addTo(map);
    map.fitBounds(L.latLngBounds(points.map(point=>[point.lat,point.lng])),{padding:[24,24],maxZoom:6});
    container._wesenMap=map;
  }catch{container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingMapUnavailable')}</strong><span>${tx('trackingMapWaiting')}</span><small>${sources} · ${attribution}</small></div>`;}
}

