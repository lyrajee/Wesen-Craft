import {calculateProductTaxes} from './customs.mjs';
import {calculateFclCost} from './fcl.mjs';
import {calculateQuoteTotal} from './quotes.mjs';
const n = value => Number(value) || 0;

export function taxFor(x, rate, settings) {
  return calculateProductTaxes(x,rate,settings);
}

export function routeCost(i, rate, {routes, items, otherFee: otherFeeValue, usdRate: usdRateValue, lang, money, fcl, exchangeRates}) {
  const r = routes[i];
  const weight = items.reduce((s, x) => s + x.qty * x.weight, 0);
  const cbm = items.reduce((s, x) => s + x.qty * x.volume, 0);
  const parcels = Math.max(1, Math.ceil(weight / 3));
  const otherFee = n(otherFeeValue);
  const linkGroups = Math.ceil(Math.max(items.length - 5, 0) / 6);
  if(r.type==='fcl'){
    const result=calculateFclCost({containerType:fcl?.containerType,chargeLines:fcl?.chargeLines||[],exchangeRates,weightKg:weight,volumeM3:cbm});
    const totals=calculateQuoteTotal({chargeLines:fcl?.chargeLines||[]},exchangeRates,{weightKg:weight,volumeM3:cbm,containerCount:1}).totals;
    return {freight:result.totalCny,international:totals.international,domestic:totals.domestic,insurance:totals.insurance,otherCharges:totals.other,other:0,weight,cbm,breakdown:result.breakdown,warnings:result.warnings,originals:result.originals};
  }
  const cnyLine = (price, unit, qtyNum, qtyStr) => qtyNum === 1
    ? `${money(price)}/${unit}`
    : `${money(price)}/${unit} × ${qtyStr}${unit} = ${money(price * qtyNum)}`;
  if (r.type === 'air') {
    const wStr = weight.toFixed(2);
    const parts = [
      ['空运费 NRT→PVG', cnyLine(16, 'kg', weight, wStr)],
      ['日本出口报关费', `${money(380)}/票`],
      ['订舱打单费', cnyLine(1.5, 'kg', weight, wStr)],
      ['操作费', cnyLine(1.5, 'kg', weight, wStr)],
      ['爆炸物检测费', cnyLine(15, '箱', parcels, String(parcels))],
      ['PVG 报关费', `${money(300)}（含5个品名）`],
      ['PVG 联单费', linkGroups ? `${money(50)}/6个品名 × ${linkGroups}组 = ${money(50 * linkGroups)}` : `${money(50)}/6个品名（本批未超出5个品名）`],
      ['其他费用', money(otherFee)]
    ];
    const freight = 16 * weight + 380 + 1.5 * weight * 2 + 15 * parcels + 300 + 50 * linkGroups + otherFee;
    return {freight, international:16*weight+380+1.5*weight*2+15*parcels,domestic:300+50*linkGroups,other:0,otherCharges:otherFee,insurance:0, weight, cbm, parcels, breakdown: parts};
  }
  const rt = Math.max(cbm, weight / 1000);
  const drt = Math.max(3, Math.ceil(rt));
  const usdRate = n(usdRateValue);
  const ofSurcharge = rt > 20 ? 15 : rt > 15 ? 10 : rt > 10 ? 5 : 0;
  const sheets = items.length <= 3 ? 1 : 2 + Math.floor((items.length - 4) / 5);
  const rtStr = rt.toFixed(3);
  const drtStr = String(drt);
  const usdLine = (price, unit, qtyNum, qtyStr) => {
    const total = price * qtyNum;
    return qtyNum === 1
      ? `$${price.toFixed(2)}/${unit} → ${money(total * usdRate)}`
      : `$${price.toFixed(2)}/${unit} × ${qtyStr}${unit} = $${total.toFixed(2)} → ${money(total * usdRate)}`;
  };
  const foreignUsdTotal = (30 + ofSurcharge) * rt + 47.84 * rt + 30 + 61.45 * sheets + 100 + 16.66 + 10 * rt;
  const domesticCnyTotal = 200 + 200 + 300 + 50 * linkGroups + 300 + 150 * drt + 30 * drt + 30 * drt + 30 * drt + 100 * drt + 100 + 25 * drt + 150 * drt + otherFee;
  const breakdown = [
    ['__section__', lang === 'zh' ? '国外收费（美元计价）' : lang === 'ja' ? '海外費用（USD建て）' : 'Foreign charges (USD)'],
    ['O/F 海运费', usdLine(30 + ofSurcharge, 'RT', rt, rtStr)],
    ['日本 CFS', usdLine(47.84, 'RT', rt, rtStr)],
    ['DOC FEE', usdLine(30, 'SET', 1, '1')],
    ['CLEARANCE FEE', usdLine(61.45, 'SHEET', sheets, String(sheets))],
    ['HANDLING CHARGE', usdLine(100, 'SHIPMT', 1, '1')],
    ['AFS', usdLine(16.66, 'BL', 1, '1')],
    ['drayage surcharge', usdLine(10, 'RT', rt, rtStr)],
    ['__section__', lang === 'zh' ? '国内收费（人民币计价）' : lang === 'ja' ? '国内費用（人民元建て）' : 'Domestic charges (CNY)'],
    ['DOC文件费', cnyLine(200, '票', 1, '1')],
    ['换单服务费', cnyLine(200, '票', 1, '1')],
    ['报关费', `${money(300)}（含5个品名）`],
    ['联单费', linkGroups ? `${money(50)}/6个品名 × ${linkGroups}组 = ${money(50 * linkGroups)}` : `${money(50)}/6个品名（本批未超出5个品名）`],
    ['查验服务费', cnyLine(300, '票', 1, '1')],
    ['CFS', cnyLine(150, 'RT', drt, drtStr)],
    ['THC', cnyLine(30, 'RT', drt, drtStr)],
    ['EBS', cnyLine(30, 'RT', drt, drtStr)],
    ['CAF', cnyLine(30, 'RT', drt, drtStr)],
    ['进出库费', cnyLine(100, 'RT', drt, drtStr)],
    ['理货费', cnyLine(100, '票', 1, '1')],
    ['上下车费', cnyLine(25, 'RT', drt, drtStr)],
    ['LSS', cnyLine(150, 'RT', drt, drtStr)],
    ['其他费用', money(otherFee)]
  ];
  return {freight: foreignUsdTotal * usdRate + domesticCnyTotal, international:foreignUsdTotal*usdRate,domestic:domesticCnyTotal-otherFee,other:0,otherCharges:otherFee,insurance:0,weight,cbm,rt,drt,ofRateUsd:30+ofSurcharge,breakdown};
}

