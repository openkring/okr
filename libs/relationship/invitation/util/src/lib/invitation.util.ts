import { AvatarInfo, InvitationModel } from '@bk2/shared-models';
import { addIndexElement, isType } from '@bk2/shared-util-core';

export function isInvitation(invitation: unknown, tenantId: string): invitation is InvitationModel {
  return isType(invitation, new InvitationModel(tenantId));
}

export function createPersonAvatar(key: string, name1: string, name2: string): AvatarInfo {
  return {
    key,
    name1,
    name2,
    modelType: 'person',
    type: '',
    subType: '',
    label: `${name1} ${name2}`.trim(),
  } as AvatarInfo;
}

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given organization based on its values.
   * @param org the organization to generate the index for 
   * @returns the index string
   */
export function getInvitationIndex(invitation: InvitationModel): string {
  let _index = '';
  _index = addIndexElement(_index, 'd', invitation.date);
  _index = addIndexElement(_index, 'ir', invitation.inviterFirstName + ' ' + invitation.inviterLastName);
  _index = addIndexElement(_index, 'ie', invitation.inviteeFirstName + ' ' + invitation.inviteeLastName);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getInvitationIndexInfo(): string {
  return 'd:<date> ir:<inviter name> ie:<invitee name>';
}
