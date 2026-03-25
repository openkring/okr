import { DEFAULT_DATE, DEFAULT_NAME, DEFAULT_RES_REASON, DEFAULT_TIME } from '@bk2/shared-constants';
import { AvatarInfo } from './avatar-info';

export class ReservationApplyModel {
  public name = DEFAULT_NAME;
  public reserver: AvatarInfo | undefined; // avatar for person or org
  public resource: AvatarInfo | undefined; // avatar for resource or account

  // event details
  public startDate = DEFAULT_DATE;
  public startTime = DEFAULT_TIME; // start time of the reservation
  public fullDay = false; // whether the reservation is a full-day event (affects durationMinutes and which fields are shown)
  public durationMinutes = 60; // duration of the event in minutes, 60, 120, 1440 = full day
  public endDate = DEFAULT_DATE;

  public participants = '';
  public area = '';
  public reason = DEFAULT_RES_REASON;
  public description = '';  // public notes

  public usesTent = false;
  public company = '';
  public isConfirmed = false;
}
