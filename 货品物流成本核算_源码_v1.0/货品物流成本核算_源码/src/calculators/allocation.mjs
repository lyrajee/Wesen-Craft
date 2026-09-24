const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const keys={weight:item=>finite(item.quantity??item.qty)*finite(item.unitWeightKg??item.weight),volume:item=>finite(item.quantity??item.qty)*finite(item.unitVolumeM3??item.volume),value:item=>finite(item.quantity??item.qty)*finite(item.unitPriceJpy??item.price),quantity:item=>finite(item.quantity??item.qty)};

export function allocateCost({totalCost,items,basis,percentages={}}) {
  if(!Number.isFinite(Number(totalCost)))return {valid:false,allocations:[],warning:'INVALID_TOTAL'};
  if(!Array.isArray(items)||!items.length)return {valid:false,allocations:[],warning:'NO_ITEMS'};
  let weights;
  if(basis==='custom'){
    weights=items.map(item=>Number(percentages[item.id]));
    if(weights.some(weight=>!Number.isFinite(weight)||weight<0))return {valid:false,allocations:[],warning:'INVALID_PERCENTAGES'};
    if(Math.abs(weights.reduce((sum,weight)=>sum+weight,0)-100)>1e-6)return {valid:false,allocations:[],warning:'PERCENTAGES_NOT_100'};
  }else{
    if(!keys[basis])return {valid:false,allocations:[],warning:'UNKNOWN_BASIS'};
    weights=items.map(item=>keys[basis](item));
    if(weights.some(weight=>weight<0))return {valid:false,allocations:[],warning:'NEGATIVE_BASIS'};
  }
  const sum=weights.reduce((total,value)=>total+value,0);
  if(sum<=0)return {valid:false,allocations:[],warning:`ZERO_${basis.toUpperCase()}`};
  const allocations=weights.map(weight=>Number(totalCost)*weight/sum);
  allocations[allocations.length-1]=Number(totalCost)-allocations.slice(0,-1).reduce((total,value)=>total+value,0);
  return {valid:true,allocations,warning:null,basis};
}
export const allocateByWeight=(totalCost,items)=>allocateCost({totalCost,items,basis:'weight'});
export const allocateByVolume=(totalCost,items)=>allocateCost({totalCost,items,basis:'volume'});
export const allocateByValue=(totalCost,items)=>allocateCost({totalCost,items,basis:'value'});
export const allocateByQuantity=(totalCost,items)=>allocateCost({totalCost,items,basis:'quantity'});
export const allocateCustom=(totalCost,items,percentages)=>allocateCost({totalCost,items,basis:'custom',percentages});
