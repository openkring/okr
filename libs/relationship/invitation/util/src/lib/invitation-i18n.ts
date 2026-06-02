import { Signal } from '@angular/core';

const PFX = '@relationship/invitation/feature.';

export const INVITATION_I18N_KEYS = {
  invitations:                     PFX + 'invitations',
  date:                            '@date',
  name:                            '@name',
  invitee:                         PFX + 'invitee',
  inviter:                         PFX + 'inviter',
  state:                           PFX + 'state.label',
  empty:                           PFX + 'empty',
  delete_confirm:                  PFX + 'delete.confirm',
  invite_conf:                     PFX + 'invite.conf',
  invite_error:                    PFX + 'invite.error',
  as_title:                        PFX + 'actionsheet.title',
  as_accept:                       PFX + 'actionsheet.accept',
  as_decline:                      PFX + 'actionsheet.decline',
  as_maybe:                        PFX + 'actionsheet.maybe',
  as_view:                         PFX + 'actionsheet.view',
  as_edit:                         PFX + 'actionsheet.edit',
  as_create:                       PFX + 'actionsheet.create',
  as_delete:                       PFX + 'actionsheet.delete',
  ok:                              '@ok',
  cancel:                          '@cancel',
  save:                            '@save.label',
  bkey_label:                      PFX + 'bkey.label',
  bkey_placeholder:                PFX + 'bkey.placeholder',
  bkey_helper:                     PFX + 'bkey.helper',
  notes_label:                     PFX + 'notes.label',
  notes_placeholder:               PFX + 'notes.placeholder',
  sentAt_label:                    PFX + 'sentAt.label',
  sentAt_placeholder:              PFX + 'sentAt.placeholder',
  sentAt_helper:                   PFX + 'sentAt.helper',
  respondedAt_label:               PFX + 'respondedAt.label',
  respondedAt_placeholder:         PFX + 'respondedAt.placeholder',
  respondedAt_helper:              PFX + 'respondedAt.helper',
  state_label:                     PFX + 'state.label',
  role_label:                      PFX + 'role.label',
} satisfies Record<string, string>;

export type InvitationI18n = { [K in keyof typeof INVITATION_I18N_KEYS]: Signal<string> };
