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
  albumStyle_label:  PFX + 'albumStyle.label',
} satisfies Record<string, string>;

export type AlbumSectionI18n = { [K in keyof typeof ALBUM_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// calendar-section.store
// ---------------------------------------------------------------------------

export const CALENDAR_SECTION_I18N_KEYS = {
  update_calevent_conf:       PFX + 'calevent.update.conf',
  update_calevent_error:      PFX + 'calevent.update.error',
  update_invitation_conf:     PFX + 'invitation.update.conf',
  update_invitation_error:    PFX + 'invitation.update.error',
  calevents:                  PFX + 'calevent.calevents',
  more:                       '@more',
  subscribe:                  PFX + 'calevent.subscribe',
  unsubscribe:                PFX + 'calevent.unsubscribe',
  edit:                       PFX + 'calevent.edit',
  view:                       PFX + 'calevent.view',
  download:                   PFX + 'calevent.download',
  cancel:                     '@cancel',
} satisfies Record<string, string>;

export type CalendarSectionI18n = { [K in keyof typeof CALENDAR_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// form-section (FormSectionStore)
// ---------------------------------------------------------------------------

export const FORMS_SECTION_I18N_KEYS = {
  submit:       PFX + 'form.section.submit.label',
  submit_conf:  PFX + 'form.section.submit.conf',
  submit_error: PFX + 'form.section.submit.error',
  not_found:    PFX + 'form.section.not_found',
  archived:     PFX + 'form.section.archived',
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
  ageGroup: PFX + 'memberAge.ageGroup',
  male:     PFX + 'memberAge.male',
  female:   PFX + 'memberAge.female',
  total:    PFX + 'memberAge.total',
  empty:    PFX + 'memberAge.empty',
} satisfies Record<string, string>;

export type MemberAgeSectionI18n = { [K in keyof typeof MEMBER_AGE_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// member-cat-section.store
// ---------------------------------------------------------------------------

export const MEMBER_CAT_SECTION_I18N_KEYS = {
  category: PFX + 'memberCat.category',
  male:     PFX + 'memberCat.male',
  female:   PFX + 'memberCat.female',
  total:    PFX + 'memberCat.total',
  empty:    PFX + 'memberCat.empty',
} satisfies Record<string, string>;

export type MemberCatSectionI18n = { [K in keyof typeof MEMBER_CAT_SECTION_I18N_KEYS]: Signal<string> };

// ---------------------------------------------------------------------------
// messages-section.store
// ---------------------------------------------------------------------------

export const MESSAGES_SECTION_I18N_KEYS = {
  messages_empty: PFX + 'messages.empty',
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
  group_detach_confirm:    PFX + 'group.detach.confirm',
  ok:                      '@ok',
  cancel:                  '@cancel',
  view_accordion:          '@cms.orgchart.view.accordion',
  view_chart:              '@cms.orgchart.view.chart',
  as_addNewGroup:          PFX + 'orgchart.actionsheet.addNewGroup',
  as_addExistingGroup:     PFX + 'orgchart.actionsheet.addExistingGroup',
  as_editGroup:            PFX + 'orgchart.actionsheet.editGroup',
  as_removeGroup:          PFX + 'orgchart.actionsheet.removeGroup',
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
