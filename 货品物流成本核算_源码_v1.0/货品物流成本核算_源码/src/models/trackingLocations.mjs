const LOCATIONS=[
  {kind:'port',name:'Kobe',lat:34.681,lng:135.186,aliases:['kobe','神户','神戸']},
  {kind:'port',name:'Osaka',lat:34.653,lng:135.432,aliases:['osaka','大阪']},
  {kind:'port',name:'Tokyo',lat:35.653,lng:139.795,aliases:['tokyo','东京','東京']},
  {kind:'port',name:'Yokohama',lat:35.452,lng:139.642,aliases:['yokohama','横滨','横浜']},
  {kind:'port',name:'Shanghai',lat:31.23,lng:121.49,aliases:['shanghai','上海']},
  {kind:'port',name:'Ningbo',lat:29.87,lng:121.55,aliases:['ningbo','宁波','寧波']},
  {kind:'port',name:'Busan',lat:35.1,lng:129.04,aliases:['busan','부산','釜山']},
  {kind:'airport',name:'Narita International Airport',code:'NRT',lat:35.772,lng:140.392,aliases:['nrt','narita','成田']},
  {kind:'airport',name:'Haneda Airport',code:'HND',lat:35.549,lng:139.779,aliases:['hnd','haneda','羽田']},
  {kind:'airport',name:'Kansai International Airport',code:'KIX',lat:34.434,lng:135.244,aliases:['kix','kansai','关西国际','関西国際']},
  {kind:'airport',name:'Shanghai Pudong International Airport',code:'PVG',lat:31.144,lng:121.808,aliases:['pvg','pudong','浦东','浦東']},
  {kind:'airport',name:'Shanghai Hongqiao International Airport',code:'SHA',lat:31.197,lng:121.336,aliases:['sha','hongqiao','虹桥','虹橋']}
];
const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[\s,，、()（）_-]+/g,'');
export function resolveTrackingLocation(value,kind){
  if(value&&value.lat!=null&&value.lat!==''&&value.lng!=null&&value.lng!==''&&Number.isFinite(Number(value.lat))&&Number.isFinite(Number(value.lng))&&Math.abs(Number(value.lat))<=90&&Math.abs(Number(value.lng))<=180)return {...value,lat:Number(value.lat),lng:Number(value.lng)};
  const query=normalize(typeof value==='string'?value:[value?.code,value?.name].filter(Boolean).join(' '));
  if(!query)return null;
  return LOCATIONS.find(item=>(!kind||item.kind===kind)&&item.aliases.some(alias=>query===normalize(alias)||query.includes(normalize(alias))))||null;
}
export function knownTrackingLocations(){return LOCATIONS.map(item=>({...item,aliases:[...item.aliases]}));}

