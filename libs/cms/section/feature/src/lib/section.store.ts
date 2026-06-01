import { computed, inject, Injectable, Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

import { AppStore } from '@bk2/shared-feature';
import { ArticleSection, ButtonAction, ButtonSection, CategoryItemModel, CategoryListModel, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageActionType, ImageConfig, SectionModel, SectionType } from '@bk2/shared-models';
import { chipMatches, debugItemLoaded, debugMessage, nameMatches } from '@bk2/shared-util-core';
import { DEFAULT_MIMETYPES, IMAGE_MIMETYPES } from '@bk2/shared-constants';
import { confirm, showToast } from '@bk2/shared-util-angular';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';

import { UploadService } from '@bk2/avatar-data-access';
import { SectionService } from '@bk2/cms-section-data-access';
import { createSection, narrowSection } from '@bk2/cms-section-util';

import { SectionEditModal } from './section-edit.modal';
import { MessageCenterModal } from './message-center.modal';
import { CardSelectModal } from './card-select.modal';
import { PFX } from './scope';

const SECTION_I18N_KEYS = {
  sections:                  PFX + 'sections',
  description:               PFX + 'description',
  empty:                     PFX + 'empty',
  key:                       '@key',
  name:                      '@name',
  type:                      '@type',
  no_images:                  PFX + 'noImages',
  no_such_section:            PFX + 'noSuchSection',
  empty_table:                PFX + 'emptyTable',
  select_label:               PFX + 'select.label',
  view:                       PFX + 'view',
  edit:                       PFX + 'edit',
  create:                     PFX + 'create',
  delete:                     PFX + 'delete.label',
  delete_confirm:             PFX + 'delete.confirm',
  send_confirm1:              PFX + 'send.confirm1',
  send_confirm2:              PFX + 'send.confirm2',
  activity_empty:             PFX + 'activity.empty',
  emergency_needs_help:       PFX + 'emergency.needsHelp',
  emergency_unknown_location: PFX + 'emergency.needsHelpUnknownLocation',
  calevents:                  PFX + 'calevent.calevents',
  calevent_update:            PFX + 'calevent.update.label',
  calevent_update_conf:       PFX + 'calevent.update.conf',
  calevent_update_error:      PFX + 'calevent.update.error',
  calevent_subscribe:         PFX + 'calevent.subscribe',
  calevent_unsubscribe:       PFX + 'calevent.unsubscribe',
  calevent_edit:              PFX + 'calevent.edit',
  calevent_view:              PFX + 'calevent.view',
  calevent_download:          PFX + 'calevent.download',

  invitation_update:          PFX + 'invitation.update.label',
  invitation_update_conf:     PFX + 'invitation.update.conf',
  invitation_update_error:    PFX + 'invitation.update.error',
  invitation_subscribe:       PFX + 'invitation.subscribe',
  invitation_unsubscribe:     PFX + 'invitation.unsubscribe',
  
  context_title:              PFX + 'context.title',
  context_show_avatar:        PFX + 'context.show.avatar',
  context_show_name:          PFX + 'context.show.name',
  context_show_members:       PFX + 'context.show.members',
  context_show_memberships:   PFX + 'context.show.memberships',
  context_show_responsibilities: PFX + 'context.show.responsibilities',
  context_show_personrels:    PFX + 'context.show.personrels',
  context_show_workrels:      PFX + 'context.show.workrels',
  context_show_save:          PFX + 'context.show.save',
  context_edit:               PFX + 'context.edit',
  context_center:             PFX + 'context.center',
  context_displayConfig:      PFX + 'context.displayConfig',

  messages_empty:             PFX + 'messages.empty',
  news_empty:                 PFX + 'news.empty',
  news_view:                  PFX + 'news.view',
  news_edit:                  PFX + 'news.edit',

  task_empty:                 PFX + 'task.empty',
  task_complete:              PFX + 'task.complete',
  task_view:                  PFX + 'task.view',
  task_edit:                  PFX + 'task.edit',

  orgchart_accordion:         PFX + 'orgchart.accordion',
  orgchart_chart:             PFX + 'orgchart.chart',
  orgchart_addNewGroup:       PFX + 'orgchart.group.add.new',
  orgchart_addExistingGroup:  PFX + 'orgchart.group.add.existing',
  orgchart_editGroup:         PFX + 'orgchart.group.edit',
  orgchart_removeGroup:       PFX + 'orgchart.group.remove',

  rag_placeholder:            PFX + 'rag.placeholder',
  rag_upload:                 PFX + 'rag.upload',

  album_zoomed:               PFX + 'album.zoomed',
  album_style:                PFX + 'album.style',

  email_conf:                 PFX + 'email.conf',
  email_error:                PFX + 'email.error',

  group_detach_confirm:       PFX + 'group.detach.confirm',

  member_age_group:           PFX + 'member.age.group',
  member_age_male:            PFX + 'member.age.male',
  member_age_female:          PFX + 'member.age.female',
  member_age_total:           PFX + 'member.age.total',
  member_age_empty:           PFX + 'member.age.empty',

  member_cat_category:        PFX + 'member.cat.category',
  member_cat_male:            PFX + 'member.cat.male',
  member_cat_female:          PFX + 'member.cat.female',
  member_cat_total:           PFX + 'member.cat.total',
  member_cat_empty:           PFX + 'member.cat.empty',

  notes_label:                PFX + 'notes.label',
  notes_placeholder:          PFX + 'notes.placeholder',

  image_edit:                 PFX + 'image.edit',
  image_delete:               PFX + 'image.delete',
  image_upload:               PFX + 'image.upload',
  image_label_label:          PFX + 'image.label.label',
  image_label_placeholder:    PFX + 'image.label.placeholder',
  image_label_helper:         PFX + 'image.label.helper',

  image_url_label:            PFX + 'image.url.label',
  image_url_placeholder:      PFX + 'image.url.placeholder',
  image_url_helper:           PFX + 'image.url.helper',

  image_action_label:         PFX + 'image.actionUrl.label',
  image_action_placeholder:   PFX + 'image.actionUrl.placeholder',
  image_action_helper:        PFX + 'image.actionUrl.helper',

  image_alt_label:           PFX + 'image.altText.label',
  image_alt_placeholder:     PFX + 'image.altText.placeholder',
  image_alt_helper:          PFX + 'image.altText.helper',

  image_overlay_label:           PFX + 'image.overlay.label',
  image_overlay_placeholder:     PFX + 'image.overlay.placeholder',
  image_overlay_helper:          PFX + 'image.overlay.helper',

  image_type_name:            PFX + 'image.type.name',
  image_type_label:           PFX + 'image.type.label',
  image_type_helper:          PFX + 'image.type.helper',

  // album
  album_title:                PFX + 'type.album.edit',
  directory_label:            PFX + 'directory.label',
  directory_placeholder:      PFX + 'directory.placeholder',
  directory_helper:           PFX + 'directory.helper',
  albumStyle_label:           PFX + 'albumStyle.label',
  effect_label:               PFX + 'effect.label',
  recursive_label:            PFX + 'recursive.label',
  recursive_helper:           PFX + 'recursive.helper',
  showVideos_label:           PFX + 'showVideos.label',
  showVideos_helper:          PFX + 'showVideos.helper',
  showStreamingVideos_label:  PFX + 'showStreamingVideos.label',
  showStreamingVideos_helper: PFX + 'showStreamingVideos.helper',
  showDocs_label:             PFX + 'showDocs.label',
  showDocs_helper:            PFX + 'showDocs.helper',
  showPdfs_label:             PFX + 'showPdfs.label',
  showPdfs_helper:            PFX + 'showPdfs.helper',

  // button action
  actionUrl_label:       PFX + 'actionUrl.label',
  actionUrl_placeholder: PFX + 'actionUrl.placeholder',
  actionUrl_helper:      PFX + 'actionUrl.helper',
  altText_label:         PFX + 'altText.label',
  altText_placeholder:   PFX + 'altText.placeholder',
  altText_helper:        PFX + 'altText.helper',
  buttonAction_label:    PFX + 'buttonAction.label',

  // button style
  button_style_title:   PFX + 'button.style.title',
  button_style_subtitle: PFX + 'button.style.subtitle',
  label_label:       PFX + 'label.label',
  label_placeholder: PFX + 'label.placeholder',
  label_helper:      PFX + 'label.helper',
  shape_label:       PFX + 'shape.label',
  
  // button widget

  // chat-configuration
  chat_title:        PFX + 'chat.title',
  chat_subtitle:      PFX + 'chat.subtitle',
  id_label:          PFX + 'id.label',
  id_placeholder:    PFX + 'id.placeholder',
  id_helper:         PFX + 'id.helper',
  name_label:        PFX + 'name.label',
  name_placeholder:  PFX + 'name.placeholder',
  name_helper:       PFX + 'name.helper',
  url_label:         PFX + 'url.label',
  url_placeholder:   PFX + 'url.placeholder',
  url_helper:        PFX + 'url.helper',
  description_label:       PFX + 'description.label',
  description_placeholder: PFX + 'description.placeholder',
  description_helper:      PFX + 'description.helper',
  type_label:              PFX + 'chatType.label',
  showChannelList_label:   PFX + 'showChannelList.label',
  showChannelList_helper:  PFX + 'showChannelList.helper',

  // editor-configuration
  colSize_label:       PFX + 'colSize.label',
  colSize_placeholder: PFX + 'colSize.placeholder',
  colSize_helper:      PFX + 'colSize.helper',
  position_label:      PFX + 'position.label',

  // emergency button widget

  // events-configuration
  events_title:               PFX + 'events.title',
  events_subtitle:            PFX + 'events.subtitle',
  moreUrl_label:              PFX + 'moreUrl.label',
  moreUrl_placeholder:        PFX + 'moreUrl.placeholder',
  moreUrl_helper:             PFX + 'moreUrl.helper',
  maxEvents_label:            PFX + 'maxEvents.label',
  maxEvents_placeholder:      PFX + 'maxEvents.placeholder',
  maxEvents_helper:           PFX + 'maxEvents.helper',
  showPastEvents_label:       PFX + 'showPastEvents.label',
  showPastEvents_helper:      PFX + 'showPastEvents.helper',
  showUpcomingEvents_label:   PFX + 'showUpcomingEvents.label',
  showUpcomingEvents_helper:  PFX + 'showUpcomingEvents.helper',
  showEventTime_label:        PFX + 'showEventTime.label',
  showEventTime_helper:       PFX + 'showEventTime.helper',
  showEventLocation_label:    PFX + 'showEventLocation.label',
  showEventLocation_helper:   PFX + 'showEventLocation.helper',

  // icon-configuration
  icon_label:             PFX + 'icon.label',
  icon_placeholder:       PFX + 'icon.placeholder',
  icon_helper:            PFX + 'icon.helper',
  iconSize_label:         PFX + 'iconSize.label',
  iconSize_placeholder:   PFX + 'iconSize.placeholder',
  iconSize_helper:        PFX + 'iconSize.helper',
  iconSlot_label:         PFX + 'iconSlot.label',

  // iframe-configuration
  iframe_title:       PFX + 'iframe.title',
  style_label:       PFX + 'style.label',
  style_placeholder: PFX + 'style.placeholder',
  style_helper:      PFX + 'style.helper',

  // image-edit modal
  imageedit_title:        PFX + 'image.edit.title',
  overlay_label:         PFX + 'overlay.label',
  overlay_placeholder:   PFX + 'overlay.placeholder',
  overlay_helper:        PFX + 'overlay.helper',
  imageType_label:       PFX + 'imageType.label',

    // image style configuration
  image_style_title:          PFX + 'image.style.title',
  imgIxParams_label:       PFX + 'imgIxParams.label',
  imgIxParams_placeholder: PFX + 'imgIxParams.placeholder',
  imgIxParams_helper:      PFX + 'imgIxParams.helper',
  sizes_label:             PFX + 'sizes.label',
  sizes_placeholder:       PFX + 'sizes.placeholder',
  sizes_helper:            PFX + 'sizes.helper',
  borderRadius_label:       PFX + 'borderRadius.label',
  borderRadius_placeholder: PFX + 'borderRadius.placeholder',
  borderRadius_helper:      PFX + 'borderRadius.helper',
  slot_label:               PFX + 'imageSlot.label',
  imageAction_label:        PFX + 'imageAction.label',
  isThumbnail_label:        PFX + 'isThumbnail.label',
  isThumbnail_helper:       PFX + 'isThumbnail.helper',
  fill_label:               PFX + 'imageFill.label',
  fill_helper:              PFX + 'imageFill.helper',
  hasPriority_label:        PFX + 'hasPriority.label',
  hasPriority_helper:       PFX + 'hasPriority.helper',

  // images config

  // invitations config
  invitations_title:        PFX + 'invitations.title',
  invitations_subtitle:     PFX + 'invitations.subtitle',
  maxItems_label:           PFX + 'maxItems.label',
  maxItems_placeholder:     PFX + 'maxItems.placeholder',
  maxItems_helper:          PFX + 'maxItems.helper',
  showPastItems_label:      PFX + 'showPastItems.label',
  showPastItems_helper:     PFX + 'showPastItems.helper',
  showUpcomingItems_label:  PFX + 'showUpcomingItems.label',
  showUpcomingItems_helper: PFX + 'showUpcomingItems.helper',

  // map config
  latitude_label:      PFX + 'latitude.label',
  latitude_placeholder: PFX + 'latitude.placeholder',
  latitude_helper:     PFX + 'latitude.helper',
  longitude_label:     PFX + 'longitude.label',
  longitude_placeholder: PFX + 'longitude.placeholder',
  longitude_helper:    PFX + 'longitude.helper',
  zoomFactor_label:                    PFX + 'zoomFactor.label',
  zoomFactor_placeholder:              PFX + 'zoomFactor.placeholder',
  zoomFactor_helper:                   PFX + 'zoomFactor.helper',
  useCurrentLocationAsCenter_label:    PFX + 'useCurrentLocationAsCenter.label',
  useCurrentLocationAsCenter_helper:   PFX + 'useCurrentLocationAsCenter.helper',

  // people config
  people_edit:            PFX + 'people.edit',
  title_label:           PFX + 'title.label',
  title_placeholder:     PFX + 'title.placeholder',
  title_helper:          PFX + 'title.helper',
  linkedSection_label:       PFX + 'linkedSection.label',
  linkedSection_placeholder: PFX + 'linkedSection.placeholder',
  linkedSection_helper:      PFX + 'linkedSection.helper',
  peopleType_label:          PFX + 'peopleType.label',
  color_label:               PFX + 'color.label',
  nameDisplay_label:         PFX + 'nameDisplay.label',
  showName_label:            PFX + 'showName.label',
  showName_helper:           PFX + 'showName.helper',
  showLabel_label:           PFX + 'showLabel.label',
  showLabel_helper:          PFX + 'showLabel.helper',

  // persons-widget
  people_empty:               PFX + 'people.empty',

  // responsibility-config
  bkey_label:              PFX + 'bkey.label',
  bkey_placeholder:        PFX + 'bkey.placeholder',
  bkey_helper:             PFX + 'bkey.helper',
  showAvatar_label:        PFX + 'showAvatar.label',
  showAvatar_helper:       PFX + 'showAvatar.helper',
  showDescription_label:   PFX + 'showDescription.label',
  showDescription_helper:  PFX + 'showDescription.helper',

    // section config
  subTitle_label:       PFX + 'subTitle.label',
  subTitle_placeholder: PFX + 'subTitle.placeholder',
  subTitle_helper:      PFX + 'subTitle.helper',

  // table grid config
  template_label:         PFX + 'template.label',
  template_placeholder:   PFX + 'template.placeholder',
  template_helper:        PFX + 'template.helper',
  gap_label:              PFX + 'gap.label',
  gap_placeholder:        PFX + 'gap.placeholder',
  gap_helper:             PFX + 'gap.helper',
  backgroundColor_label:       PFX + 'backgroundColor.label',
  backgroundColor_placeholder: PFX + 'backgroundColor.placeholder',
  backgroundColor_helper:      PFX + 'backgroundColor.helper',
  padding_label:          PFX + 'padding.label',
  padding_placeholder:    PFX + 'padding.placeholder',
  padding_helper:         PFX + 'padding.helper',
  showTitleAs_label:      PFX + 'showTitleAs.label',

  // table-header / table-body
  title:                   PFX + 'title',
  add:                     PFX + 'add',

  // table style config
  textAlign_label:         PFX + 'textAlign.label',
  textAlign_placeholder:   PFX + 'textAlign.placeholder',
  textAlign_helper:        PFX + 'textAlign.helper',
  fontSize_label:          PFX + 'fontSize.label',
  fontSize_placeholder:    PFX + 'fontSize.placeholder',
  fontSize_helper:         PFX + 'fontSize.helper',
  textColor_label:         PFX + 'textColor.label',
  textColor_placeholder:   PFX + 'textColor.placeholder',
  textColor_helper:        PFX + 'textColor.helper',
  border_label:            PFX + 'border.label',
  border_placeholder:      PFX + 'border.placeholder',
  border_helper:           PFX + 'border.helper',
  fontWeight_label:        PFX + 'fontWeight.label',

  // tracker config
  tracker_title:                 PFX + 'tracker.title',
  intervalInSeconds_label:       PFX + 'intervalInSeconds.label',
  intervalInSeconds_placeholder: PFX + 'intervalInSeconds.placeholder',
  intervalInSeconds_helper:      PFX + 'intervalInSeconds.helper',
  maximumAge_label:              PFX + 'maximumAge.label',
  maximumAge_placeholder:        PFX + 'maximumAge.placeholder',
  maximumAge_helper:             PFX + 'maximumAge.helper',
  exportFormat_label:            PFX + 'exportFormat.label',
  autostart_label:               PFX + 'autostart.label',
  autostart_helper:              PFX + 'autostart.helper',
  enableHighAccuracy_label:      PFX + 'enableHighAccuracy.label',
  enableHighAccuracy_helper:     PFX + 'enableHighAccuracy.helper',

  // trip-stats-config
  trip_stats_title:               PFX + 'tripStats.title',
  viewType_label:                 PFX + 'tripStats.viewType_label',
  contentType_label:              PFX + 'tripStats.contentType_label',

  // video config
  youtubeId_label:                  PFX + 'youtubeId.label',
  youtubeId_placeholder:            PFX + 'youtubeId.placeholder',
  youtubeId_helper:                 PFX + 'youtubeId.helper',
  width_label:                      PFX + 'width.label',
  width_placeholder:                PFX + 'width.placeholder',
  width_helper:                     PFX + 'width.helper',
  height_label:                     PFX + 'height.label',
  height_placeholder:               PFX + 'height.placeholder',
  height_helper:                    PFX + 'height.helper',
  frameborder_label:                PFX + 'frameborder.label',
  frameborder_placeholder:          PFX + 'frameborder.placeholder',
  frameborder_helper:               PFX + 'frameborder.helper',
  baseUrl_label:                    PFX + 'baseUrl.label',
  baseUrl_placeholder:              PFX + 'baseUrl.placeholder',
  baseUrl_helper:                   PFX + 'baseUrl.helper',

  as_title:                   '@actionsheet.title',
  copy_conf:                  '@copy.conf',
  ok:                         '@ok',
  cancel:                     '@cancel',
  save:                       '@save.label'
} satisfies Record<string, string>;

export type SectionI18n = { [K in keyof typeof SECTION_I18N_KEYS]: Signal<string> };

export type SectionState = {
  sectionId: string;

  // filters
  searchTerm: string;
  selSearchTerm: string;    // for the section select modal
  selectedTag: string;
  selectedCategory: string;
  selectedState: string;
};

export const initialState: SectionState = {
  sectionId: '',
  searchTerm: '',
  selSearchTerm: '',
  selectedTag: '',
  selectedCategory: 'all',
  selectedState: 'all',
};

export const _SectionStore = signalStore(
  withState(initialState),
  withProps(() => ({
    sectionService: inject(SectionService),
    uploadService: inject(UploadService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertController: inject(AlertController),
    toastController: inject(ToastController),
    firestoreService: inject(FirestoreService),
    i18nService: inject(I18nService)
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(SECTION_I18N_KEYS),

    sectionsResource: rxResource({
      stream: () => {
        return store.sectionService.list();
      }
    }),

    sectionResource: rxResource({
      params: () => ({
        sectionId: store.sectionId(),
        currentUser: store.appStore.currentUser()
      }),
      stream: ({ params }) => {
        return store.sectionService.read(params.sectionId).pipe(
          debugItemLoaded<SectionModel>(`SectionStore.sectionResource`, params.currentUser)
        );
      }
    })
  })),

  withComputed((state) => {
    return {
      // sections
      sections: computed(() => state.sectionsResource.value()),
      sectionsCount: computed(() => state.sectionsResource.value()?.length ?? 0),
      filteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.searchTerm()) && 
          nameMatches(section.type, state.selectedCategory()) &&
          chipMatches(section.tags, state.selectedTag()) &&
          nameMatches(section.state, state.selectedState())
        )),

      selFilteredSections: computed(() => 
        state.sectionsResource.value()?.filter((section: SectionModel) => 
          nameMatches(section.index, state.selSearchTerm())
        )),

      // section
      section: computed(() => state.sectionResource.value() ?? undefined),

      // others
      isLoading: computed(() => state.sectionsResource.isLoading() || state.sectionResource.isLoading()),
      sectionTypes: computed(() => state.appStore.getCategory('section_type')),
      currentUser: computed(() => state.appStore.currentUser()),
      tenantId: computed(() => state.appStore.tenantId()),
      showDebugInfo: computed(() => state.appStore.showDebugInfo()),
      imgixBaseUrl: computed(() => state.appStore.env.services.imgixBaseUrl),
      }
  }),

  withMethods((store) => {
    return {
      reset() {
        patchState(store, initialState);
        this.reload();
      },

      reload() {
        store.sectionsResource.reload();
        store.sectionResource.reload();
      },

      /******************************** setters (filter) ******************************************* */
      /**
       * Updates the page id which triggers the loading of the page.
       * @param id the key of the page
       */
      setSectionId(sectionId: string) {
        debugMessage(`SectionStore.setSectionId(${sectionId})`, store.currentUser());
        patchState(store, { sectionId });
      },

      setSearchTerm(searchTerm: string) {
        patchState(store, { searchTerm });
      },

      setSelSearchTerm(selSearchTerm: string) {   // for section select modal
        patchState(store, { selSearchTerm });
      },

      setSelectedTag(selectedTag: string) {
        patchState(store, { selectedTag });
      },

      setSelectedCategory(selectedCategory: string) {
        patchState(store, { selectedCategory });
      },

      setSelectedState(selectedState: string) {
        patchState(store, { selectedState });
      },

      /******************************** getters ******************************************* */
      getTags(): string {
        return store.appStore.getTags('section');
      },

      getTypes(): CategoryListModel {
        return store.appStore.getCategory('section_type');
      },

      getRoles(): CategoryListModel {
        return store.appStore.getCategory('roles');
      },

      /******************************** actions ******************************************* */
      async add(readOnly = true): Promise<string | undefined> {
        if (readOnly) return;
        const modal = await store.modalController.create({
          component: CardSelectModal,
          cssClass: 'full-modal',
          componentProps: { 
            category: store.sectionTypes(),
            slug: 'section',
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data) { // data = selected CategoryItemModel
          const item = data as CategoryItemModel;
          const section = createSection(item.name as SectionType, store.tenantId());
          const sectionId = await this.edit(section, readOnly);
          this.reload();
          return sectionId;
        }
      },

      async edit(section?: SectionModel, readOnly = true): Promise<string | undefined> {
        if (!section) return;
        const tags = this.getTags();
        const roles = this.getRoles();
        const states = store.appStore.getCategory('content_state');
        const modal = await store.modalController.create({
          component: SectionEditModal,
          cssClass: 'full-modal',
          componentProps: {
            section,
            currentUser: store.currentUser(),
            tags,
            roles,
            states,
            readOnly
          }
        });
        modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data && !readOnly) {
          const section = narrowSection(data);
          if (section) {
            const sectionId = section.bkey?.length === 0 ?
              await store.sectionService.create(section, store.currentUser()) :
              await store.sectionService.update(data, store.currentUser());
            this.reload();
            return sectionId;
          }
        }
      },

      async delete(section?: SectionModel, readOnly = true): Promise<void> {
        if (readOnly || !section) return;
        const result = await confirm(store.alertController, store.i18n.delete_confirm(), store.i18n.ok(), store.i18n.cancel(), true);
        if (result === true) {
          await store.sectionService.delete(section, store.currentUser());
          this.reset();
        }
      },

      async uploadImage(section?: ArticleSection): Promise<void> {
        if (!section) return;
        // 1) pick an image file
        const file = await store.uploadService.pickFile(IMAGE_MIMETYPES);
        if (!file) return;

        // 2) upload the image file into Firestorage
        const storagePath = `tenant/${store.tenantId()}/section/${section.bkey}/image/${file.name}`;
        const downloadUrl = await store.uploadService.uploadFile(file, storagePath, 'Upload Section Image');
        if (!downloadUrl) return;

        // 3) update the section with the new image URL
        const imgixBaseUrl = store.appStore.env.services.imgixBaseUrl; // https://bkaiser.imgix.net
        const newImage = {
          ...IMAGE_CONFIG_SHAPE,
          url: `${imgixBaseUrl}/${storagePath}`,
          actionUrl: downloadUrl,
          altText: file.name,
          label: file.name.replace(/\.[^.]+$/, ''),
        };
        if (!section.properties.images) {
          section.properties.images = [];
        }
        section.properties.images = [...section.properties.images, newImage];
        if (!section.properties.imageStyle) {
          section.properties.imageStyle = IMAGE_STYLE_SHAPE;
        }
        section.properties.imageStyle.action = ImageActionType.Download;
        await store.sectionService.update(section, store.currentUser());
        await this.createDocument(file, storagePath, downloadUrl);  // create a document for the uploaded image
        this.reload();
      },

      async uploadFile(section?: ButtonSection): Promise<void> {
        if (!section) return;
        // 1) pick a file
        const file = await store.uploadService.pickFile(DEFAULT_MIMETYPES);
        if (!file) return;

        // 2) upload the file into Firestorage
        const storagePath = `tenant/${store.tenantId()}/section/${section.bkey}/file/${file.name}`;
        const downloadUrl = await store.uploadService.uploadFile(file, storagePath, 'Upload Section File');
        if (!downloadUrl) return;

        // 3) update the section with the new file URL
        section.properties.action.url = downloadUrl;
        section.properties.action.altText = file.name;
        section.properties.action.type = ButtonAction.Download;
        await store.sectionService.update(section, store.currentUser());
        await this.createDocument(file, storagePath, downloadUrl);  // create a document for the uploaded file
        this.reload();
      },

      async createDocument(file: File, storagePath: string, downloadUrl: string) {
        return store.uploadService.createAndSaveDocument(file, store.tenantId(), storagePath, downloadUrl, store.currentUser());
      },

      async export(type: string): Promise<void> {
        console.log(`SectionStore.export(${type}) is not yet implemented.`);
      },

      async send(section: SectionModel): Promise<void> {
        const modal = await store.modalController.create({
          component: MessageCenterModal,
          cssClass: 'list-modal-wide',
          componentProps: {
            initialSubject: section.title,
            initialFrom: 'kommunikation@seeclub.org',
            isPrivileged: true
          },
        });
        await modal.present();
        const { data, role } = await modal.onWillDismiss();
        if (role === 'confirm' && data?.to?.length > 0) {
          const tos = data.to as string[];
          const ccs = data.cc as string[];
          const bccs = data.bcc as string[];
          const nrEmails = tos.length + ccs.length + bccs.length;

          const message = computed(() => store.i18n.send_confirm1() + ' ' + nrEmails + ' ' + store.i18n.send_confirm2());
          console.log(`MessageCenterModal: sending to:${tos.length}, cc:${ccs.length}, bcc:${bccs.length}`);
          console.log('     - tos: ', tos);
          console.log('     - ccs: ', ccs);
          console.log('     - bccs: ', bccs);
          const result = await confirm(store.alertController, message(), store.i18n.ok(), store.i18n.cancel(), true);
          if (result === true) {
            console.log('SectionStore: sending ' + data.to.length + ' emails from ' + data.from);
            await this.sendEmail(data.to, data.subject, this.buildEmailHtml(section), data.from, data.cc, data.bcc, data.provider, data.template);
          }
        }
      },

      buildEmailHtml(section: SectionModel): string {
        const props = section.properties as any;
        const images: ImageConfig[] = Array.isArray(props?.images) && props.images.length > 0
          ? props.images
          : props?.image ? [props.image] : [];
        const imgHtml = images
          .map(img => `<p><img src="${img.url}" alt="${img.altText ?? ''}" style="max-width:100%;height:auto;" /></p>`)
          .join('');
        const content = (section as ArticleSection).content?.htmlContent ?? '';
        return imgHtml + content;
      },

      async sendEmail(to: string[], subject: string, html: string, from: string, cc: string[] = [], bcc: string[] = [], provider = 'mailgun_smtp', template?: string): Promise<void> {
        try {
          const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'sendEmail');
          await fn({ to, cc, bcc, appId: store.appStore.env.appId, html, from, subject, provider, template });
          await showToast(store.toastController, '@general.operation.email.conf');
        } catch (ex) {
          console.error('SectionStore.sendEmail: error: ', ex);
          await showToast(store.toastController, '@general.operation.email.error');
        }
      },

      getTitleLabel(readOnly: boolean, key?: string): string {
        if (readOnly) {
          return store.i18n.view();
        }
        if (key && key.length > 0) {
          return store.i18n.edit();
        } else {
          return store.i18n.create();
        }
      },
    }
  }),
);


@Injectable({
  providedIn: 'root'
})
export class SectionStore extends _SectionStore {
  constructor() {
    super();
  }
}