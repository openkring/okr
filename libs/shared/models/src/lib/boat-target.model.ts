import { DEFAULT_TENANTS } from '@okr/shared-constants';

/**
 * Target boat counts per year for the Bootseinteilung grid (rboat_usage × rboat_type), plus
 * the slot labels that feed the Bootsstrategie. One document per tenant, document id =
 * tenantId (like app-config).
 *
 * `targets` is a flat map because the grid is a sparse cross product; the key is
 * `${year}|${usage}|${type}` (see boatTargetKey in @okr/resource-util).
 */
export class BoatTargetModel {
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public targets: Record<string, number> = {};
  /** Label of a single empty slot; the key is `${year}|${usage}|${type}|${slotIndex}` (boatLabelKey). */
  public labels: Record<string, BoatSlotLabel> = {};
  /**
   * Bootsbeschaffungs-Budget per season, key = `${year}`. Sparse: a season without an entry
   * inherits the nearest earlier one (see getBoatBudget in @okr/resource-util), so a budget is
   * entered once and carries forward until it is changed.
   */
  public budgets: Record<string, number> = {};

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const BoatTargetCollection = 'boat-targets';

/**
 * A slot of the Bootseinteilung grid — free or occupied by a boat: a planning note with an
 * optional background. `color` is an Ionic color name (`success` = Beschaffung, `danger` =
 * Verkauf/Entsorgung); `BOAT_SLOT_NO_COLOR` leaves the cell background as it is.
 *
 * A slot flagged `isStrategyRelevant` becomes a line of the Bootsstrategie table for its year:
 * a purchase or a sale of `price` francs. A purchase carries its own funding — `swisslos`
 * percent of the price plus `donations` francs — which the strategy table sums per year.
 */
export class BoatSlotLabel {
  public text = '';
  public color: string = DEFAULT_BOAT_SLOT_COLOR;
  public isStrategyRelevant = false;
  public strategyType: BoatStrategyType = 'buy';
  public price = 0;
  /** share of `price` covered by Swisslos, in percent */
  public swisslos = DEFAULT_SWISSLOS_PERCENT;
  /** donations pledged towards `price`, in francs */
  public donations = 0;
}

export const BOAT_SLOT_NO_COLOR = 'none';
export const DEFAULT_BOAT_SLOT_COLOR = 'success';
/** Selectable backgrounds, in the order the picker offers them. */
export const BOAT_SLOT_COLORS = [
  'success', 'danger', 'warning', 'primary', 'secondary', 'tertiary', 'light', 'medium', 'dark', BOAT_SLOT_NO_COLOR,
] as const;

export type BoatStrategyType = 'buy' | 'sell';
export const BOAT_STRATEGY_TYPES = ['buy', 'sell'] as const satisfies readonly BoatStrategyType[];

export const DEFAULT_SWISSLOS_PERCENT = 20;
