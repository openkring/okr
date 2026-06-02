import { Signal } from '@angular/core';

export const ACTIVITY_I18N_KEYS = {
  title:      '@activity/feature.title',
  empty:      '@activity/feature.empty',
  timestamp:  '@activity/feature.timestamp',
  scope:      '@activity/feature.scope',
  action:     '@activity/feature.action',
  author:     '@activity/feature.author',
  payload:    '@activity/feature.payload',
  view_title: '@activity/feature.view.title',
} satisfies Record<string, string>;

export type ActivityI18n = { [K in keyof typeof ACTIVITY_I18N_KEYS]: Signal<string> };
