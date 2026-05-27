export function linearDepreciationMonthly(acquisitionCents: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return Math.floor(acquisitionCents / usefulLifeMonths);
}

/**
 * Counts calendar months from commissioningStoreDate (YYYYMMDD) to periodEndStoreDate (inclusive).
 * Returns 0 if commissioned after period end.
 */
export function proRataMonths(commissioningStoreDate: string, periodEndStoreDate: string): number {
  if (commissioningStoreDate > periodEndStoreDate) return 0;
  const cy = parseInt(commissioningStoreDate.substring(0, 4), 10);
  const cm = parseInt(commissioningStoreDate.substring(4, 6), 10);
  const ey = parseInt(periodEndStoreDate.substring(0, 4), 10);
  const em = parseInt(periodEndStoreDate.substring(4, 6), 10);
  return (ey - cy) * 12 + (em - cm) + 1;
}

export function computeBookValue(acquisitionCents: number, monthlyDepreciationCents: number, monthsElapsed: number): number {
  const accumulated = monthlyDepreciationCents * monthsElapsed;
  return Math.max(0, acquisitionCents - accumulated);
}
