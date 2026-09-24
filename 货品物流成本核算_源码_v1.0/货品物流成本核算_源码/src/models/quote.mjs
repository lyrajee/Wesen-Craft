import {isoNow,makeId} from './product.mjs';
import {createChargeLine} from './chargeLine.mjs';

export function createFreightQuote(input = {}) {
  return {
    ...input,
    id:String(input.id||makeId('quote')),
    batchId:String(input.batchId||''),
    forwarderName:String(input.forwarderName||''),
    forwarderContact:String(input.forwarderContact||''),
    quoteNumber:String(input.quoteNumber||''),
    quoteDate:String(input.quoteDate||''),
    validUntil:String(input.validUntil||''),
    transportMode:['air','lcl','fcl'].includes(input.transportMode)?input.transportMode:'air',
    origin:String(input.origin||''),destination:String(input.destination||''),
    carrier:String(input.carrier||''),vesselOrFlight:String(input.vesselOrFlight||''),
    containerType:['20GP','40GP','40HQ'].includes(input.containerType)?input.containerType:null,
    etd:String(input.etd||''),eta:String(input.eta||''),
    transitDays:input.transitDays==null||input.transitDays===''?null:Number(input.transitDays),
    chargeLines:Array.isArray(input.chargeLines)?input.chargeLines.map(createChargeLine):[],
    remarks:String(input.remarks||''),sourceFileReference:String(input.sourceFileReference||''),
    parserStatus:String(input.parserStatus||'manual'),confirmed:Boolean(input.confirmed),
    createdAt:String(input.createdAt||isoNow()),updatedAt:String(input.updatedAt||isoNow())
  };
}
