import { Component, computed, inject, input, linkedSignal, model, Signal } from '@angular/core';

import { AlbumConfig, AlbumSection, ArticleSection, AvatarInfo, ButtonActionConfig, ButtonSection, ButtonStyle, CategoryListModel, ChatConfig, ChatSection, EDITOR_CONFIG_SHAPE, EditorConfig, EventsConfig, EventsSection, HeroSection, IconConfig, IframeConfig, IframeSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, InvitationsConfig, InvitationsSection, MapConfig, MapSection, PeopleConfig, PeopleSection, ResponsibilityConfig, ResponsibilitySection, RoleName, SectionModel, SectionModelName, SliderSection, TableGrid, TableSection, TableStyle, TrackerConfig, TrackerSection, UserModel, VideoConfig, VideoSection } from '@bk2/shared-models';
import { Chips, ImageConfigEdit, NotesInput, NotesInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_LABEL, DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';
import { ModelSelectService } from '@bk2/shared-feature';

export interface SectionFormI18n {
  image_edit: Signal<string>;
  image_delete: Signal<string>;
  image_upload: Signal<string>;
  image_label_label: Signal<string>;
  image_label_placeholder: Signal<string>;
  image_label_helper: Signal<string>;
  image_url_label: Signal<string>;
  image_url_placeholder: Signal<string>;
  image_url_helper: Signal<string>;
  image_action_label: Signal<string>;
  image_action_placeholder: Signal<string>;
  image_action_helper: Signal<string>;
  image_alt_label: Signal<string>;
  image_alt_placeholder: Signal<string>;
  image_alt_helper: Signal<string>;
  image_overlay_label: Signal<string>;
  image_overlay_placeholder: Signal<string>;
  image_overlay_helper: Signal<string>;
  image_type_name: Signal<string>;
  image_type_label: Signal<string>;
  image_type_helper: Signal<string>;

  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;

  // album config
  album_title:                  Signal<string>;
  directory_label:              Signal<string>;
  directory_placeholder:        Signal<string>;
  directory_helper:             Signal<string>;
  albumStyle_label:             Signal<string>;
  effect_label:                 Signal<string>;
  recursive_label:              Signal<string>;
  recursive_helper:             Signal<string>;
  showVideos_label:             Signal<string>;
  showVideos_helper:            Signal<string>;
  showStreamingVideos_label:    Signal<string>;
  showStreamingVideos_helper:   Signal<string>;
  showDocs_label:               Signal<string>;
  showDocs_helper:              Signal<string>;
  showPdfs_label:               Signal<string>;
  showPdfs_helper:              Signal<string>;

  // button action
  actionUrl_label:       Signal<string>;
  actionUrl_placeholder: Signal<string>;
  actionUrl_helper:      Signal<string>;
  altText_label:         Signal<string>;
  altText_placeholder:   Signal<string>;
  altText_helper:        Signal<string>;
  buttonAction_label:    Signal<string>;

  // button style  
  button_style_title: Signal<string>;
  button_style_subtitle: Signal<string>;
  label_label:       Signal<string>;
  label_placeholder: Signal<string>;
  label_helper:      Signal<string>;
  shape_label:       Signal<string>;

  // chat config
  chat_title:      Signal<string>;
  chat_subtitle:   Signal<string>;
  id_label:          Signal<string>;
  id_placeholder:    Signal<string>;
  id_helper:         Signal<string>;
  name_label:        Signal<string>;
  name_placeholder:  Signal<string>;
  name_helper:       Signal<string>;
  url_label:         Signal<string>;
  url_placeholder:   Signal<string>;
  url_helper:        Signal<string>;
  description_label:       Signal<string>;
  description_placeholder: Signal<string>;
  description_helper:      Signal<string>;
  type_label:              Signal<string>;
  showChannelList_label:   Signal<string>;
  showChannelList_helper:  Signal<string>;

  // editor config
  colSize_label:       Signal<string>;
  colSize_placeholder: Signal<string>;
  colSize_helper:      Signal<string>;
  position_label:      Signal<string>;

  // events config
  events_title:               Signal<string>;
  events_subtitle:            Signal<string>;
  moreUrl_label:              Signal<string>;
  moreUrl_placeholder:        Signal<string>;
  moreUrl_helper:             Signal<string>;
  maxEvents_label:            Signal<string>;
  maxEvents_placeholder:      Signal<string>;
  maxEvents_helper:           Signal<string>;
  showPastEvents_label:       Signal<string>;
  showPastEvents_helper:      Signal<string>;
  showUpcomingEvents_label:   Signal<string>;
  showUpcomingEvents_helper:  Signal<string>;
  showEventTime_label:        Signal<string>;
  showEventTime_helper:       Signal<string>;
  showEventLocation_label:    Signal<string>;
  showEventLocation_helper:   Signal<string>;

  // icon config
  icon_label:             Signal<string>;
  icon_placeholder:       Signal<string>;
  icon_helper:            Signal<string>;
  iconSize_label:         Signal<string>;
  iconSize_placeholder:   Signal<string>;
  iconSize_helper:        Signal<string>;
  iconSlot_label:         Signal<string>;

  // iframe config
  iframe_title:      Signal<string>;
  style_label:       Signal<string>;
  style_placeholder: Signal<string>;
  style_helper:      Signal<string>;

  // image edit
  overlay_label:          Signal<string>;
  overlay_placeholder:    Signal<string>;
  overlay_helper:         Signal<string>;

  // images style
  image_style_title:        Signal<string>;
  imgIxParams_label:       Signal<string>;
  imgIxParams_placeholder: Signal<string>;
  imgIxParams_helper:      Signal<string>;
  sizes_label:             Signal<string>;
  sizes_placeholder:       Signal<string>;
  sizes_helper:            Signal<string>;
  borderRadius_label:       Signal<string>;
  borderRadius_placeholder: Signal<string>;
  borderRadius_helper:      Signal<string>;
  slot_label:               Signal<string>;
  imageAction_label:        Signal<string>;
  isThumbnail_label:        Signal<string>;
  isThumbnail_helper:       Signal<string>;
  fill_label:               Signal<string>;
  fill_helper:              Signal<string>;
  hasPriority_label:        Signal<string>;
  hasPriority_helper:       Signal<string>;

  // images
  empty: Signal<string>;
  as_title: Signal<string>;
  cancel: Signal<string>;
  copy_conf: Signal<string>;

  // invitations config
  invitations_title:        Signal<string>;
  invitations_subtitle:     Signal<string>;
  maxItems_label:           Signal<string>;
  maxItems_placeholder:     Signal<string>;
  maxItems_helper:          Signal<string>;
  showPastItems_label:      Signal<string>;
  showPastItems_helper:     Signal<string>;
  showUpcomingItems_label:  Signal<string>;
  showUpcomingItems_helper: Signal<string>;

  // map config
  latitude_label:                       Signal<string>;
  latitude_placeholder:                 Signal<string>;
  latitude_helper:                      Signal<string>;
  longitude_label:                      Signal<string>;
  longitude_placeholder:                Signal<string>;
  longitude_helper:                     Signal<string>;
  zoomFactor_label:                     Signal<string>;
  zoomFactor_placeholder:               Signal<string>;
  zoomFactor_helper:                    Signal<string>;
  useCurrentLocationAsCenter_label:     Signal<string>;
  useCurrentLocationAsCenter_helper:    Signal<string>;

  // people-config
  people_edit:                Signal<string>;
  title_label:                Signal<string>,
  title_placeholder:          Signal<string>,
  title_helper:               Signal<string>,
  linkedSection_label:        Signal<string>,
  linkedSection_placeholder:  Signal<string>,
  linkedSection_helper:       Signal<string>,
  peopleType_label:           Signal<string>,
  color_label:                Signal<string>,
  nameDisplay_label:          Signal<string>,
  showName_label:             Signal<string>,
  showName_helper:            Signal<string>,
  showLabel_label:            Signal<string>,
  showLabel_helper:           Signal<string>,

  // persons-widget
  people_empty:  Signal<string>;

  // responsibility-config
  bkey_label:              Signal<string>;
  bkey_placeholder:        Signal<string>;
  bkey_helper:             Signal<string>;
  showAvatar_label:        Signal<string>;
  showAvatar_helper:       Signal<string>;
  showDescription_label:   Signal<string>;
  showDescription_helper:  Signal<string>;

  // section-config
  subTitle_label:       Signal<string>;
  subTitle_placeholder: Signal<string>;
  subTitle_helper:      Signal<string>;

  // table-grid
  template_label:               Signal<string>,
  template_placeholder:         Signal<string>,
  template_helper:              Signal<string>,
  gap_label:                    Signal<string>,
  gap_placeholder:              Signal<string>,
  gap_helper:                   Signal<string>,
  backgroundColor_label:        Signal<string>,
  backgroundColor_placeholder:  Signal<string>,
  backgroundColor_helper:       Signal<string>,
  padding_label:                Signal<string>,
  padding_placeholder:          Signal<string>,
  padding_helper:               Signal<string>,
  showTitleAs_label:            Signal<string>,

  // table-body / table-header
  title: Signal<string>;
  description: Signal<string>;
  add: Signal<string>;

  // table-style
  textAlign_label:         Signal<string>,
  textAlign_placeholder:   Signal<string>,
  textAlign_helper:        Signal<string>,
  fontSize_label:          Signal<string>,
  fontSize_placeholder:    Signal<string>,
  fontSize_helper:         Signal<string>,
  textColor_label:         Signal<string>,
  textColor_placeholder:   Signal<string>,
  textColor_helper:        Signal<string>,
  border_label:            Signal<string>,
  border_placeholder:      Signal<string>,
  border_helper:           Signal<string>,
  fontWeight_label:        Signal<string>,

  // tracker-config
  tracker_title:                 Signal<string>;
  intervalInSeconds_label:       Signal<string>,
  intervalInSeconds_placeholder: Signal<string>,
  intervalInSeconds_helper:      Signal<string>,
  maximumAge_label:              Signal<string>,
  maximumAge_placeholder:        Signal<string>,
  maximumAge_helper:             Signal<string>,
  exportFormat_label:            Signal<string>,
  autostart_label:               Signal<string>,
  autostart_helper:              Signal<string>,
  enableHighAccuracy_label:      Signal<string>,
  enableHighAccuracy_helper:     Signal<string>,

  // trip-stats-config
  trip_stats_title:   Signal<string>,
  viewType_label:     Signal<string>,
  contentType_label:  Signal<string>

  // video-config
  youtubeId_label:       Signal<string>,
  youtubeId_placeholder: Signal<string>,
  youtubeId_helper:      Signal<string>,
  width_label:           Signal<string>,
  width_placeholder:     Signal<string>,
  width_helper:          Signal<string>,
  height_label:          Signal<string>,
  height_placeholder:    Signal<string>,
  height_helper:         Signal<string>,
  frameborder_label:     Signal<string>,
  frameborder_placeholder: Signal<string>,
  frameborder_helper:    Signal<string>,
  baseUrl_label:         Signal<string>,
  baseUrl_placeholder:   Signal<string>,
  baseUrl_helper:        Signal<string>
}

import { SectionConfiguration } from './section-configuration';
import { EditorConfiguration } from './editor-configuration';
import { ImageStyleConfiguration } from './image-style-configuration';
import { AlbumConfiguration } from './album-configuration';
import { IframeConfiguration } from './iframe-configuration';
import { PeopleConfiguration } from './people-configuration';
import { ResponsibilityConfiguration } from './responsibility-configuration';
import { VideoConfiguration } from './video-configuration';
import { ButtonStyleConfiguration } from './button-style-configuration';
import { ButtonActionConfiguration } from './button-action-configuration';
import { IconConfiguration } from './icon-configuration';
import { ChatConfiguration } from './chat-configuration';
import { MapConfiguration } from './map-configuration';
import { TableGridConfiguration } from './table-grid-configuration';
import { TableStyleConfiguration } from './table-style-configuration';
import { TableBody } from './table-body';
import { EventsConfiguration } from './events-configuration';
import { InvitationsConfiguration } from './invitations-configuration';
import { ImagesConfiguration } from './images-configuration';
import { TableHeader } from './table-header';
import { TrackerConfiguration } from './tracker-configuration';

@Component({
  selector: 'bk-section-form',
  standalone: true,
  imports: [
    Chips, ImageConfigEdit, NotesInput,
    SectionConfiguration, EditorConfiguration, ImageStyleConfiguration, AlbumConfiguration,
    IframeConfiguration, PeopleConfiguration, ResponsibilityConfiguration, VideoConfiguration, 
    ButtonStyleConfiguration, ButtonActionConfiguration, IconConfiguration, ChatConfiguration, 
    MapConfiguration, TrackerConfiguration, TableGridConfiguration,  TableStyleConfiguration, TableHeader, 
    TableBody, EventsConfiguration, InvitationsConfiguration, ImagesConfiguration
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <bk-section-config
        [(formData)]="formData"
        [currentUser]="currentUser()"
        [roles]="roles()"
        [states]="states()"
        [readOnly]="isReadOnly()"
        [i18n]="i18n()"
      />

      @switch (formData().type) {
        @case('album') {
          @if(albumConfig(); as albumConfig) {
            <bk-album-config
              [formData]="albumConfig" (formDataChange)="onAlbumConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }

        @case('article') {
          @if(content(); as content) {
            <bk-editor-config
              [formData]="content" (formDataChange)="onContentChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          <bk-images-config
            [images]="images()" (imagesChange)="onImagesChange($event)"
            [storagePath]="storagePath()"
            [currentUser]="currentUser()"
            [readOnly]="isReadOnly()"
            [i18n]="i18n()"
          />
          @if(imageStyle(); as imageStyle) {
            <bk-image-style
              [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }

        @case('button') {
          @if(content(); as content) {
            <bk-editor-config
              [formData]="content" (formDataChange)="onContentChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          } 
          @if(buttonActionConfig(); as buttonActionConfig) {
            <bk-button-action
              [formData]="buttonActionConfig" (formDataChange)="onButtonActionChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          @if(iconConfig(); as iconConfig) {
            <bk-icon-config
              [formData]="iconConfig" (formDataChange)="onIconConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          @if(buttonStyle(); as buttonStyle) {
            <bk-button-style
              [formData]="buttonStyle" (formDataChange)="onButtonStyleChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style
              [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('cal') {
          <!-- Calendar-specific, e.g., calendarOptions -->
        }
        @case('chart') {
          <!-- Chart-specific, e.g., chartOptions -->
        }
        @case('chat') {
          @if(chatConfig(); as chatConfig) {
            <bk-chat-config
              [formData]="chatConfig" (formDataChange)="onChatConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('events') {
          @if(eventsConfig(); as eventsConfig) {
            <bk-events-config
              [formData]="eventsConfig" (formDataChange)="onEventsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('invitations') {
          @if(invitationsConfig(); as invitationsConfig) {
            <bk-invitations-config
              [formData]="invitationsConfig" (formDataChange)="onInvitationsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('hero') {
          @if(logoConfig(); as logoConfig) {
            <bk-image-config
              [formData]="logoConfig" (formDataChange)="onImageConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          @if(heroConfig(); as heroConfig) {
            <bk-image-config
              [formData]="heroConfig" (formDataChange)="onImageConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style
              [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }

        }
        @case('iframe') {
          @if(iframeConfig(); as iframeConfig) {
            <bk-iframe-config
              [formData]="iframeConfig" (formDataChange)="onIframeConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('map') {
          @if(mapConfig(); as mapConfig) {
            <bk-map-config
              [formData]="mapConfig" (formDataChange)="onMapConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('people') {
          @if(peopleConfig(); as peopleConfig) {
              <bk-people-config
                [formData]="peopleConfig" (formDataChange)="onPeopleConfigChange($event)"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                (selectClicked)="selectPerson()"
                (groupSelectClicked)="selectGroup()"
                (responsibilitySelectClicked)="selectResponsibility()"
              />
          }
        }
        @case('responsibility') {
          @if(responsibilityConfig(); as responsibilityConfig) {
            <bk-responsibility-config
              [formData]="responsibilityConfig" (formDataChange)="onResponsibilityConfigChange($event)"
              [currentUser]="currentUser()"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
        }
        @case('slider') {
          @if(images(); as images) {
            <bk-images-config
              [images]="images" (imagesChange)="onImagesChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()" />
          }
          @if(imageStyle(); as imageStyle) {
            <bk-image-style
              [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
        }
        @case('table') {
          @if(tableGrid(); as tableGrid) {
            <bk-table-grid
              [formData]="tableGrid" (formDataChange)="onTableGridChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          @if(headerStyle(); as headerStyle) {
            <bk-table-style name="header"
              [formData]="headerStyle" (formDataChange)="onHeaderStyleChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          @if(bodyStyle(); as bodyStyle) {
            <bk-table-style name="body"
              [formData]="bodyStyle" (formDataChange)="onBodyStyleChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          <bk-table-header
            [formData]="headerData()" (formDataChange)="onTableHeaderChange($event)"
            [i18n]="i18n()"
            [readOnly]="isReadOnly()"
          />
          <bk-table-body
            [formData]="bodyData()" (formDataChange)="onTableBodyChange($event)"
            [i18n]="i18n()"
            [readOnly]="isReadOnly()"
          />
        }
        @case('tracker') {
          @if(trackerConfig(); as trackerConfig) {
            <bk-tracker-config
              [formData]="trackerConfig" (formDataChange)="onTrackerConfigChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
        }
        @case('video') {
          @if(videoConfig(); as videoConfig) {
            <bk-video-config
              [formData]="videoConfig" (formDataChange)="onVideoConfigChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
        }
      }
    
      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
      }
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    }
  `
})
/** 
 * Because vest validation is type specific and we want to have a generic section form component for all union types, we do not use vest here.
 */
export class SectionForm {
  private readonly modelSelectService = inject(ModelSelectService);

  // i18n
  public readonly i18n = input.required<SectionFormI18n>();
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));

  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly tenantId = input.required<string>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // derived linked signals
  protected sectionKey = computed(() => this.formData().bkey);
  protected directory = linkedSignal(() => this.formData().type === 'album' ? (this.formData() as any).directory ?? '' : '' );
  protected content = linkedSignal(() => this.getContent());
  protected albumConfig = linkedSignal(() => this.getAlbumConfig());
  protected images = linkedSignal(() => this.getImages());
  protected storagePath = computed(() => `tenant/${this.tenantId()}/section/${this.sectionKey()}`);
  protected imageStyle = linkedSignal(() => this.getImageStyle());
  protected buttonActionConfig = linkedSignal(() => this.getButtonActionConfig());
  protected buttonStyle = linkedSignal(() => this.getButtonStyle());
  protected iconConfig = linkedSignal(() => this.getIconConfig());
  protected chatConfig = linkedSignal(() => this.getChatConfig());
  protected eventsConfig = linkedSignal(() => this.getEventsConfig());
  protected invitationsConfig = linkedSignal(() => this.getInvitationsConfig());
  protected logoConfig = linkedSignal(() => this.getLogoConfig());
  protected heroConfig = linkedSignal(() => this.getHeroConfig());
  protected iframeConfig = linkedSignal(() => this.getIframeConfig());
  protected mapConfig = linkedSignal(() => this.getMapConfig());
  protected peopleConfig = linkedSignal(() => this.getPeopleConfig());
  protected responsibilityConfig = linkedSignal(() => this.getResponsibilityConfig());
  protected headerData = linkedSignal(() => this.getHeaderData());
  protected bodyData = linkedSignal(() => this.getBodyData());
  protected tableGrid = linkedSignal(() => this.getTableGrid());
  protected headerStyle = linkedSignal(() => this.getHeaderStyle());
  protected bodyStyle = linkedSignal(() => this.getBodyStyle());
  
  protected trackerConfig = linkedSignal(() => this.getTrackerConfig());
  protected videoConfig = linkedSignal(() => this.getVideoConfig());
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean | AvatarInfo[]): void {
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
  
  protected onSectionChange(section: SectionModel): void {
    if (section && section.type === 'article') {
    this.formData.update((vm) => ({...vm, ...section}));
    debugFormModel('SectionForm.onFormChange', this.formData(), this.currentUser());
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /************************************** property getters (section type specific) *********************************************** */
  // used by multiple sections
  private getContent(): EditorConfig | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).content || EDITOR_CONFIG_SHAPE;
      case 'people': return (this.formData() as PeopleSection).content || EDITOR_CONFIG_SHAPE;
      case 'button': return (this.formData() as ButtonSection).content || EDITOR_CONFIG_SHAPE;
      default: 
        console.log(`SectionForm.getContent: no content for section type ${this.formData().type}`);
        return undefined;
    }
  }

  private getAlbumConfig(): AlbumConfig | undefined {
    if (this.formData().type === 'album') {
      return ((this.formData() as AlbumSection).properties as AlbumConfig);
    }
  }

  private getImages(): ImageConfig[] {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.images || [];
      case 'slider': return (this.formData() as SliderSection).properties.images || [];
      default: return [];
    }
  }

  private getImageStyle(): ImageStyle | undefined {
    switch (this.formData().type) {
      case 'article': return (this.formData() as ArticleSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'button': return (this.formData() as ButtonSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'hero': return (this.formData() as HeroSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'slider': return (this.formData() as SliderSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      default: return undefined;
    }
  }

  private getButtonActionConfig(): ButtonActionConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.action);
    }
  }

  private getIconConfig(): IconConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.icon);
    }
  }

  private getButtonStyle(): ButtonStyle | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties.style);
    }
  }

  private getChatConfig(): ChatConfig | undefined {
    if (this.formData().type === 'chat') {
      return ((this.formData() as ChatSection).properties as ChatConfig);
    }
  }

  private getEventsConfig(): EventsConfig | undefined {
    if (this.formData().type === 'events') {
      return ((this.formData() as any).properties as EventsConfig);
    }
  }

  private getInvitationsConfig(): InvitationsConfig | undefined {
    if (this.formData().type === 'invitations') {
      return ((this.formData() as any).properties as InvitationsConfig);
    }
  }

  private getLogoConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.logo || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getHeroConfig(): ImageConfig | undefined {
    switch (this.formData().type) {
      case 'hero': return (this.formData() as HeroSection).properties.hero || IMAGE_CONFIG_SHAPE;
      default: return undefined;
    }
  }

  private getIframeConfig(): IframeConfig | undefined {
    if (this.formData().type === 'iframe') {
      return ((this.formData() as IframeSection).properties as IframeConfig);
    }
  }

  private getMapConfig(): MapConfig | undefined {  
    if (this.formData().type === 'map') {
      return ((this.formData() as MapSection).properties as MapConfig);
    }
  }

  private getPeopleConfig(): PeopleConfig | undefined {
    if (this.formData().type === 'people') {
      return ((this.formData() as PeopleSection).properties as PeopleConfig);
    }
  }

  private getResponsibilityConfig(): ResponsibilityConfig | undefined {
    if (this.formData().type === 'responsibility') {
      return ((this.formData() as ResponsibilitySection).properties as ResponsibilityConfig);
    }
  }

  private getHeaderData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.header as string[]) || [];
    }
    return [];
  }

  private getBodyData(): string[] {
    if (this.formData().type === 'table') {
      return ((this.formData() as TableSection).properties.data?.body as string[]) || [];
    }
    return [];
  }

  private getTableGrid(): TableGrid | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.grid as TableGrid);
    }
  }

  private getHeaderStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.header as TableStyle);
    }
  }

  private getBodyStyle(): TableStyle | undefined {  
    if (this.formData().type === 'table') {
      return ((this.formData() as any).properties.body as TableStyle);
    }
  }

  private getTrackerConfig(): TrackerConfig | undefined {  
    if (this.formData().type === 'tracker') {
      return ((this.formData() as TrackerSection).properties as TrackerConfig);
    }
  }

  private getVideoConfig(): VideoConfig | undefined {
    if (this.formData().type === 'video') {
      return ((this.formData() as VideoSection).properties as VideoConfig);
    }
  }

  /************************************** property setters (section type specific) *********************************************** */
  protected onContentChange(content: EditorConfig): void {
    this.formData.set({ ...this.formData(), content: content });
  }

  protected onImagesChange(images: ImageConfig[]): void {
    const section = this.formData();
    if (section.type === 'article') {
      this.formData.set({ ...section, properties: { ...section.properties, images } } as ArticleSection);
    } else if (section.type === 'slider') {
      this.formData.set({ ...section, properties: { ...section.properties, images } } as SliderSection);
    }
  }

  protected onImageConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'article') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, image }
      } as ArticleSection);
    }
  }


  protected onLogoConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, logo: image }
      } as HeroSection);
    }
  }

  protected onHeroConfigChange(image: ImageConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, hero: image }
      } as HeroSection);
    }
  }

  protected onImageStyleChange(imageStyle: ImageStyle): void {
    const section = this.formData();
    switch (section.type) {
      case 'article':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ArticleSection);
        break;
      case 'button':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as ButtonSection);
        break;
      case 'hero':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as HeroSection);
        break;
      case 'slider':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as SliderSection);
        break;
    }
  }

  protected onAlbumConfigChange(config: AlbumConfig): void {
    const section = this.formData();
    if (section.type === 'album') {
      this.formData.set({
        ...section,
        properties: config
      } as AlbumSection);
    }
  }

  protected onButtonActionChange(config: ButtonActionConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, action: config }
      } as ButtonSection);
    }
  }

  protected onButtonStyleChange(config: ButtonStyle): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, style: config }
      } as ButtonSection);
    }
  }

  protected onIconConfigChange(config: IconConfig): void {
    const section = this.formData();
    if (section.type === 'button') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, icon: config }
      } as ButtonSection);
    }
  }

  protected onChatConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'chat') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onEventsConfigChange(config: EventsConfig): void {
    const section = this.formData();
    if (section.type === 'events') {
      this.formData.set({
        ...section,
        properties: config
      } as EventsSection);
    }
  }

  protected onInvitationsConfigChange(config: InvitationsConfig): void {
    const section = this.formData();
    if (section.type === 'invitations') {
      this.formData.set({
        ...section,
        properties: config
      } as InvitationsSection);
    }
  }

  protected onIframeConfigChange(config: IframeConfig): void {
    const section = this.formData();
    if (section.type === 'iframe') {
      this.formData.set({
        ...section,
        properties: config
      } as IframeSection);
    }
  }

  protected onMapConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'map') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onPeopleConfigChange(config: PeopleConfig): void {
    const section = this.formData();
    if (section.type === 'people') {
      this.formData.set({ ...section, properties: config } as PeopleSection);
    }
  }

  protected onResponsibilityConfigChange(config: ResponsibilityConfig): void {
    const section = this.formData();
    if (section.type === 'responsibility') {
      this.formData.set({ ...section, properties: config } as ResponsibilitySection);
    }
  }

  protected onTableHeaderChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, header: data } }
      } as TableSection);
    }
  }

  protected onTableBodyChange(data: string[]): void {
    const section = this.formData();
    if (section.type === 'table') {
      const currentData = section.properties.data || { header: [], values: [] };
      this.formData.set({
        ...section,
        properties: { ...section.properties, data: { ...currentData, body: data } }
      } as TableSection);
    }
  }

  protected onTableGridChange(config: TableGrid): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, grid: config }
      } as TableSection);
    }
  }

  protected onHeaderStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, header: config }
      } as TableSection);
    }
  }

  protected onBodyStyleChange(config: TableStyle): void {
    const section = this.formData();
    if (section.type === 'table') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, body: config }
      } as TableSection);
    }
  }

  protected onTrackerConfigChange(config: any): void {
    const section = this.formData();
    if (section.type === 'tracker') {
      this.formData.set({
        ...section,
        properties: config
      } as any);
    }
  }

  protected onVideoConfigChange(config: VideoConfig): void {
    const section = this.formData();
    if (section.type === 'video') {
      this.formData.set({
        ...section,
        properties: config
      } as VideoSection);
    }
  }

  /************************************** select person *********************************************** */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
    if (avatar) {
      const currentConfig = this.peopleConfig();
      this.onPeopleConfigChange({
        ...currentConfig,
        persons: [...(currentConfig?.persons ?? []), avatar] } as PeopleConfig
      );
    }
  }

  public async selectGroup(): Promise<void> {
    const group = await this.modelSelectService.selectGroup();
    if (group) {
      this.onPeopleConfigChange({ ...this.peopleConfig(), groupId: group.bkey } as PeopleConfig);
    }
  }

  public async selectResponsibility(): Promise<void> {
    const responsibility = await this.modelSelectService.selectResponsibility();
    if (responsibility) {
      this.onPeopleConfigChange({ ...this.peopleConfig(), responsibilityId: responsibility.bkey } as PeopleConfig);
    }
  }
}