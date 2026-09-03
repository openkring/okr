import { ReservationApplyModel, ReservationModel, ResourceModel, UserModel } from '@okr/shared-models';
import { addIndexElement, DateFormat, getAvatarInfo, getAvatarInfoForCurrentUser, getTodayStr, isAfterDate, isAfterOrEqualDate, isType } from '@okr/shared-util-core';

export function isReservation(reservation: unknown, tenantId: string): reservation is ReservationModel {
  return isType(reservation, new ReservationModel(tenantId));
}

/** State keys for reservations that are still "open" (not completed/cancelled/denied). */
export const OPEN_RESERVATION_STATES = ['initial', 'applied', 'active'];

/**
 * A reservation is "open" when it is in a non-terminal state (initial/applied/active)
 * and has not yet ended (endDate is today or later, incl. the open-ended sentinel).
 * Only open reservations can still be cancelled by their reserver.
 */
export function isReservationOpen(reservation: ReservationModel): boolean {
  return OPEN_RESERVATION_STATES.includes(reservation.state) && isAfterOrEqualDate(reservation.endDate, getTodayStr());
}

/**
 * Whether a reservation blocks its resource *right now*: it is in a non-terminal state, has
 * already started, and has not yet ended. `isReservationOpen` is not enough for this — it
 * ignores startDate, so a reservation booked for next month would already count as open.
 * `isAfterDate` returns false for an unparsable/empty startDate, so a reservation without a
 * start date counts as already started.
 */
export function isReservationActiveNow(reservation: ReservationModel, today = getTodayStr()): boolean {
  if (!OPEN_RESERVATION_STATES.includes(reservation.state)) return false;
  if (!isAfterOrEqualDate(reservation.endDate, today)) return false;
  return !isAfterDate(reservation.startDate, today);
}

/**
 * The reservation that currently blocks this resource, if any — the reservation counterpart of
 * `findOpenTripForBoat`. Pure and in-memory: callers pass the already-loaded reservation list.
 */
export function findActiveReservationForResource(
  reservations: ReservationModel[],
  resourceKey: string,
  today = getTodayStr(),
): ReservationModel | undefined {
  if (!resourceKey) return undefined;
  return reservations.find(reservation =>
    reservation.resource?.key === resourceKey && isReservationActiveNow(reservation, today));
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given person based on its values.
 * @param person the person for which to create the index
 * @returns the index string
 */
export function getReservationIndex(reservation: ReservationModel): string {
  let index = '';
  const reserver = reservation.reserver;
  if (reserver) {
    index = addIndexElement(index, 'rn', reserver.name1 + ' ' + reserver.name2);
    index = addIndexElement(index, 'rk', reserver.key);
  }
  const resource = reservation.resource;
  if (resource) {
    index = addIndexElement(index, 'resn', resource.name1 + ' ' + resource.name2);
    index = addIndexElement(index, 'resk', resource.key);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getReservationIndexInfo(): string {
  return 'rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ';
}


export function getNewReservationApply(currentUser?: UserModel, resource?: ResourceModel): ReservationApplyModel | undefined {
  if (!currentUser || !resource) {
    console.error('ReservationUtil.getNewReservationApply: person and resource are mandatory.');
  } else {
    const ram = new ReservationApplyModel();
    ram.reserver = getAvatarInfoForCurrentUser(currentUser);
    ram.resource = getAvatarInfo(resource, 'resource');
    return ram;
  }
}

export function convertApplyToReservation(apply: ReservationApplyModel | undefined, tenantId: string): ReservationModel | undefined {
  if (!apply) return undefined;
  const rm = new ReservationModel(tenantId);
  rm.name = apply.name;
  rm.reserver = apply.reserver;
  rm.resource = apply.resource;
  rm.startDate = apply.startDate;
  rm.startTime = apply.startTime;
  rm.fullDay = apply.fullDay;
  rm.durationMinutes = apply.durationMinutes;
  rm.endDate = apply.endDate;
  rm.participants = apply.participants;
  rm.area = apply.area;
  rm.reason = apply.reason;
  rm.description = [
    apply.description,
    `-------------${apply.reserver?.name1} ${apply.reserver?.name1}/${getTodayStr(DateFormat.ViewDateTime)}`,
    `             Zelt:      ${apply.usesTent}`,
    `             Firma:     ${apply.company}`,
    `             Bestätigt: ${apply.isConfirmed}`
  ].join('\n');
  return rm;
}