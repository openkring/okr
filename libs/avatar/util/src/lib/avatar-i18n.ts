import { Signal } from '@angular/core';

const PFX = '@avatar/data-access.';

export const AVATAR_I18N_KEYS = {
  choice_confirm: PFX + 'choice.confirm',
  choice_label: PFX + 'choice.label',
  choice_select: PFX + 'choice.select',
} satisfies Record<string, string>;

export type AvatarI18n = { [K in keyof typeof AVATAR_I18N_KEYS]: Signal<string> };
