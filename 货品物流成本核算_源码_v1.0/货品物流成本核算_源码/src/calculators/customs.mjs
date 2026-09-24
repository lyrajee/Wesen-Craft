const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const itemRate = (value, fallback) => value == null || value === '' ? finite(fallback) : finite(value);

export function calculateCustomsValue({goodsCny, internationalFreightCny = 0, insuranceCny = 0}) {
  return finite(goodsCny) + finite(internationalFreightCny) + finite(insuranceCny);
}

export function calculateDuty(customsValue, dutyRate) {
  return finite(customsValue) * finite(dutyRate) / 100;
}

export function calculateConsumptionTax(customsValue,duty,rate){
  const decimal=finite(rate)/100;
  if(decimal<=0)return 0;
  if(decimal>=1)return null;
  return (finite(customsValue)+finite(duty))/(1-decimal)*decimal;
}

export function calculateImportVat({customsValue, duty, consumptionTax = 0, vatRate}) {
  return (finite(customsValue) + finite(duty) + finite(consumptionTax)) * finite(vatRate) / 100;
}

export function calculateProductTaxes(item, jpyCny, settings = {}, allocated = {}) {
  const goods = finite(item.quantity ?? item.qty) * finite(item.unitPriceJpy ?? item.price) * finite(jpyCny);
  const customsValue = calculateCustomsValue({goodsCny:goods, internationalFreightCny:allocated.internationalFreightCny, insuranceCny:allocated.insuranceCny});
  const dutyRate = itemRate(item.dutyRate ?? item.duty, settings.dutyRate);
  const vatRate = itemRate(item.vatRate ?? item.vat, settings.vatRate);
  const consumptionTaxRate = itemRate(item.customsRateSnapshot?.consumptionTaxRate, 0);
  const duty = calculateDuty(customsValue,dutyRate);
  const consumptionTax = calculateConsumptionTax(customsValue,duty,consumptionTaxRate);
  const vat = consumptionTax==null?null:calculateImportVat({customsValue,duty,consumptionTax,vatRate});
  return {goods,customsValue,duty,dutyRate,consumptionTax,consumptionTaxRate,vat,vatRate};
}
