import { OwnershipModel } from '@okr/shared-models';
import { ExportColumn, formatExportDate, formatExportList, getPriceAmount, getPriceCurrency } from '@okr/shared-util-core';

import { OwnershipI18n } from './ownership-i18n';

/**
 * The ownership lists that can be exported. Matches the `listId` route segment of
 * `OwnershipList` (`ownership/<listId>/<contextMenu>`).
 */
export type OwnershipExportList = 'all' | 'ownerships' | 'scsBoats' | 'privateBoats' | 'lockers' | 'keys';

/**
 * Synchronous code → label lookups for the coded values on an ownership.
 * Built once per export via `I18nService.createLabelResolver` / `createValueResolver`.
 */
export interface OwnershipExportResolvers {
  resourceType: (itemName?: string) => string;
  rboatType: (itemName?: string) => string;
  gender: (itemName?: string) => string;
  type: (itemName?: string) => string;
  state: (itemName?: string) => string;
}

/**
 * Older ownership documents store the price as a plain number next to a sibling `currency`
 * field, newer ones as a `MoneyModel`. Both shapes must survive an export, so read the
 * legacy fields explicitly rather than trusting the declared model type.
 */
type LegacyPriced = { price?: unknown; currency?: string };

function price(ownership: OwnershipModel): string {
  return getPriceAmount((ownership as LegacyPriced).price as number | undefined);
}

function currency(ownership: OwnershipModel): string {
  const legacy = ownership as LegacyPriced;
  return getPriceCurrency(legacy.price as number | undefined, legacy.currency ?? '');
}

/**
 * The CSV columns for an ownership list. Pure and data-driven so the per-list column choice
 * is unit-testable; the store supplies the translated labels and the resolvers.
 * @param listId which ownership list is being exported
 * @param i18n the resolved translations of the ownership feature
 * @param resolve the label resolvers
 */
export function getOwnershipExportColumns(
  listId: string,
  i18n: OwnershipI18n,
  resolve: OwnershipExportResolvers): ExportColumn<OwnershipModel>[] {
  const owner: ExportColumn<OwnershipModel>[] = [
    { header: i18n.export_ownerName1(), value: (o) => o.ownerName1 ?? '' },
    { header: i18n.export_ownerName2(), value: (o) => o.ownerName2 ?? '' },
  ];
  const period: ExportColumn<OwnershipModel>[] = [
    { header: i18n.export_type(),       value: (o) => resolve.type(o.type) },
    { header: i18n.export_state(),      value: (o) => resolve.state(o.state) },
    { header: i18n.export_validFrom(),  value: (o) => formatExportDate(o.validFrom) },
    { header: i18n.export_validTo(),    value: (o) => formatExportDate(o.validTo) },
  ];
  const money: ExportColumn<OwnershipModel>[] = [
    { header: i18n.export_price(),      value: price },
    { header: i18n.export_currency(),   value: currency },
  ];
  const notes: ExportColumn<OwnershipModel> = { header: i18n.export_notes(), value: (o) => o.notes ?? '' };
  const okey: ExportColumn<OwnershipModel>  = { header: i18n.export_okey(),  value: (o) => o.okey ?? '' };
  const keys: ExportColumn<OwnershipModel>[] = [
    okey,
    { header: i18n.export_ownerKey(),    value: (o) => o.ownerKey ?? '' },
    { header: i18n.export_resourceKey(), value: (o) => o.resourceKey ?? '' },
  ];

  switch (listId) {
    // Club-owned boats: the owner is always the club, so the owner columns are pure noise.
    case 'scsBoats':
      return [
        { header: i18n.export_boatName(),  value: (o) => o.resourceName ?? '' },
        { header: i18n.export_boatType(),  value: (o) => resolve.rboatType(o.resourceSubType) },
        ...period,
        { header: i18n.export_count(),     value: (o) => (o.count ? String(o.count) : '') },
        ...money,
        notes,
        okey,
        { header: i18n.export_resourceKey(), value: (o) => o.resourceKey ?? '' },
      ];
    case 'privateBoats':
      return [
        ...owner,
        { header: i18n.export_boatName(),  value: (o) => o.resourceName ?? '' },
        { header: i18n.export_boatType(),  value: (o) => resolve.rboatType(o.resourceSubType) },
        ...period,
        ...money,
        notes,
        ...keys,
      ];
    case 'lockers':
      return [
        ...owner,
        { header: i18n.export_lockerNr(),  value: (o) => o.resourceName ?? '' },
        { header: i18n.export_gender(),    value: (o) => resolve.gender(o.resourceSubType) },
        ...period,
        ...money,
        notes,
        ...keys,
      ];
    case 'keys':
      return [
        ...owner,
        { header: i18n.export_keyNr(),     value: (o) => o.resourceName ?? '' },
        { header: i18n.export_count(),     value: (o) => (o.count ? String(o.count) : '') },
        ...period,
        ...money,
        notes,
        ...keys,
      ];
    case 'all':
    case 'ownerships':
    default:
      return [
        ...owner,
        { header: i18n.export_ownerModelType(), value: (o) => o.ownerModelType ?? '' },
        { header: i18n.export_resourceName(),   value: (o) => o.resourceName ?? '' },
        { header: i18n.export_resourceType(),   value: (o) => resolve.resourceType(o.resourceType) },
        { header: i18n.export_subType(),        value: (o) => resolveResourceSubType(o, resolve) },
        ...period,
        { header: i18n.export_count(),          value: (o) => (o.count ? String(o.count) : '') },
        ...money,
        notes,
        { header: i18n.export_tags(),           value: (o) => formatExportList(o.tags) },
        ...keys,
      ];
  }
}

/**
 * `resourceSubType` is polymorphic — an rboat_type for boats, a gender for lockers, and an
 * uncategorised code for everything else.
 */
export function resolveResourceSubType(ownership: OwnershipModel, resolve: OwnershipExportResolvers): string {
  switch (ownership.resourceType) {
    case 'rboat':  return resolve.rboatType(ownership.resourceSubType);
    case 'locker': return resolve.gender(ownership.resourceSubType);
    default:       return ownership.resourceSubType ?? '';
  }
}

/** The file-name stem (without date and extension) of each ownership export. */
export function getOwnershipExportFileName(listId: string): string {
  switch (listId) {
    case 'scsBoats':     return 'clubboote';
    case 'privateBoats': return 'privatboote';
    case 'lockers':      return 'garderoben';
    case 'keys':         return 'schluessel';
    default:             return 'eigentum';
  }
}
