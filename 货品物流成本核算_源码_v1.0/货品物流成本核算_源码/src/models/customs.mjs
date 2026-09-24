import {isoNow} from './product.mjs';

const optionalRate = value => value === '' || value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null;

export function createCustomsRateSnapshot(input = {}) {
  return {
    hsCode: String(input.hsCode ?? ''),
    productName: String(input.productName ?? ''),
    originCountry: String(input.originCountry ?? 'Japan'),
    destinationCountry: String(input.destinationCountry ?? 'China'),
    mfnRate: optionalRate(input.mfnRate),
    provisionalRate: optionalRate(input.provisionalRate),
    agreementRate: optionalRate(input.agreementRate),
    effectiveDutyRate: optionalRate(input.effectiveDutyRate),
    vatRate: optionalRate(input.vatRate),
    consumptionTaxRate: optionalRate(input.consumptionTaxRate),
    antiDumpingRate: optionalRate(input.antiDumpingRate),
    countervailingRate: optionalRate(input.countervailingRate),
    safeguardRate: optionalRate(input.safeguardRate),
    regulatoryConditions: String(input.regulatoryConditions ?? ''),
    effectiveDate: String(input.effectiveDate ?? ''),
    source: String(input.source ?? 'Manual'),
    sourceReference: String(input.sourceReference ?? ''),
    queriedAt: input.queriedAt ? String(input.queriedAt) : isoNow(),
    confirmedByUser: Boolean(input.confirmedByUser)
  };
}
