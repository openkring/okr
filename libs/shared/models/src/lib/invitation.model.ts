import { DEFAULT_DATETIME, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@okr/shared-constants';

import { OkrModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * The answer to an invitation. Binary plus «not yet»: 'maybe' was removed on 2026-09-14 because no
 * user-facing path ever offered it — the action sheets, the invitations section and the schedule
 * poll all cycle pending -> accepted -> declined, and only the admin edit form could set it.
 *
 * Legacy documents may still carry 'maybe'. They are read as unanswered (`toAttendeeState` in
 * calevent-util folds every non-answer into 'invited'), and the comment key
 * `@relationship/invitation/feature.comment.maybe` stays in the i18n bundles so that old answer
 * comments keep rendering.
 */
export type InvitationState = 'pending' | 'accepted' | 'declined';
export type InvitationRole = 'required' | 'optional' | 'info';
export const DEFAULT_INVITATION_STATE: InvitationState = 'pending';
export const DEFAULT_INVITATION_ROLE: InvitationRole = 'info';

/**
 * An invitation of a person to a calendar event.
 *
 * Person    invited to       CalEvent
 */
export class InvitationModel implements OkrModel, NamedModel, SearchableModel, TaggedModel {
  public okey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  // invitee
  public inviteeKey = '';
  public inviteeFirstName = '';
  public inviteeLastName = '';
  // inviter
  public inviterKey = '';
  public inviterFirstName = '';
  public inviterLastName = '';
  // calendar event
  public caleventKey = '';
  public name = '';
  public date = '';

  // invitation details
  state: InvitationState = DEFAULT_INVITATION_STATE;
  role: InvitationRole = DEFAULT_INVITATION_ROLE;

  /** StoreDateTime (yyyyMMddHHmmss) the invitation was sent at. */
  sentAt = DEFAULT_DATETIME;

  /**
   * StoreDateTime (yyyyMMddHHmmss) of the LAST response — every answer overwrites it.
   * The full answer history is not kept here: each response is appended as a CommentModel on
   * `invitation.<okey>`, so the invitee's earlier answers stay readable in the comments card.
   *
   * Legacy documents still hold an 8-char StoreDate; read it with
   * `convertDateFromAnyFormatToString` / `prettyFormatDateTime`, never by slicing a fixed width.
   */
  respondedAt = DEFAULT_DATETIME;

  /**
   * A locked invitation may no longer be answered or edited by the invitee: the organiser has
   * frozen the responses (see the lock/unlock action on the calevent). Locking is per invitation,
   * but always applied to every invitation of one calevent at once.
   */
  isLocked = false;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvitationCollection = 'invitations';
export const InvitationModelName = 'invitation';