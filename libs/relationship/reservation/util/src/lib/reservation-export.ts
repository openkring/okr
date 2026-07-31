import { ReservationModel } from '@okr/shared-models';
import {
  ExportColumn,
  formatExportBoolean,
  formatExportDate,
  formatExportList,
  formatExportTime,
  getAvatarName,
  getPriceAmount,
  getPriceCurrency,
} from '@okr/shared-util-core';

import { ReservationI18n } from './reservation-i18n';

/**
 * Synchronous code → label lookups for the coded values on a reservation.
 * Built once per export via `I18nService.createLabelResolver`.
 */
export interface ReservationExportResolvers {
  state: (itemName?: string) => string;
  reason: (itemName?: string) => string;
}

/**
 * The CSV columns for a reservation list.
 *
 * The reserver and the resource columns follow the same rule as the list header: whichever
 * of the two the `listId` pins down is constant for every row and therefore dropped
 * (`r_<resourceKey>` / `t_<resourceType>` fix the resource, `p_<personKey>` / `o_<orgKey>` /
 * `my` fix the reserver).
 * @param listId the list filter, e.g. 'all', 'r_scs_default', 'my'
 * @param i18n the resolved translations of the reservation feature
 * @param resolve the category label resolvers
 */
export function getReservationExportColumns(
  listId: string,
  i18n: ReservationI18n,
  resolve: ReservationExportResolvers): ExportColumn<ReservationModel>[] {
  const columns: ExportColumn<ReservationModel>[] = [];
  if (!isReserverFixed(listId)) {
    columns.push({ header: i18n.export_reserver(), value: (r) => getAvatarName(r.reserver) });
  }
  if (!isResourceFixed(listId)) {
    columns.push({ header: i18n.export_resource(), value: (r) => getAvatarName(r.resource) });
  }
  columns.push(
    { header: i18n.export_name(),         value: (r) => r.name ?? '' },
    { header: i18n.export_startDate(),    value: (r) => formatExportDate(r.startDate) },
    { header: i18n.export_startTime(),    value: (r) => formatExportTime(r.startTime) },
    { header: i18n.export_fullDay(),      value: (r) => formatExportBoolean(r.fullDay, i18n.export_yes(), i18n.export_no()) },
    { header: i18n.export_duration(),     value: (r) => (r.durationMinutes ? String(r.durationMinutes) : '') },
    { header: i18n.export_endDate(),      value: (r) => formatExportDate(r.endDate) },
    { header: i18n.export_state(),        value: (r) => resolve.state(r.state) },
    { header: i18n.export_reason(),       value: (r) => resolve.reason(r.reason) },
    { header: i18n.export_participants(), value: (r) => r.participants ?? '' },
    { header: i18n.export_area(),         value: (r) => r.area ?? '' },
    { header: i18n.export_ref(),          value: (r) => r.ref ?? '' },
    { header: i18n.export_price(),        value: (r) => getPriceAmount(r.price) },
    { header: i18n.export_currency(),     value: (r) => getPriceCurrency(r.price) },
    { header: i18n.export_description(),  value: (r) => r.description ?? '' },
    { header: i18n.export_notes(),        value: (r) => r.notes ?? '' },
    { header: i18n.export_tags(),         value: (r) => formatExportList(r.tags) },
    { header: i18n.export_okey(),         value: (r) => r.okey ?? '' },
    { header: i18n.export_reserverKey(),  value: (r) => r.reserver?.key ?? '' },
    { header: i18n.export_resourceKey(),  value: (r) => r.resource?.key ?? '' },
  );
  return columns;
}

/** Whether the list filter pins the reserver, making a reserver column constant. */
export function isReserverFixed(listId: string): boolean {
  return listId === 'my' || listId.startsWith('p_') || listId.startsWith('o_');
}

/** Whether the list filter pins the resource (or its type), making a resource column constant. */
export function isResourceFixed(listId: string): boolean {
  return listId.startsWith('r_') || listId.startsWith('t_');
}

/**
 * The file-name stem (without date and extension) of a reservation export. A resource- or
 * reserver-scoped list appends its filter so two exports do not overwrite each other.
 */
export function getReservationExportFileName(listId: string): string {
  return listId && listId !== 'all' ? `reservationen-${listId}` : 'reservationen';
}
