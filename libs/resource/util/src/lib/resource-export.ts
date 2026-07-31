import { ResourceModel } from '@okr/shared-models';
import { ExportColumn, formatExportList } from '@okr/shared-util-core';

import { ResourceI18n } from './resource-i18n';

/**
 * The resource lists that can be exported. `ResourceStore` backs four list components
 * (resource / rowing boat / locker / key) and its state does not tell them apart, so the
 * list passes its own type in.
 */
export type ResourceExportList = 'resource' | 'rboat' | 'locker' | 'key';

/**
 * Synchronous code → label lookups for the categories a resource row references.
 * Built once per export via `I18nService.createLabelResolver`.
 */
export interface ResourceExportResolvers {
  resourceType: (itemName?: string) => string;
  rboatType: (itemName?: string) => string;
  rboatUsage: (itemName?: string) => string;
  gender: (itemName?: string) => string;
}

/** A numeric field renders as an empty cell when it is unset — `0` is not a measurement. */
function num(value?: number): string {
  return value ? String(value) : '';
}

/**
 * The CSV columns for a resource list. Kept as data (and pure) so the column choice is
 * unit-testable and the store only has to supply the translated labels and the resolvers.
 * @param listType which of the four resource lists is being exported
 * @param i18n the resolved translations of the resource feature
 * @param resolve the category label resolvers
 */
export function getResourceExportColumns(
  listType: ResourceExportList,
  i18n: ResourceI18n,
  resolve: ResourceExportResolvers): ExportColumn<ResourceModel>[] {
  switch (listType) {
    case 'rboat':
      return [
        { header: i18n.export_name(),         value: (r) => r.name ?? '' },
        { header: i18n.export_boatType(),     value: (r) => resolve.rboatType(r.subType) },
        { header: i18n.export_usage(),        value: (r) => resolve.rboatUsage(r.usage) },
        { header: i18n.export_seats(),        value: (r) => num(r.seats) },
        { header: i18n.export_brand(),        value: (r) => r.brand ?? '' },
        { header: i18n.export_model(),        value: (r) => r.model ?? '' },
        { header: i18n.export_id(),           value: (r) => r.id ?? '' },
        { header: i18n.export_currentValue(), value: (r) => num(r.currentValue) },
        { header: i18n.export_weight(),       value: (r) => num(r.weight) },
        { header: i18n.export_load(),         value: (r) => r.load ?? '' },
        { header: i18n.export_length(),       value: (r) => num(r.length) },
        { header: i18n.export_width(),        value: (r) => num(r.width) },
        { header: i18n.export_color(),        value: (r) => r.color ?? '' },
        { header: i18n.export_description(),  value: (r) => r.description ?? '' },
        { header: i18n.export_tags(),         value: (r) => formatExportList(r.tags) },
        { header: i18n.export_okey(),         value: (r) => r.okey ?? '' },
      ];
    case 'locker':
      return [
        { header: i18n.export_lockerNr(),     value: (r) => r.name ?? '' },
        { header: i18n.export_gender(),       value: (r) => resolve.gender(r.subType) },
        { header: i18n.export_description(),  value: (r) => r.description ?? '' },
        { header: i18n.export_tags(),         value: (r) => formatExportList(r.tags) },
        { header: i18n.export_okey(),         value: (r) => r.okey ?? '' },
      ];
    case 'key':
      return [
        { header: i18n.export_keyNr(),        value: (r) => r.name ?? '' },
        { header: i18n.export_description(),  value: (r) => r.description ?? '' },
        { header: i18n.export_currentValue(), value: (r) => num(r.currentValue) },
        { header: i18n.export_tags(),         value: (r) => formatExportList(r.tags) },
        { header: i18n.export_okey(),         value: (r) => r.okey ?? '' },
      ];
    case 'resource':
    default:
      return [
        { header: i18n.export_name(),         value: (r) => r.name ?? '' },
        { header: i18n.export_type(),         value: (r) => resolve.resourceType(r.type) },
        // A resource list mixes types, so subType means a different category per row.
        { header: i18n.export_subType(),      value: (r) => resolveSubType(r, resolve) },
        { header: i18n.export_description(),  value: (r) => r.description ?? '' },
        { header: i18n.export_currentValue(), value: (r) => num(r.currentValue) },
        { header: i18n.export_brand(),        value: (r) => r.brand ?? '' },
        { header: i18n.export_model(),        value: (r) => r.model ?? '' },
        { header: i18n.export_id(),           value: (r) => r.id ?? '' },
        { header: i18n.export_color(),        value: (r) => r.color ?? '' },
        { header: i18n.export_tags(),         value: (r) => formatExportList(r.tags) },
        { header: i18n.export_okey(),         value: (r) => r.okey ?? '' },
      ];
  }
}

/**
 * `subType` is polymorphic: a rowing boat's is an rboat_type, a locker's a gender, and any
 * other type has no category behind it (exported as the raw code).
 */
export function resolveSubType(resource: ResourceModel, resolve: ResourceExportResolvers): string {
  switch (resource.type) {
    case 'rboat':  return resolve.rboatType(resource.subType);
    case 'locker': return resolve.gender(resource.subType);
    default:       return resource.subType ?? '';
  }
}

/** The file-name stem (without date and extension) of each resource export. */
export function getResourceExportFileName(listType: ResourceExportList): string {
  switch (listType) {
    case 'rboat':  return 'ruderboote';
    case 'locker': return 'garderoben';
    case 'key':    return 'schluessel';
    case 'resource':
    default:       return 'resourcen';
  }
}
