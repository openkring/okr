import { AvatarInfo, InvitationModel, InvitationState } from '@okr/shared-models';
import { STORE_DATE_LENGTH } from '@okr/shared-constants';
import { addIndexElement, isType } from '@okr/shared-util-core';

export function isInvitation(invitation: unknown, tenantId: string): invitation is InvitationModel {
  if (isType<InvitationModel>(invitation, new InvitationModel(tenantId))) {
    if (invitation.tenants) {
      return invitation.tenants.includes(tenantId);
    }
  }
  return false;
}

export function createPersonAvatar(key: string, name1: string, name2: string): AvatarInfo {
  return {
    key,
    name1,
    name2,
    modelType: 'person',
    type: '',
    subType: '',
    label: `${name1.trim()} ${name2.trim()}`.trim(),
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
  _index = addIndexElement(_index, 'i', `${invitation.inviteeFirstName} ${invitation.inviteeLastName}`.trim());
  _index = addIndexElement(_index, 'd', invitation.date);
  _index = addIndexElement(_index, 'n', invitation.name);
  return _index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getInvitationIndexInfo(): string {
  return 'i:<invitee name> d:<date> n:<event name>';
}

  /*-------------------------- responses --------------------------------*/
/**
 * i18n key of the comment written when an invitee answers. The comment lives in the
 * `@relationship/invitation/feature` scope so it shares the bundle with the state labels;
 * CommentsList resolves the leading '@' at render time, so the stored value stays
 * language-neutral.
 */
export function getResponseCommentKey(state: InvitationState): string {
  return `@relationship/invitation/feature.comment.${state}`;
}

/** The comment written when the organiser locks (or releases) an event's invitations. */
export function getLockCommentKey(isLocked: boolean): string {
  return `@relationship/invitation/feature.comment.${isLocked ? 'locked' : 'unlocked'}`;
}

/**
 * A response comment carries the i18n key plus, when the invitee typed one, their free-text note.
 * Both halves stay in one description so the comments card needs no extra field.
 */
export function getResponseComment(state: InvitationState, note?: string): string {
  const key = getResponseCommentKey(state);
  const trimmed = (note ?? '').trim();
  return trimmed.length > 0 ? `${key} ${trimmed}` : key;
}

  /*-------------------------- ordering --------------------------------*/
/**
 * Accordion order: answered invitations first, oldest response first, so the list reads as the
 * chronology in which people replied. Unanswered (pending, or answered before `respondedAt`
 * existed) rows follow, sorted by invitee name so they stay stable between renders.
 *
 * Legacy 8-char StoreDate values sort correctly against 14-char StoreDateTime ones: both are
 * zero-padded, big-endian and share the yyyyMMdd prefix.
 */
export function sortInvitees(invitations: InvitationModel[]): InvitationModel[] {
  const answered = invitations.filter(inv => hasResponded(inv));
  const open = invitations.filter(inv => !hasResponded(inv));
  answered.sort((a, b) => a.respondedAt.localeCompare(b.respondedAt));
  open.sort((a, b) => inviteeName(a).localeCompare(inviteeName(b)));
  return [...answered, ...open];
}

/** An invitation counts as answered once it left 'pending' AND carries a response timestamp. */
export function hasResponded(invitation: InvitationModel): boolean {
  return invitation.state !== 'pending' && !!invitation.respondedAt;
}

function inviteeName(invitation: InvitationModel): string {
  return `${invitation.inviteeLastName} ${invitation.inviteeFirstName}`.trim().toLowerCase();
}

  /*-------------------------- legacy migration --------------------------------*/
/**
 * Upgrade one legacy timestamp: an 8-char StoreDate written before sentAt/respondedAt became
 * StoreDateTime is padded with midnight, everything else is returned unchanged. Firestore reads
 * bypass the model defaults, so an absent field arrives as `undefined` and must degrade to ''.
 */
export function toStoreDateTime(value: string | undefined): string {
  if (!value) return '';
  return value.length === STORE_DATE_LENGTH ? `${value}000000` : value;
}

/**
 * Bring an invitation read from Firestore up to the current model: legacy StoreDate timestamps
 * become StoreDateTime and a missing `isLocked` becomes false. Without this, the edit form would
 * reject a legacy document as invalid (dateTimeValidations enforces 14 characters) and no longer
 * be saveable.
 */
export function normaliseInvitation<T extends InvitationModel>(invitation: T | undefined): T | undefined {
  if (!invitation) return undefined;
  return {
    ...invitation,
    sentAt: toStoreDateTime(invitation.sentAt),
    respondedAt: toStoreDateTime(invitation.respondedAt),
    isLocked: invitation.isLocked ?? false,
  };
}
