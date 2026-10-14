import { AssetModel, AssetMovementModel } from '@okr/shared-models';

import { linearDepreciationMonthly } from './asset.util';

/**
 * Yearly depreciation run (spec 1.103) — the pure part, shared by the «Abschreibungen» screen
 * (preview) and the `postDepreciation` function (booking). Linear method; amounts in minor units;
 * dates StoreDates (yyyymmdd). A month of service counts in full from the commissioning month, the
 * same convention as `proRataMonths`.
 */

/** Inclusive date range of a fiscal year. */
export interface DateRange { from: string; to: string }

/** One booking per books and fiscal year: its key makes a second run of that year impossible. */
export function depreciationBookingKey(accountingTenantId: string, fiscalYear: number): string {
  return `depreciation-${accountingTenantId}-${fiscalYear}`;
}

/** The movement of one asset's share in a run. */
export function depreciationMovementKey(bookingKey: string, assetKey: string): string {
  return `${bookingKey}-${assetKey}`;
}

function monthIndex(date: string): number {
  return Number(date.substring(0, 4)) * 12 + Number(date.substring(4, 6)) - 1;
}

/** Where the depreciation starts: commissioning, else acquisition ('' = never). */
function serviceStart(asset: AssetModel): string {
  const start = asset.commissioningDate || asset.acquisitionDate || '';
  return /^\d{8}$/.test(start) ? start : '';
}

/**
 * The depreciation of one asset in one fiscal year, given what was written off before the year:
 * only the months of the year, at most the remaining useful life, at most the remaining book value —
 * and the full remaining book value in the year the useful life ends (rounding remainder).
 */
export function depreciationForYear(asset: AssetModel, year: DateRange, depreciatedBefore: number): number {
  const acquisition = asset.acquisitionValue?.amount ?? 0;
  const life = asset.usefulLifeMonths ?? 0;
  const start = serviceStart(asset);
  const remainingValue = Math.max(0, acquisition - depreciatedBefore);
  if (!start || life <= 0 || remainingValue === 0 || start > year.to) return 0;

  const servedBefore = Math.max(0, monthIndex(year.from) - monthIndex(start));
  const remainingLife = Math.max(0, life - servedBefore);
  const monthsInYear = Math.max(0, monthIndex(year.to) - Math.max(monthIndex(start), monthIndex(year.from)) + 1);
  const months = Math.min(monthsInYear, remainingLife);
  if (months === 0) return 0;
  if (months === remainingLife) return remainingValue;   // the useful life ends this year
  return Math.min(linearDepreciationMonthly(acquisition, life) * months, remainingValue);
}

export interface DepreciationPlanRow {
  assetKey: string;
  assetNo: string;
  name: string;
  expenseAccountKey: string;
  balanceAccountKey: string;
  costCenter: string;
  bookValueStart: number;
  /** the year's depreciation: the booked amount once booked, else the computed one */
  amount: number;
  bookValueEnd: number;
  /** booked in this year's run; undefined while open */
  booked?: number;
  bookingKey?: string;
}

const WRITE_DOWNS: AssetMovementModel['movementType'][] = ['depreciation', 'extra_depreciation'];

/**
 * The run of one fiscal year: per asset in service, its book value at the start (acquisition value −
 * depreciation and extra write-downs before the year), the year's depreciation and whether it is booked.
 * Assets disposed before the year and assets with nothing to write off are left out.
 */
export function depreciationPlan(assets: AssetModel[], movements: AssetMovementModel[], year: DateRange): DepreciationPlanRow[] {
  const rows: DepreciationPlanRow[] = [];
  for (const asset of assets) {
    if (asset.isArchived) continue;
    const own = movements.filter(m => m.assetKey === asset.okey && m.isArchived !== true);
    if (own.some(m => m.movementType === 'full_disposal' && (m.date ?? '') < year.from)) continue;
    const before = own
      .filter(m => WRITE_DOWNS.includes(m.movementType) && (m.date ?? '') < year.from)
      .reduce((s, m) => s + (m.amount?.amount ?? 0), 0);
    const inYear = own.filter(m => m.movementType === 'depreciation' && (m.date ?? '') >= year.from && (m.date ?? '') <= year.to);
    const booked = inYear.length > 0 ? inYear.reduce((s, m) => s + (m.amount?.amount ?? 0), 0) : undefined;
    const amount = booked ?? depreciationForYear(asset, year, before);
    if (amount <= 0 && booked === undefined) continue;
    const bookValueStart = Math.max(0, (asset.acquisitionValue?.amount ?? 0) - before);
    rows.push({
      assetKey: asset.okey, assetNo: asset.assetNo ?? '', name: asset.name ?? '',
      expenseAccountKey: asset.expenseAccountKey ?? '', balanceAccountKey: asset.balanceAccountKey ?? '',
      costCenter: asset.costCenter ?? '',
      bookValueStart, amount, bookValueEnd: bookValueStart - amount,
      ...(booked !== undefined ? { booked, bookingKey: inYear[0].bookingKey } : {}),
    });
  }
  return rows.sort((a, b) => a.assetNo.localeCompare(b.assetNo) || a.name.localeCompare(b.name));
}
