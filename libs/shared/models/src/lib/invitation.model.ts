import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TAGS, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { AVATAR_INFO_SHAPE, AvatarInfo } from './avatar-info';
import { BkModel, SearchableModel, TaggedModel } from './base.model';

/**
 * An invitation of a person to a calendar event.
 *
 * Person    invited to       CalEvent
 */
export class InvitationModel implements BkModel, SearchableModel, TaggedModel {
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public notes = DEFAULT_NOTES;

  public invitee: AvatarInfo = AVATAR_INFO_SHAPE;
  public inviter: AvatarInfo = AVATAR_INFO_SHAPE; 
  public caleventId = '';
  state: 'pending' | 'accepted' | 'declined' | 'maybe' = 'pending';
  role: 'required' | 'optional' | 'info' = 'info';
  sentAt = DEFAULT_DATE;
  respondedAt = DEFAULT_DATE;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const InvitationCollection = 'invitations';
export const InvitationModelName = 'invitation';