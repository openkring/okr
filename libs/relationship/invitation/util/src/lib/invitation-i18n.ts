import { Signal } from '@angular/core';

const PFX = '@relationship/invitation/feature.';

export const INVITATION_I18N_KEYS = {
  invitation:                       PFX + 'invitation',
  invitations:                      PFX + 'invitations',
  empty:                            PFX + 'empty',

  delete:                           PFX + 'delete.label',
  delete_confirm:                   PFX + 'delete.confirm',
  delete_conf:                      PFX + 'delete.conf',
  delete_error:                     PFX + 'delete.error',

  invite:                           PFX + 'invite.label',
  invite_conf:                      PFX + 'invite.conf',
  invite_error:                     PFX + 'invite.error',

  update:                           PFX + 'update.label',
  update_conf:                      PFX + 'update.conf',
  update_error:                     PFX + 'update.error',

  view:                             PFX + 'view.label',

  accept:                           PFX + 'accept',
  accepted:                         PFX + 'accepted',
  decline:                          PFX + 'decline',
  maybe:                            PFX + 'maybe',
  resend:                           PFX + 'resend',
  subscribe:                        PFX + 'subscribe',
  unsubscribe:                      PFX + 'unsubscribe',

  list_header_date:                 PFX + 'list.header.date',
  list_header_name:                 PFX + 'list.header.name',
  list_header_invitee:              PFX + 'list.header.invitee',
  list_header_inviter:              PFX + 'list.header.inviter',
  list_header_state:                PFX + 'list.header.state',

  bkey_label:                       PFX + 'bkey.label',
  bkey_placeholder:                 PFX + 'bkey.placeholder',
  bkey_helper:                      PFX + 'bkey.helper',

  invitee:                          PFX + 'invitee',
  inviter:                          PFX + 'inviter',

  notes_label:                      PFX + 'notes.label',
  notes_placeholder:                PFX + 'notes.placeholder',

  sentAt_label:                     PFX + 'sentAt.label',
  sentAt_placeholder:               PFX + 'sentAt.placeholder',
  sentAt_helper:                    PFX + 'sentAt.helper',

  respondedAt_label:                PFX + 'respondedAt.label',
  respondedAt_placeholder:          PFX + 'respondedAt.placeholder',
  respondedAt_helper:               PFX + 'respondedAt.helper',

  role_label:                       PFX + 'role.label',

  // state: explicit
  state:                            PFX + 'invitation_state.label',
  state_pending_label:              PFX + 'invitation_state.pending.label',
  state_accepted_label:             PFX + 'invitation_state.accepted.label',
  state_maybe_label:                PFX + 'invitation_state.maybe.label',
  state_declined_label:             PFX + 'invitation_state.declined.label',

  date:                            '@date',
  name:                            '@name.label',
  as_title:                        '@actionsheet.title',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label'
} satisfies Record<string, string>;

export type InvitationI18n = { [K in keyof typeof INVITATION_I18N_KEYS]: Signal<string> };
