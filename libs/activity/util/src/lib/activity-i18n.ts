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
  stats_title:  '@activity/feature.stats.title',
  stats_users:  '@activity/feature.stats.users',
  stats_logins: '@activity/feature.stats.logins',
  stats_errors: '@activity/feature.stats.errors',
  stats_usage:  '@activity/feature.stats.usage',
} satisfies Record<string, string>;

export type ActivityI18n = { [K in keyof typeof ACTIVITY_I18N_KEYS]: Signal<string> };
