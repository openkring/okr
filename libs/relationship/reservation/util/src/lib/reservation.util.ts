import { ReservationApplyModel, ReservationModel, ResourceModel, UserModel } from '@bk2/shared-models';
import { addIndexElement, DateFormat, getAvatarInfo, getAvatarInfoForCurrentUser, getTodayStr, isType } from '@bk2/shared-util-core';

export function isReservation(reservation: unknown, tenantId: string): reservation is ReservationModel {
  return isType(reservation, new ReservationModel(tenantId));
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