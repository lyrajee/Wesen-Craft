import {createShipmentTracking} from '../models/tracking.mjs';
import {isoNow} from '../models/product.mjs';

export function createTrackingRepository(batchRepository) {
  const batchFor=id=>{const batch=batchRepository.get(id);if(!batch)throw new Error('Batch not found');return batch;};
  return {
    list(batchId){return [...(batchFor(batchId).trackings||[])];},
    get(batchId,id){return (batchFor(batchId).trackings||[]).find(tracking=>tracking.id===id)||null;},
    create(batchId,input){const batch=batchFor(batchId);const tracking=createShipmentTracking({...input,batchId,id:input.id},isoNow());if(batch.trackings.some(item=>item.id===tracking.id))throw new Error('Tracking already exists');batch.trackings.push(tracking);batchRepository.update(batch);return tracking;},
    update(batchId,input){const batch=batchFor(batchId),index=(batch.trackings||[]).findIndex(item=>item.id===input.id);if(index<0)throw new Error('Tracking not found');const tracking=createShipmentTracking({...batch.trackings[index],...input,batchId,createdAt:batch.trackings[index].createdAt,updatedAt:isoNow()});batch.trackings[index]=tracking;batchRepository.update(batch);return tracking;},
    remove(batchId,id){const batch=batchFor(batchId),tracking=(batch.trackings||[]).find(item=>item.id===id);if(!tracking)return null;batch.trackings=batch.trackings.filter(item=>item.id!==id);batchRepository.update(batch);return tracking;}
  };
}
