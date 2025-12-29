import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

export type InvitationState = 'pending' | 'accepted' | 'declined' | 'maybe';
export type InvitationRole = 'required' | 'optional' | 'info';
export const DEFAULT_INVITATION_STATE: InvitationState = 'pending';
export const DEFAULT_INVITATION_ROLE: InvitationRole = 'info';

/**
 * An invitation of a person to a calendar event.
 *
 * Person    invited to       CalEvent
 */
export class InvitationModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
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
  sentAt = DEFAULT_DATE;
  respondedAt = DEFAULT_DATE;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvitationCollection = 'invitations';
export const InvitationModelName = 'invitation';