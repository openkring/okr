import { DEFAULT_KEY, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel } from './base.model';

/**
 * One month of Energie Reporter figures. Empty source values are stored as null, never 0.
 * The consumption and production figures are 12-month totals that lag the snapshot, so they carry
 * their own period (`elecPeriod*`, `productionPeriod*`); the dates are StoreDate yyyymmdd.
 */
export interface EnergyMonth {
  date: string;                          // StoreDate of the snapshot month
  electricCarCount: number | null;
  electricCarShare: number | null;
  chargingSpotCount: number | null;
  solarKwp: number | null;
  solarPotentialUsage: number | null;
  renewableHeatingShare: number | null;
  renewableHeatingCount: number | null;
  nonRenewableHeatingCount: number | null;
  elecPeriodFrom: string | null;
  elecPeriodUntil: string | null;
  productionPeriodFrom: string | null;
  productionPeriodUntil: string | null;
  elecConsumptionMwh: number | null;
  elecConsumptionHouseholdsMwh: number | null;
  elecPerCapitaMwh: number | null;
  renewableProductionMwh: number | null;
  solarProductionMwh: number | null;
  hydroProductionMwh: number | null;
  windProductionMwh: number | null;
  biomassProductionMwh: number | null;
  wasteProductionMwh: number | null;
}

/** One ElCom tariff row (category H4, product standard), all values in Rp./kWh. A municipality can have several operators per year. */
export interface EnergyTariff {
  year: number;
  operatorName: string;
  total: number;
  energy: number;
  gridUsage: number;
  charge: number;
  aidFee: number;
}

// Municipal energy figures (spec 1.136): one document per municipality, shared by every tenant with a
// city location for that BFS number. Written ONLY by the scheduled job (Admin SDK); clients read it.
// `okey` is String(bfsNr); `tenants` is the union of the tenants of all city locations with that bfsNr.
export class EnergyFiguresModel implements OkrModel {
  public okey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public bfsNr = 0;
  public municipality = ''; // name as published by Energie Reporter
  public canton = '';
  public sourceDate = '';   // StoreDate of the latest Energie Reporter month
  public fetchedAt = '';    // ISO timestamp of the last successful write
  public months: EnergyMonth[] = [];   // oldest first
  public tariffs: EnergyTariff[] = []; // oldest first

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const EnergyFiguresCollection = 'energy-figures';
export const EnergyFiguresModelName = 'energyFigures';
