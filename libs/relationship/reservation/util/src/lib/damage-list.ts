import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import { AvatarInfo, ReservationModel } from '@okr/shared-models';
import { ExportColumn, formatExportDate, getAvatarName, getDayDiff, getTodayStr } from '@okr/shared-util-core';

import { ReservationI18n } from './reservation-i18n';
import { LOCK_REASONS } from './reservation.util';

/**
 * The Schadensliste is read from the reservations — there is no separate damage collection:
 * - 'maintenance': a damage report that locked the boat (Logbuch, «Boot sperren»)
 * - 'blocked':     a boat locked from the boat lists or the boat modal
 * - 'damage':      a damage report WITHOUT a lock; it never blocks (not in LOCK_REASONS) and is
 *                  closed on the day it was reported (newDamageRecord)
 * None of the three may be deleted — they are the history this list is made of.
 */
export const DAMAGE_REASON = 'damage';
export const DAMAGE_REASONS = [...LOCK_REASONS, DAMAGE_REASON];

/** Whether a reservation is part of the damage history (and therefore must not be deleted). */
export function isDamageReservation(reservation: ReservationModel): boolean {
  return DAMAGE_REASONS.includes(reservation.reason);
}

/**
 * A damage report without a lock, recorded as a reservation so the Schadensliste has one source.
 * Not blocking by construction: 'damage' is no lock reason, and the record is already completed.
 */
export function newDamageRecord(
  tenantId: string,
  boat: AvatarInfo,
  reporter: AvatarInfo | undefined,
  name: string,
  description: string,
): ReservationModel {
  const reservation = new ReservationModel(tenantId);
  const today = getTodayStr();
  reservation.name = name;
  reservation.reserver = reporter;
  reservation.resource = boat;
  reservation.reason = DAMAGE_REASON;
  reservation.description = description;
  reservation.state = 'completed';
  reservation.fullDay = true;
  reservation.durationMinutes = 1440;
  reservation.startDate = today;
  reservation.startTime = '';
  reservation.endDate = today;
  return reservation;
}

/** Whether the lock is still open (never ended): open-ended endDate and not completed/cancelled. */
export function isOpenLock(reservation: ReservationModel): boolean {
  return LOCK_REASONS.includes(reservation.reason) &&
    (reservation.state === 'active' || reservation.state === 'initial') &&
    (!reservation.endDate || reservation.endDate === END_FUTURE_DATE_STR);
}

/** The last day of the entry: today for an open lock, else its endDate (or startDate if none). */
export function getDamageEndDate(reservation: ReservationModel, today = getTodayStr()): string {
  if (isOpenLock(reservation)) return today;
  return reservation.endDate && reservation.endDate !== END_FUTURE_DATE_STR ? reservation.endDate : reservation.startDate;
}

/** Days the boat was out of service, both ends included; 0 for a damage without a lock. */
export function getLockedDays(reservation: ReservationModel, today = getTodayStr()): number {
  if (!LOCK_REASONS.includes(reservation.reason)) return 0;
  const days = getDayDiff(reservation.startDate, getDamageEndDate(reservation, today));
  return days < 0 ? 0 : days + 1;
}

/** Whether the entry touches the given year (a lock over New Year counts in both); year < 1000 = all. */
export function damageInYear(reservation: ReservationModel, year: number, today = getTodayStr()): boolean {
  if (!year || year < 1000) return true;
  const from = parseInt((reservation.startDate ?? '').substring(0, 4));
  const to = parseInt(getDamageEndDate(reservation, today).substring(0, 4));
  if (isNaN(from)) return true;
  return from <= year && year <= (isNaN(to) ? from : to);
}

/**
 * The rows of the Schadensliste: rowing-boat damages and locks, filtered by year and boat type
 * ('all' for every type), newest first.
 */
export function filterDamages(reservations: ReservationModel[], year: number, boatType: string, today = getTodayStr()): ReservationModel[] {
  return reservations
    .filter(r => isDamageReservation(r) && r.resource?.type === 'rboat')
    .filter(r => damageInYear(r, year, today))
    .filter(r => !boatType || boatType === 'all' || r.resource?.subType === boatType)
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
}

/** Label of the entry kind, from the reservation's reason. */
export function getDamageKindLabel(reservation: ReservationModel, i18n: ReservationI18n): string {
  switch (reservation.reason) {
    case 'maintenance': return i18n.damage_kind_maintenance();
    case 'blocked':     return i18n.damage_kind_blocked();
    default:            return i18n.damage_kind_damage();
  }
}

/**
 * The CSV columns of the Schadensliste. Includes the internal notes (who caused it, repair,
 * cost, insurance) — the list and its export are for privileged / resourceAdmin only.
 * @param boatType resolves the rboat_type code to its label
 */
export function getDamageExportColumns(i18n: ReservationI18n, boatType: (itemName?: string) => string, today = getTodayStr()): ExportColumn<ReservationModel>[] {
  return [
    { header: i18n.damage_boat(),        value: (r) => getAvatarName(r.resource) },
    { header: i18n.damage_boatType(),    value: (r) => boatType(r.resource?.subType) },
    { header: i18n.damage_kind(),        value: (r) => getDamageKindLabel(r, i18n) },
    { header: i18n.damage_from(),        value: (r) => formatExportDate(r.startDate) },
    { header: i18n.damage_to(),          value: (r) => isOpenLock(r) ? i18n.damage_open() : formatExportDate(getDamageEndDate(r, today)) },
    { header: i18n.damage_days(),        value: (r) => String(getLockedDays(r, today)) },
    { header: i18n.damage_reason(),      value: (r) => r.description ?? '' },
    { header: i18n.damage_reporter(),    value: (r) => getAvatarName(r.reserver) },
    { header: i18n.export_notes(),       value: (r) => r.notes ?? '' },
    { header: i18n.export_resourceKey(), value: (r) => r.resource?.key ?? '' },
    { header: i18n.export_okey(),        value: (r) => r.okey ?? '' },
  ];
}
