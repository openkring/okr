import { Signal } from '@angular/core';

const PFX = '@cms/section/feature.';

// ---------------------------------------------------------------------------
// activities-section.store
// ---------------------------------------------------------------------------

export const ACTIVITIES_SECTION_I18N_KEYS = {
  empty: PFX + 'activity.empty',
  more:  '@more',
} satisfies Record<string, string>;

export type ActivitiesSectionI18n = { [K in keyof typeof ACTIVITIES_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// album-section.store
// ---------------------------------------------------------------------------

export const ALBUM_SECTION_I18N_KEYS = {
  no_images:         PFX + 'noImages',
  zoomed:            PFX + 'album.zoomed',
  album_style_label:  PFX + 'album.style.label',
} satisfies Record<string, string>;

export type AlbumSectionI18n = { [K in keyof typeof ALBUM_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// calendar-section.store
// ---------------------------------------------------------------------------

export const CALENDAR_SECTION_I18N_KEYS = {
  calevents:                  PFX + 'calendar.calevents',
  update_calevent_conf:       PFX + 'calendar.update.conf',
  update_calevent_error:      PFX + 'calendar.update.error',
  update_invitation_conf:     PFX + 'invitation.update.conf',
  update_invitation_error:    PFX + 'invitation.update.error',
  more:                       '@more',
  subscribe:                  PFX + 'calendar.subscribe',
  unsubscribe:                PFX + 'calendar.unsubscribe',
  edit:                       PFX + 'calendar.edit',
  view:                       PFX + 'calendar.view',
  download:                   PFX + 'calendar.download',
  empty:                      PFX + 'events.empty',
  cancel:                     '@cancel',
} satisfies Record<string, string>;

export type CalendarSectionI18n = { [K in keyof typeof CALENDAR_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// context-section (FormSectionStore)
// ---------------------------------------------------------------------------

export const CONTEXT_SECTION_I18N_KEYS = {
  title:                  PFX + 'context.title',
  as_title:               '@actionsheet.title',
  show_avatar:            PFX + 'context.show.avatar',
  show_name:              PFX + 'context.show.name',
  show_member:            PFX + 'context.show.member',
  show_membership:        PFX + 'context.show.membership',
  show_responsibility:    PFX + 'context.show.responsibility',
  show_personal:          PFX + 'context.show.personal',
  show_workrel:           PFX + 'context.show.workrel',
  save:                   PFX + 'context.save',
  edit:                   PFX + 'context.edit',
  center:                 PFX + 'context.center',
  displayConfig:          PFX + 'context.displayConfig',
  cancel:                 '@cancel',
  ok:                     '@ok',
} satisfies Record<string, string>;

export type ContextSectionI18n = { [K in keyof typeof CONTEXT_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// form-section (FormSectionStore)
// ---------------------------------------------------------------------------

export const FORMS_SECTION_I18N_KEYS = {
  submit:       PFX + 'form.submit.label',
  submit_conf:  PFX + 'form.submit.conf',
  submit_error: PFX + 'form.submit.error',
  not_found:    PFX + 'form.not_found',
  archived:     PFX + 'form.archived',
} satisfies Record<string, string>;

export type FormsSectionI18n = { [K in keyof typeof FORMS_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// invitations-section.store
// ---------------------------------------------------------------------------

export const INVITATION_STORE_I18N_KEYS = {
  subscribe:   PFX + 'invitation.subscribe',
  unsubscribe: PFX + 'invitation.unsubscribe',
  as_title:    '@actionsheet.title',
  more:        '@more',
  cancel:      '@cancel',
} satisfies Record<string, string>;

export type InvitationStoreI18n = { [K in keyof typeof INVITATION_STORE_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// member-age-section.store
// ---------------------------------------------------------------------------

export const MEMBER_AGE_SECTION_I18N_KEYS = {
  ageGroup: PFX + 'member.age.group',
  male:     PFX + 'member.age.male',
  female:   PFX + 'member.age.female',
  total:    PFX + 'member.age.total',
  empty:    PFX + 'member.age.empty',
} satisfies Record<string, string>;

export type MemberAgeSectionI18n = { [K in keyof typeof MEMBER_AGE_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// member-cat-section.store
// ---------------------------------------------------------------------------

export const MEMBER_CAT_SECTION_I18N_KEYS = {
  category: PFX + 'member.cat.category',
  male:     PFX + 'member.cat.male',
  female:   PFX + 'member.cat.female',
  total:    PFX + 'member.cat.total',
  empty:    PFX + 'member.cat.empty',
} satisfies Record<string, string>;

export type MemberCatSectionI18n = { [K in keyof typeof MEMBER_CAT_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// messages-section.store
// ---------------------------------------------------------------------------

export const MESSAGES_SECTION_I18N_KEYS = {
  messages_empty: PFX + 'chat.empty',
  more:           '@more',
} satisfies Record<string, string>;

export type MessagesSectionI18n = { [K in keyof typeof MESSAGES_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// news-section.store
// ---------------------------------------------------------------------------

export const NEWS_SECTION_I18N_KEYS = {
  empty:  PFX + 'news.empty',
  more:   '@more',
  view:   PFX + 'news.view',
  edit:   PFX + 'news.edit',
  cancel: '@cancel',
} satisfies Record<string, string>;

export type NewsSectionI18n = { [K in keyof typeof NEWS_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// orgchart-section.store
// ---------------------------------------------------------------------------

export const ORGCHART_SECTION_I18N_KEYS = {
  ok:                           '@ok',
  cancel:                       '@cancel',
  view_accordion:               PFX + 'orgchart.accordion',
  view_chart:                   PFX + 'orgchart.chart',
  group_add_new:                PFX + 'orgchart.group.add.new',
  group_add_existing:           PFX + 'orgchart.group.add.existing',
  group_edit:                   PFX + 'orgchart.group.edit',
  group_remove_label:           PFX + 'orgchart.group.remove.label',
  group_remove_confirm:         PFX + 'group.detach.confirm',

} satisfies Record<string, string>;

export type OrgchartSectionI18n = { [K in keyof typeof ORGCHART_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// people-section.store
// ---------------------------------------------------------------------------

export const PEOPLE_SECTION_I18N_KEYS = {
  people_empty: PFX + 'people.empty',
} satisfies Record<string, string>;

export type PeopleSectionI18n = { [K in keyof typeof PEOPLE_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// rag-section.store
// ---------------------------------------------------------------------------

export const RAG_SECTION_I18N_KEYS = {
  upload:      PFX + 'rag.upload',
  placeholder: PFX + 'rag.placeholder',
} satisfies Record<string, string>;

export type RagSectionI18n = { [K in keyof typeof RAG_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// tasks-section.store
// ---------------------------------------------------------------------------

export const TASKS_SECTION_I18N_KEYS = {
  empty:    PFX + 'task.empty',
  more:     '@more',
  complete: PFX + 'task.complete',
  view:     PFX + 'task.view',
  edit:     PFX + 'task.edit',
  cancel:   '@cancel',
} satisfies Record<string, string>;

export type TasksSectionI18n = { [K in keyof typeof TASKS_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// trip-stats-section.store
// ---------------------------------------------------------------------------

export const TRIP_STATS_I18N_KEYS = {
  empty:    PFX + 'tripstats.empty',
  colName:  PFX + 'tripstats.colName',
  colKm:    PFX + 'tripstats.colKm',
  colTrips: PFX + 'tripstats.colTrips',
} satisfies Record<string, string>;

export type TripStatsI18n = { [K in keyof typeof TRIP_STATS_I18N_KEYS]: Signal<string> };
