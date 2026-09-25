let leafletPromise;
function loadLeaflet(){
  if(globalThis.L)return Promise.resolve(globalThis.L);
  if(!leafletPromise)leafletPromise=new Promise((resolve,reject)=>{
    const cssId='wesen-leaflet-css';if(!document.getElementById(cssId)){const link=document.createElement('link');link.id=cssId;link.rel='stylesheet';link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.append(link);}
    const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.onload=()=>resolve(globalThis.L);script.onerror=()=>reject(new Error('MAP_LIBRARY_UNAVAILABLE'));document.head.append(script);
  });
  return leafletPromise;
}

export async function renderTrackingMap(container,tracking,tx){
  const position=tracking.position,points=[];
  const add=(label,point,type)=>{if(point&&Number.isFinite(point.lat)&&Number.isFinite(point.lng))points.push({label,lat:point.lat,lng:point.lng,type});};
  add(tx('trackingOrigin'),tracking.origin,'endpoint');
  (tracking.routeLegs||[]).forEach(leg=>{add(leg.origin.name||tx('trackingOrigin'),leg.origin,'endpoint');add(leg.destination.name||tx('trackingDestination'),leg.destination,'endpoint');});
  add(tx('trackingDestination'),tracking.destination,'endpoint');
  add(tx('trackingCurrentPosition'),position,'current');
  if(!points.length){container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingNoPosition')}</strong><span>${tx('trackingMapWaiting')}</span></div>`;return;}
  container.innerHTML='<div class="tracking-map-canvas" role="img" aria-label="'+tx('trackingMapLabel')+'"></div>';
  try{
    const L=await loadLeaflet();if(!container.isConnected)return;
    const element=container.querySelector('.tracking-map-canvas');const map=L.map(element,{zoomControl:true,scrollWheelZoom:false,attributionControl:true,keyboard:true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
    const markers=points.map(point=>L.circleMarker([point.lat,point.lng],{radius:point.type==='current'?7:5,color:'#1c1c1e',weight:2,fillColor:'#fff',fillOpacity:1}).bindTooltip(point.label).addTo(map));
    const linePoints=points.map(point=>[point.lat,point.lng]);if(linePoints.length>1)L.polyline(linePoints,{color:'#686966',weight:2,opacity:.8,dashArray:'5 6'}).addTo(map);
    map.fitBounds(L.latLngBounds(linePoints),{padding:[24,24],maxZoom:6});
    container._wesenMap=map;
  }catch{container.innerHTML=`<div class="tracking-map-empty"><strong>${tx('trackingMapUnavailable')}</strong><span>${tx('trackingMapWaiting')}</span></div>`;}
}
