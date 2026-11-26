import { DEFAULT_DATE, DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { AvatarInfo } from './avatar-info';
import { OkrModel, SearchableModel } from './base.model';

/**
 * Vollmacht (spec 1.180): a directed, explicit permission from one person (grantor) to another (grantee).
 * A Vollmacht belongs to exactly one tenant (`tenants` = `[tenantId]`) and is never hard-deleted by the
 * client: revoking sets `revokedAt`. Expiry is computed on read (`validTo` is inclusive).
 *
 * ACHTUNG beim Lesen: Firestore liefert rohe Dokumente — spaetere Felder beim Lesen coalescen.
 */
export type MandateKind = 'family' | 'proxy';
export type MandateAction = 'calevent.attend' | 'invitation.answer' | 'meeting.represent';

export class MandateModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY; // unique key of the model in the database
  public tenants: string[] = DEFAULT_TENANTS; // exactly [tenantId]; a Vollmacht never spans tenants
  public isArchived = false;
  public index = DEFAULT_INDEX; // for search
  public notes = DEFAULT_NOTES;

  public kind: MandateKind = 'family';
  public grantorKey = ''; // personKey of who gives the Vollmacht
  public grantor: AvatarInfo | undefined; // display avatar of the grantor
  public granteeKey = ''; // personKey of who receives the Vollmacht
  public grantee: AvatarInfo | undefined; // display avatar of the grantee
  public actions: MandateAction[] = []; // family: subset of calevent.attend, invitation.answer; proxy: ['meeting.represent']

  public validFrom = DEFAULT_DATE; // StoreDate; '' = from now
  public validTo = DEFAULT_DATE; // StoreDate, inclusive; '' = until revoked
  public meetingKey = ''; // proxy only: the one meeting it is for

  public createdByKey = ''; // personKey of who created it (grantor, or an admin for a minor)
  public revokedAt = DEFAULT_DATETIME; // StoreDateTime; '' = not revoked
  public revokedByKey = ''; // personKey of grantor, grantee (gives it back) or admin

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const MandateCollection = 'mandates'; // collection name for MandateModel
export const MandateModelName = 'mandate';
