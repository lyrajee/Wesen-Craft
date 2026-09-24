import {isoNow,makeId} from './product.mjs';

export const CHARGE_CATEGORIES = ['ocean_freight','air_freight','baf','lss','pss','origin_thc','destination_thc','doc','seal','vgm','export_customs','import_customs','port_charges','trucking','insurance','other'];
export const CHARGE_UNITS = ['KG','CBM','RT','W/M','20GP','40GP','40HQ','CONTAINER','B/L','SET','SHIPMENT','TICKET','CARTON','CUSTOM'];
const optional = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function createChargeLine(input = {}) {
  const originalName=String(input.originalName ?? input.name ?? '');
  return {
    id:String(input.id || makeId('charge')),
    category:CHARGE_CATEGORIES.includes(input.category) ? input.category : 'other',
    originalName,
    normalizedName:String(input.normalizedName || originalName),
    currency:String(input.currency || 'CNY').toUpperCase(),
    unit:String(input.unit || 'CUSTOM').toUpperCase(),
    quantity:optional(input.quantity),
    unitPrice:optional(input.unitPrice),
    minimumCharge:optional(input.minimumCharge),
    included:Boolean(input.included),
    totalOriginalCurrency:optional(input.totalOriginalCurrency),
    totalCny:optional(input.totalCny),
    allocationBasis:String(input.allocationBasis || ''),
    note:String(input.note || ''),
    createdAt:String(input.createdAt || isoNow()),
    updatedAt:String(input.updatedAt || isoNow())
  };
}
