import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';

import { AccordionConfig, AccordionSection, ColorIonic, ConnectionsConfig, ConnectionsSection, DeparturesConfig, DeparturesSection, EnergyConfig, EnergySection, CounterConfig, CounterSection, ContactConfig, ContactSection, FooterConfig, FooterSection, FORM_SECTION_CONFIG_SHAPE, FormSection, FormSectionConfig, AlbumConfig, AlbumSection, SectionFeedback, ArticleSection, ArticleSlideshow, AvatarInfo, ButtonActionConfig, ButtonSection, ButtonStyle, CalendarSection, CategoryListModel, ChartSection, ChatConfig, ChatSection, EDITOR_CONFIG_SHAPE, MemberAgeSection, MemberCatConfig, MemberCatSection, RagConfig, RagSection, EditorConfig, CourseConfig, CourseSection, EventsConfig, EventsSection, HeroConfig, HeroSection, IconConfig, IframeConfig, IframeSection, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, InvitationsConfig, InvitationsSection, JournalTrackConfig, JournalTrackSection, MapConfig, MapSection, PeopleConfig, peopleHiddenKeys, PeopleSection, ResponsibilityConfig, ResponsibilitySection, RoleName, SankeyConfig, SankeySection, SpiderConfig, SpiderSection, TocConfig, TocSection, TestimonialConfig, TestimonialSection, TilesConfig, TilesSection, NewsConfig, NewsSection, SectionCta, TimelineConfig, TimelineSection, AdventConfig, AdventSection, SectionModel, SectionModelName, SliderSection, TableGrid, TableSection, TableStyle, TrackerConfig, TrackerSection, UserModel, VideoConfig, VideoSection, WeatherConfig, WeatherSection, articleBlocksOf } from '@okr/shared-models';
import { Chips, ErrorNote, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { coerceBoolean, debugFormModel, hasRole, resolveImageStyle } from '@okr/shared-util-core';
import { DEFAULT_LABEL, DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { IonItem, IonLabel, IonNote, IonSegment, IonSegmentButton, IonToggle } from '@ionic/angular';
import { addPeoplePerson, addPeopleResponsibility, hidePeoplePerson, setPeopleGroup, setPeopleResponsibilityParent, ARTICLE_TAB_FIELDS, ChartOption, ContactDetails, getErrorSegments, getInlineErrorFields, getJournalInlineErrorFields, getRemainingErrors, isJournalModeField, JOURNAL_VIDEO_CLIPS_MAX, SectionErrors, SectionI18n, validateSection } from '@okr/cms-section-util';
import { FormI18n } from '@okr/forms-util';

import { SectionConfigPart, SectionConfiguration } from './section-configuration';
import { SectionAddChip, SectionAddChips } from './section-add-chips';
import { EditorConfiguration } from './editor-configuration';
import { ImageStyleConfiguration } from './image-style-configuration';
import { ArticleImagesConfiguration } from './article-images-configuration';
import { AlbumConfiguration } from './album-configuration';
import { FeedbackConfiguration } from './feedback-configuration';
import { JournalMapConfiguration } from './journal-map-configuration';
import { JournalTrackConfiguration } from './journal-track-configuration';
import { IframePanel } from './iframe-panel';
import { WeatherConfiguration, WeatherLocationOption } from './weather-configuration';
import { ConnectionsConfiguration } from './connections-configuration';
import { DeparturesConfiguration } from './departures-configuration';
import { EnergyConfiguration } from './energy-configuration';
import { CounterConfiguration } from './counter-configuration';
import { ContactConfiguration } from './contact-configuration';
import { FooterConfiguration } from './footer-configuration';
import { ContractOption } from './button-action-configuration';
import { PeopleConfiguration } from './people-configuration';
import { ResponsibilityConfiguration } from './responsibility-configuration';
import { VideoPanel } from './video-panel';
import { ButtonConfiguration } from './button-configuration';
import { ChatConfiguration } from './chat-configuration';
import { CalendarConfiguration, CalendarDisplayOptions } from './calendar-configuration';
import { ChartConfiguration } from './chart-configuration';
import { MemberConfiguration } from './member-configuration';
import { RagConfiguration } from './rag-configuration';
import { MapConfiguration } from './map-configuration';
import { TableGridConfiguration } from './table-grid-configuration';
import { TableStyleConfiguration } from './table-style-configuration';
import { TableBody } from './table-body';
import { EventsConfiguration } from './events-configuration';
import { CourseConfiguration } from './course-configuration';
import { InvitationsConfiguration } from './invitations-configuration';
import { ImagesConfiguration } from './images-configuration';
import { TableHeader } from './table-header';
import { TrackerConfiguration } from './tracker-configuration';
import { SankeyConfiguration } from './sankey-configuration';
import { SpiderConfiguration } from './spider-configuration';
import { TocConfiguration } from './toc-configuration';
import { AccordionConfiguration } from './accordion-configuration';
import { TestimonialConfiguration } from './testimonial-configuration';
import { TilesConfiguration } from './tiles-configuration';
import { NewsConfiguration } from './news-configuration';
import { CtaConfiguration } from './cta-configuration';
import { HeroLogoConfiguration } from './hero-logo-configuration';
import { HeroConfiguration } from './hero-configuration';
import { TimelineConfiguration } from './timeline-configuration';
import { AdventConfiguration } from './advent-configuration';
import { CourseOption, FormOption, FormSectionConfiguration, ResponsibilityOption } from './form-section-configuration';

@Component({
  selector: 'okr-section-form',
  standalone: true,
  imports: [
    IonItem, IonToggle, IonSegment, IonSegmentButton, IonLabel, IonNote, SectionAddChips,
    Chips, TextareaInput, ErrorNote,
    SectionConfiguration, EditorConfiguration, ImageStyleConfiguration, ArticleImagesConfiguration, AlbumConfiguration,
    IframePanel, WeatherConfiguration, ConnectionsConfiguration, DeparturesConfiguration, EnergyConfiguration, CounterConfiguration, ContactConfiguration, FooterConfiguration, PeopleConfiguration, ResponsibilityConfiguration, VideoPanel,
    ButtonConfiguration, ChatConfiguration,
    MapConfiguration, TrackerConfiguration, TableGridConfiguration,  TableStyleConfiguration, TableHeader,
    TableBody, EventsConfiguration, CourseConfiguration, InvitationsConfiguration, ImagesConfiguration, CalendarConfiguration, ChartConfiguration,
    MemberConfiguration, RagConfiguration, FormSectionConfiguration, SankeyConfiguration, SpiderConfiguration, TocConfiguration, TestimonialConfiguration, TimelineConfiguration, AdventConfiguration,
    AccordionConfiguration, TilesConfiguration, NewsConfiguration, CtaConfiguration, HeroConfiguration, HeroLogoConfiguration, FeedbackConfiguration, JournalMapConfiguration, JournalTrackConfiguration
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .article-tabs { padding: 8px 16px 0; }
    .error-dot { display: inline-block; width: 8px; height: 8px; margin-inline-start: 6px; border-radius: 50%; background: var(--ion-color-danger); vertical-align: middle; }
  `],
  template: `
    @if (showForm()) {
      <!-- a button section has no advanced toggle: all its settings are always shown;
           an article has two tabs instead (spec 1.171): «Inhalt» and «Darstellung» -->
      @if (articleTabs()) {
        <ion-segment class="article-tabs" [value]="articleTab()" (ionChange)="onArticleTabChange($event.detail.value)">
          <ion-segment-button value="content">
            <ion-label>{{ i18n().article_tab_content() }}@if (tabHasErrors('content')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="appearance">
            <ion-label>{{ i18n().article_tab_appearance() }}@if (tabHasErrors('appearance')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
        </ion-segment>
      } @else if (!journalMode() && formData().type !== 'button') {
        <ion-item lines="none">
          <ion-toggle [checked]="advancedToggle()" (ionChange)="advancedToggle.set($event.detail.checked)" [disabled]="isReadOnly()">
            {{ i18n().form_advanced_label() }}
          </ion-toggle>
        </ion-item>
      }

      <!-- journal mode: a hero's title comes from the footprint (plan decision 9), so it has no title field -->
      @if (!journalMode() || formData().type !== 'hero') {
        <okr-section-config
          [(formData)]="formData"
          [currentUser]="currentUser()"
          [roles]="roles()"
          [states]="states()"
          [readOnly]="isReadOnly()"
          [i18n]="i18n()"
          [showAdvanced]="showAdvanced()"
          [journalMode]="journalMode()"
          [part]="sectionConfigPart()"
          [errors]="errors()"
        />
      }

      @if (journalMode()) {
        <!--
          Travel journal (spec 1.154 §2): only what the change record carries — the title above, the text and
          the properties of journalModeSectionFields. Photos and clips come from the journal's picker
          (SECTION_IMAGE_PICKER), never from a folder, an upload or a url.
        -->
        @switch (formData().type) {
          @case('hero') {
            @if(journalField('hero')) {
              <okr-images-config
                [images]="heroCover()" (imagesChange)="onHeroCoverChange($event)"
                [multiple]="false"
                [title]="i18n().journal_cover()"
                [emptyText]="i18n().journal_empty()"
                [requirePicker]="true"
                [storagePath]="storagePath()"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
              />
            }
            @if(heroProperties(); as heroProperties) {
              <okr-hero-config
                [formData]="heroProperties" (formDataChange)="onHeroPropertiesChange($event)"
                [journalMode]="true"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
              />
            }
          }
          @case('article') {
            @if(content(); as content) {
              <okr-editor-config
                [formData]="content" (formDataChange)="onContentChange($event)"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [showAdvanced]="false"
                [showLayout]="false"
              />
            }
            <!-- the «Bilder» card: Auswahl (journal picker) and Layout (layout picker, caption); no Styles (decision 8) -->
            @if(journalField('images')) {
              @if(imageStyle(); as imageStyle) {
                <okr-article-images-config
                  [images]="images()" (imagesChange)="onImagesChange($event)"
                  [imageStyle]="imageStyle" (imageStyleChange)="onImageStyleChange($event)"
                  [imageLayout]="imageLayout()" (imageLayoutChange)="onImageLayoutChange($event)"
                  [journalMode]="true"
                  [emptyText]="i18n().journal_empty()"
                  [storagePath]="storagePath()"
                  [currentUser]="currentUser()"
                  [readOnly]="isReadOnly()"
                  [i18n]="i18n()"
                  [errors]="errors()"
                />
              }
            }
          }
          @case('album') {
            @if(journalField('images')) {
              <okr-images-config
                [images]="albumImages()" (imagesChange)="onAlbumImagesChange($event)"
                [title]="i18n().journal_photos()"
                [emptyText]="i18n().journal_empty()"
                [requirePicker]="true"
                [storagePath]="storagePath()"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
              />
            }
          }
          @case('video') {
            @if(journalField('clips')) {
              <okr-images-config
                [images]="videoClips()" (imagesChange)="onVideoClipsChange($event)"
                kind="video"
                [max]="clipsMax"
                [title]="i18n().journal_clips()"
                [emptyText]="i18n().journal_empty()"
                [requirePicker]="true"
                [storagePath]="storagePath()"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
              />
              <okr-error-note [errors]="errors()['clips'] ?? []" />
            }
          }
          @case('map') {
            @if(mapConfig(); as mapConfig) {
              <okr-journal-map-config
                [formData]="mapConfig" (formDataChange)="onMapConfigChange($event)"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
              />
            }
          }
          @case('track') {
            @if(trackConfig(); as trackConfig) {
              <okr-journal-track-config
                [formData]="trackConfig" (formDataChange)="onTrackConfigChange($event)"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
              />
            }
          }
        }
        <!-- «Kommentare & Reaktionen» (spec 1.154 §7): not on the hero; the image toggles only on article and album -->
        @if (formData().type !== 'hero') {
          <okr-feedback-config
            [feedback]="formData().feedback"
            (feedbackChange)="onFeedbackChange($event)"
            [showImages]="formData().type === 'article' || formData().type === 'album'"
            [readOnly]="isReadOnly()"
            [i18n]="i18n()"
          />
        }
      } @else {
      @switch (formData().type) {
        @case('album') {
          @if(albumConfig(); as albumConfig) {
            <okr-album-config
              [formData]="albumConfig" (formDataChange)="onAlbumConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [albumStyles]="albumStyles()"
              [errors]="errors()"
            />
          }
        }

        @case('article') {
          <!-- two tabs (spec 1.171): «Inhalt» = text, images and button; «Darstellung» = layout and image style -->
          @if (isBlockArticle()) {
            <!-- an article with blocks (spec 1.173): its text, images and button cannot be edited here -->
            @if (articleTab() === 'content') {
              <ion-item lines="none"><ion-note>{{ i18n().article_blocks_readonly() }}</ion-note></ion-item>
            }
          } @else {
            @if(content(); as content) {
              @if (articleTab() === 'content') {
                <okr-editor-config
                  [formData]="content" (formDataChange)="onContentChange($event)"
                  [readOnly]="isReadOnly()"
                  [i18n]="i18n()"
                  [showAdvanced]="showAdvanced()"
                  [showLayout]="false"
                />
              }
              @if(imageStyle(); as imageStyle) {
                <okr-article-images-config
                  [mode]="articleTab() === 'content' ? 'select' : 'appearance'"
                  [images]="images()" (imagesChange)="onImagesChange($event)"
                  [imageStyle]="imageStyle" (imageStyleChange)="onImageStyleChange($event)"
                  [imageLayout]="imageLayout()" (imageLayoutChange)="onImageLayoutChange($event)"
                  [content]="content" (contentChange)="onContentChange($event)"
                  [slideshow]="slideshow()" (slideshowChange)="onSlideshowChange($event)"
                  [showAdvanced]="showAdvanced()"
                  [storagePath]="storagePath()"
                  [currentUser]="currentUser()"
                  [readOnly]="isReadOnly()"
                  [i18n]="i18n()"
                  [errors]="errors()"
                />
              }
            }
            @if (articleTab() === 'content') {
              <!-- the button: a «+» chip until the article has one (3 of 209 articles use it, spec 1.171 §2) -->
              @if (showArticleCta()) {
                <okr-cta-config
                  [formData]="articleCtas()" (formDataChange)="onArticleCtasChange($event)"
                  [max]="1"
                  errorKey="cta"
                  [readOnly]="isReadOnly()"
                  [i18n]="i18n()"
                  [errors]="errors()"
                />
              } @else {
                <okr-section-add-chips [chips]="articleCtaChip()" [label]="i18n().article_add_label()" [readOnly]="isReadOnly()" (add)="articleCtaOpened.set(true)" />
              }
            }
          }
        }

        @case('button') {
          @if(content(); as content) {
            <okr-editor-config
              [formData]="content" (formDataChange)="onContentChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [showAdvanced]="showAdvanced()"
            />
          }
          <!-- one card with the Button / Icon / Aktion segments, always shown (no advanced toggle) -->
          <okr-button-config
            [style]="buttonStyle()" (styleChange)="onButtonStyleChange($event)"
            [icon]="iconConfig()" (iconChange)="onIconConfigChange($event)"
            [action]="buttonActionConfig()" (actionChange)="onButtonActionChange($event)"
            [contracts]="contracts()"
            [readOnly]="isReadOnly()"
            [i18n]="i18n()"
            [errors]="errors()"
          />
        }
        @case('cal') {
          @if(calendarConfig(); as calendarConfig) {
            <okr-calendar-config
              [formData]="calendarConfig" (formDataChange)="onCalendarConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('chart') {
          @if(chartConfig(); as chartConfig) {
            <okr-chart-config
              [formData]="chartConfig" (formDataChange)="onChartConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('chat') {
          @if(chatConfig(); as chatConfig) {
            <okr-chat-config
              [formData]="chatConfig" (formDataChange)="onChatConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('form') {
          @if(formConfig(); as formConfig) {
            @if(formI18n(); as formI18n) {
              <okr-form-section-config
                [formData]="formConfig" (formDataChange)="onFormConfigChange($event)"
                [forms]="forms()"
                [courses]="courses()"
                [responsibilities]="responsibilities()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [formI18n]="formI18n"
                [errors]="errors()"
                (responsibilitySelectClicked)="selectFormResponsibility()"
                (openFormClicked)="openFormClicked.emit($event)"
              />
            }
          }
        }
        @case('events') {
          @if(eventsConfig(); as eventsConfig) {
            <okr-events-config
              [formData]="eventsConfig" (formDataChange)="onEventsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('course') {
          @if(courseConfig(); as courseConfig) {
            <okr-course-config
              [formData]="courseConfig" (formDataChange)="onCourseConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('invitations') {
          @if(invitationsConfig(); as invitationsConfig) {
            <okr-invitations-config
              [formData]="invitationsConfig" (formDataChange)="onInvitationsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('hero') {
          <!-- the Hero card (cover image, imgix parameters, height, focus), the optional Logo card and the Buttons -->
          @if(heroProperties(); as heroProperties) {
            <okr-hero-config
              [formData]="heroProperties" (formDataChange)="onHeroPropertiesChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
            <okr-hero-logo-config
              [formData]="heroProperties" (formDataChange)="onHeroPropertiesChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
          <okr-cta-config
            [formData]="heroCtas()" (formDataChange)="onHeroCtasChange($event)"
            [max]="2"
            errorKey="ctas"
            [readOnly]="isReadOnly()"
            [i18n]="i18n()"
            [errors]="errors()"
          />
        }
        @case('weather') {
          @if(weatherConfig(); as weatherConfig) {
            <okr-weather-config
              [formData]="weatherConfig" (formDataChange)="onWeatherConfigChange($event)"
              [readOnly]="isReadOnly()"
              [locations]="weatherLocations()"
              [i18n]="i18n()"
            />
          }
        }
        @case('connections') {
          @if(connectionsConfig(); as connectionsConfig) {
            <okr-connections-config
              [formData]="connectionsConfig" (formDataChange)="onConnectionsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [locations]="weatherLocations()"
              [i18n]="i18n()"
            />
          }
        }
        @case('departures') {
          @if(departuresConfig(); as departuresConfig) {
            <okr-departures-config
              [formData]="departuresConfig" (formDataChange)="onDeparturesConfigChange($event)"
              [readOnly]="isReadOnly()"
              [locations]="weatherLocations()"
              [i18n]="i18n()"
            />
          }
        }
        @case('energy') {
          @if(energyConfig(); as energyConfig) {
            <okr-energy-config
              [formData]="energyConfig" (formDataChange)="onEnergyConfigChange($event)"
              [readOnly]="isReadOnly()"
              [locations]="energyLocations()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('contact') {
          @if(contactConfig(); as contactConfig) {
            <okr-contact-config
              [formData]="contactConfig" (formDataChange)="onContactConfigChange($event)"
              [details]="contactDetails()"
              [title]="formData().title ?? ''"
              [subTitle]="formData().subTitle ?? ''"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
              (orgSelectClicked)="selectContactOrg()"
              (personSelectClicked)="selectContactPerson()"
            />
          }
        }
        @case('counter') {
          @if(counterConfig(); as counterConfig) {
            <okr-counter-config
              [formData]="counterConfig" (formDataChange)="onCounterConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('footer') {
          @if(footerConfig(); as footerConfig) {
            <okr-footer-config
              [formData]="footerConfig" (formDataChange)="onFooterConfigChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [tenantId]="tenantId()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('iframe') {
          @if(iframeConfig(); as iframeConfig) {
            <okr-iframe-panel
              [config]="iframeConfig" (configChange)="onIframeConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('map') {
          @if(mapConfig(); as mapConfig) {
            <okr-map-config
              [formData]="mapConfig" (formDataChange)="onMapConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('people') {
          @if(peopleConfig(); as peopleConfig) {
              <okr-people-config
                [formData]="peopleConfig" (formDataChange)="onPeopleConfigChange($event)"
                [currentUser]="currentUser()"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
                (selectClicked)="selectPerson()"
                (groupSelectClicked)="selectGroup()"
                (excludeSelectClicked)="selectExcludedPerson()"
                (responsibilitySelectClicked)="selectResponsibility()"
                (responsibilityParentSelectClicked)="selectResponsibilityParent()"
              />
          }
        }
        @case('responsibility') {
          @if(responsibilityConfig(); as responsibilityConfig) {
            <okr-responsibility-config
              [formData]="responsibilityConfig" (formDataChange)="onResponsibilityConfigChange($event)"
              [currentUser]="currentUser()"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
        }
        @case('slider') {
          @if(images(); as images) {
            <okr-images-config
              [images]="images" (imagesChange)="onImagesChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
              [errors]="errors()" />
          }
          @if(showAdvanced()) {
            @if(imageStyle(); as imageStyle) {
              <okr-image-style
                [formData]="imageStyle" (formDataChange)="onImageStyleChange($event)"
                [i18n]="i18n()"
                [readOnly]="isReadOnly()"
                [showAdvanced]="showAdvanced()"
                [errors]="errors()"
              />
            }
          }
        }
        @case('table') {
          @if(tableGrid(); as tableGrid) {
            <okr-table-grid
              [formData]="tableGrid" (formDataChange)="onTableGridChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          @if(headerStyle(); as headerStyle) {
            <okr-table-style name="header"
              [formData]="headerStyle" (formDataChange)="onHeaderStyleChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          @if(bodyStyle(); as bodyStyle) {
            <okr-table-style name="body"
              [formData]="bodyStyle" (formDataChange)="onBodyStyleChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
            />
          }
          <okr-table-header
            [formData]="headerData()" (formDataChange)="onTableHeaderChange($event)"
            [i18n]="i18n()"
            [readOnly]="isReadOnly()"
          />
          <okr-table-body
            [formData]="bodyData()" (formDataChange)="onTableBodyChange($event)"
            [i18n]="i18n()"
            [readOnly]="isReadOnly()"
          />
        }
        @case('tracker') {
          @if(trackerConfig(); as trackerConfig) {
            <okr-tracker-config
              [formData]="trackerConfig" (formDataChange)="onTrackerConfigChange($event)"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
              [errors]="errors()"
            />
          }
        }
        @case('video') {
          @if(videoConfig(); as videoConfig) {
            <okr-video-panel
              [config]="videoConfig" (configChange)="onVideoConfigChange($event)"
              [linkOrigins]="linkOrigins()"
              [i18n]="i18n()"
              [readOnly]="isReadOnly()"
              [errors]="errors()"
            />
          }
        }
        @case('member-age') {
          @if(memberConfig(); as memberConfig) {
            <okr-member-config
              [formData]="memberConfig" (formDataChange)="onMemberConfigChange($event)"
              [showCategoryFilter]="false"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('member-cat') {
          @if(memberConfig(); as memberConfig) {
            <okr-member-config
              [formData]="memberConfig" (formDataChange)="onMemberConfigChange($event)"
              [showCategoryFilter]="true"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('sankey') {
          @if(sankeyConfig(); as sankeyConfig) {
            <okr-sankey-config
              [formData]="sankeyConfig" (formDataChange)="onSankeyConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('spider') {
          @if(spiderConfig(); as spiderConfig) {
            <okr-spider-config
              [formData]="spiderConfig" (formDataChange)="onSpiderConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('testimonial') {
          @if(testimonialConfig(); as testimonialConfig) {
            <okr-testimonial-config
              [formData]="testimonialConfig" (formDataChange)="onTestimonialConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('tiles') {
          @if(tilesConfig(); as tilesConfig) {
            <okr-tiles-config
              [formData]="tilesConfig" (formDataChange)="onTilesConfigChange($event)"
              [color]="formData().color" (colorChange)="onSectionColorChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('news') {
          @if(newsConfig(); as newsConfig) {
            <okr-news-config
              [formData]="newsConfig" (formDataChange)="onNewsConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('advent') {
          @if(adventConfig(); as adventConfig) {
            <okr-advent-config
              [formData]="adventConfig" (formDataChange)="onAdventConfigChange($event)"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [tenantId]="tenantId()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
        @case('timeline') {
          @if(timelineConfig(); as timelineConfig) {
            <okr-timeline-config
              [formData]="timelineConfig" (formDataChange)="onTimelineConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('accordion') {
          @if(accordionConfig(); as accordionConfig) {
            <okr-accordion-config
              [formData]="accordionConfig" (formDataChange)="onAccordionConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('toc') {
          @if(tocConfig(); as tocConfig) {
            <okr-toc-config
              [formData]="tocConfig" (formDataChange)="onTocConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
        @case('rag') {
          @if(ragConfig(); as ragConfig) {
            <okr-rag-config
              [formData]="ragConfig" (formDataChange)="onRagConfigChange($event)"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
          }
        }
      }
      }

      <!--
        Fallback list: every field the configuration components render shows its own error
        inline (see getInlineErrorFields). What is left here are generated fields (okey,
        index), fields hidden behind the advanced toggle, and fields a suite validates but
        the form does not offer for editing — they would otherwise fail silently.
      -->
      @if(!isReadOnly() && remainingErrors().length > 0) {
        @for(error of remainingErrors(); track error.field) {
          <okr-error-note [errors]="error.messages" />
        }
      }

      @if(showAdvanced() && !journalMode() && (!articleTabs() || articleTab() === 'appearance')) {
        @if(hasRole('privileged')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
        }
        @if(hasRole('admin')) {
          <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      }
    }
  `
})
/**
 * Generic form for all section union types. Validation is type-specific: the active vest
 * suite is picked at runtime from `formData().type` via the section validation registry.
 * Invalid fields surface through `<okr-error-note>` and the form emits its `valid` state.
 */
export class SectionForm {
  private readonly modelSelectService = inject(MODEL_SELECTOR);

  // outputs
  public readonly valid = output<boolean>();
  /** form section: open the form builder for this form key (the modal owns the builder) */
  public readonly openFormClicked = output<string>();

  // validation (per-type suite, picked from formData().type)
  /** handed to every configuration child so each field can show its own error note */
  protected readonly errors = computed(() => this.validationResult().getErrors() as SectionErrors);
  /** errors of fields that no child renders — shown at the end of the form */
  protected readonly remainingErrors = computed(() =>
    getRemainingErrors(this.errors(), this.journalMode()
      ? getJournalInlineErrorFields(this.formData().type)
      : getInlineErrorFields(this.formData().type, this.showAdvanced()))
  );

  constructor() {
    effect(() => this.valid.emit(this.sectionForm().valid()));
  }

  // i18n
  public readonly i18n = input.required<SectionI18n>();
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as TextareaInputI18n));

  // inputs
  public formData = model.required<SectionModel>();
  public currentUser = input.required<UserModel>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly albumStyles = input.required<CategoryListModel>();
  public readonly tenantId = input.required<string>();
  /** App origins for album video links: [0] builds the shown link, all are accepted when pasted (AppStore.appLinkOrigins). */
  public readonly linkOrigins = input<string[]>([]);
  public readonly readOnly = input(true);
  /** Locations offered by the weather configuration. Empty for every other section type. */
  public readonly weatherLocations = input<WeatherLocationOption[]>([]);
  /** Municipalities (type `city`) offered by the energy configuration. Empty for every other section type. */
  public readonly energyLocations = input<WeatherLocationOption[]>([]);
  /** contracts a ContractDocument button may point at (spec 1.97); loaded by the modal for contract staff only */
  public readonly contracts = input<ContractOption[]>([]);
  /** Forms a form section may point at, with their implicit fields. Empty for every other section type. */
  public readonly forms = input<FormOption[]>([]);
  /** Courses a form section may fix for a course form (D-W4). Empty for every other section type. */
  public readonly courses = input<CourseOption[]>([]);
  /** form section: the tenant's responsibilities, to show the chosen one by name */
  public readonly responsibilities = input<ResponsibilityOption[]>([]);
  /** The forms keys, for the acceptance card of a form section. Unset for every other section type. */
  public readonly formI18n = input<FormI18n | undefined>(undefined);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /**
   * Travel journal (spec 1.154 §2): the form shows only what the journal's change record carries (the title,
   * the text and the properties of journalModeSectionFields); photos and clips come from SECTION_IMAGE_PICKER.
   */
  public readonly journalMode = input(false);
  /** contact section: the chosen organization and person, resolved from the address book by the feature layer */
  public readonly contactDetails = input<ContactDetails>({});

  // The per-type suite is picked at runtime from formData().type (validateSection), so the
  // bridge calls the registry through a closure; validateSection takes no field argument.
  // A form section needs the implicit fields of the form it points at: their values are required (see
  // formSectionValidations). Read inside the closure, so the validation re-runs when the forms arrive.
  private readonly chosenImplicitFields = computed(() => {
    const model = this.formData();
    const formKey = model.type === 'form' ? (model as FormSection).properties?.formKey : undefined;
    return formKey ? this.forms().find((f) => f.formKey === formKey)?.implicitFields : undefined;
  });
  private readonly suiteWithContext = (model: SectionModel) =>
    validateSection(model, { formImplicitFields: this.chosenImplicitFields() });
  protected readonly sectionForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));
  private readonly validationResult = vestErrors(this.sectionForm);

  // derived read-only mirrors of formData (every change is written back to formData)
  protected sectionKey = computed(() => this.formData().okey);
  protected directory = computed(() => this.formData().type === 'album' ? (this.formData() as any).directory ?? '' : '' );
  protected content = computed(() => this.getContent());
  protected albumConfig = computed(() => this.getAlbumConfig());
  protected images = computed(() => this.getImages());
  protected storagePath = computed(() => `tenant/${this.tenantId()}/section/${this.sectionKey()}`);
  protected imageStyle = computed(() => this.getImageStyle());
  /** the article's image layout id; undefined = slider (spec 1.154 §5) */
  protected imageLayout = computed(() => {
    const section = this.formData();
    return section.type === 'article' ? section.properties?.imageLayout : undefined;
  });
  /** the article's slideshow; undefined = swipe carousel */
  protected slideshow = computed(() => {
    const section = this.formData();
    return section.type === 'article' ? section.properties?.slideshow : undefined;
  });
  protected buttonActionConfig = computed(() => this.getButtonActionConfig());
  protected buttonStyle = computed(() => this.getButtonStyle());
  protected iconConfig = computed(() => this.getIconConfig());
  protected chatConfig = computed(() => this.getChatConfig());
  protected formConfig = computed(() => this.getFormConfig());
  protected calendarConfig = computed(() => this.getCalendarConfig());
  protected chartConfig = computed(() => this.getChartConfig());
  protected sankeyConfig = computed(() => this.getSankeyConfig());
  protected spiderConfig = computed(() => this.getSpiderConfig());
  protected tocConfig = computed(() => this.getTocConfig());
  protected accordionConfig = computed(() => this.getAccordionConfig());
  protected testimonialConfig = computed(() => this.getTestimonialConfig());
  protected tilesConfig = computed(() => this.getTilesConfig());
  protected newsConfig = computed(() => this.getNewsConfig());
  /** the whole hero config, for the overlay / height / focus card */
  protected heroProperties = computed<HeroConfig | undefined>(() => {
    const section = this.formData();
    return section.type === 'hero' ? section.properties : undefined;
  });
  /** journal mode: the hero's cover as a one-image list, empty while none is chosen */
  protected heroCover = computed<ImageConfig[]>(() => {
    const section = this.formData();
    const hero = section.type === 'hero' ? section.properties?.hero : undefined;
    return hero && (hero.label || hero.url) ? [hero] : [];
  });
  /** journal mode: the album's explicit photo list (plan decision 8) */
  protected albumImages = computed<ImageConfig[]>(() => {
    const section = this.formData();
    return section.type === 'album' ? section.properties?.images ?? [] : [];
  });
  /** journal mode: the most clips a video section plays (spec 1.154 §10), the same constant the video suite enforces */
  protected readonly clipsMax = JOURNAL_VIDEO_CLIPS_MAX;
  /** journal mode: the video's explicit clip list (plan decision 8) */
  protected videoClips = computed<ImageConfig[]>(() => {
    const section = this.formData();
    return section.type === 'video' ? section.properties?.clips ?? [] : [];
  });
  protected heroCtas = computed<SectionCta[]>(() => {
    const section = this.formData();
    return section.type === 'hero' ? section.properties?.ctas ?? [] : [];
  });
  /** an article has at most one button; the cta editor works on a list */
  protected articleCtas = computed<SectionCta[]>(() => {
    const section = this.formData();
    return section.type === 'article' && section.properties?.cta ? [section.properties.cta] : [];
  });
  protected timelineConfig = computed(() => this.getTimelineConfig());
  protected adventConfig = computed(() => this.getAdventConfig());
  protected memberConfig = computed(() => this.getMemberConfig());
  protected ragConfig = computed(() => this.getRagConfig());
  protected eventsConfig = computed(() => this.getEventsConfig());
  protected courseConfig = computed(() => this.getCourseConfig());
  protected invitationsConfig = computed(() => this.getInvitationsConfig());
  protected iframeConfig = computed(() => this.getIframeConfig());
  protected weatherConfig = computed(() => this.getWeatherConfig());
  protected connectionsConfig = computed(() => this.getConnectionsConfig());
  protected departuresConfig = computed(() => this.getDeparturesConfig());
  protected energyConfig = computed(() => this.getEnergyConfig());
  protected counterConfig = computed(() => this.getCounterConfig());
  protected contactConfig = computed(() => this.formData().type === 'contact' ? (this.formData() as ContactSection).properties : undefined);
  protected footerConfig = computed(() => this.getFooterConfig());
  protected mapConfig = computed(() => this.getMapConfig());
  /** journal mode: the chosen track of a track section */
  protected trackConfig = computed<JournalTrackConfig | undefined>(() => {
    const section = this.formData();
    return section.type === 'track' ? section.properties : undefined;
  });
  protected peopleConfig = computed(() => this.getPeopleConfig());
  protected responsibilityConfig = computed(() => this.getResponsibilityConfig());
  protected headerData = computed(() => this.getHeaderData());
  protected bodyData = computed(() => this.getBodyData());
  protected tableGrid = computed(() => this.getTableGrid());
  protected headerStyle = computed(() => this.getHeaderStyle());
  protected bodyStyle = computed(() => this.getBodyStyle());
  
  protected trackerConfig = computed(() => this.getTrackerConfig());
  protected videoConfig = computed(() => this.getVideoConfig());
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);
  /** the user's advanced toggle */
  protected advancedToggle = signal(false);
  /**
   * a button section has no toggle: its name (e.g. emergency-button), intro, tags and notes are always offered;
   * an article neither: its two tabs together offer every setting (spec 1.171)
   */
  protected showAdvanced = computed(() => this.advancedToggle() || this.formData().type === 'button' || this.articleTabs());

  // the article's two tabs (spec 1.171): it always opens on «Inhalt» (D4); journal mode keeps its own reduced form
  protected readonly articleTabs = computed(() => !this.journalMode() && this.formData().type === 'article');
  /** an article with blocks (spec 1.173): the form neither shows nor writes its content, images, image style and button */
  protected readonly isBlockArticle = computed(() => this.articleTabs() && articleBlocksOf(this.formData()) !== undefined);
  protected readonly articleTab = signal<'content' | 'appearance'>('content');
  protected readonly sectionConfigPart = computed<SectionConfigPart>(() => this.articleTabs() ? this.articleTab() : 'all');
  private readonly articleTabErrors = computed(() => getErrorSegments(this.errors(), ARTICLE_TAB_FIELDS, ['content', 'appearance'] as const));
  /** the article's button card: shown once it has a button, or after a click on its «+» chip */
  protected readonly articleCtaOpened = signal(false);
  protected readonly showArticleCta = computed(() => this.articleCtas().length > 0 || this.articleCtaOpened() || this.hasCtaErrors());
  protected readonly articleCtaChip = computed((): SectionAddChip[] => [{ id: 'cta', label: this.i18n().article_add_button() }]);

  protected onArticleTabChange(value: string | number | undefined): void {
    if (value === 'content' || value === 'appearance') this.articleTab.set(value);
  }

  protected tabHasErrors(tab: 'content' | 'appearance'): boolean {
    return this.articleTabErrors().includes(tab);
  }

  private hasCtaErrors(): boolean {
    return Object.keys(this.errors() ?? {}).some((key) => key === 'cta' || key.startsWith('cta.'));
  }

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

  /** journal mode: whether the form offers property `key` of the current type */
  protected journalField(key: string): boolean {
    return isJournalModeField(this.formData().type, key);
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
      case 'article': return (this.formData() as ArticleSection).properties?.images || [];
      case 'slider': return (this.formData() as SliderSection).properties.images || [];
      default: return [];
    }
  }

  private getImageStyle(): ImageStyle | undefined {
    switch (this.formData().type) {
      case 'article': return resolveImageStyle((this.formData() as ArticleSection).properties?.imageStyle);
      case 'hero': return (this.formData() as HeroSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      case 'slider': return (this.formData() as SliderSection).properties.imageStyle || IMAGE_STYLE_SHAPE;
      default: return undefined;
    }
  }

  private getButtonActionConfig(): ButtonActionConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties?.action);
    }
  }

  private getIconConfig(): IconConfig | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties?.icon);
    }
  }

  private getButtonStyle(): ButtonStyle | undefined {
    if (this.formData().type === 'button') {
      return ((this.formData() as ButtonSection).properties?.style);
    }
  }

  private getChatConfig(): ChatConfig | undefined {
    if (this.formData().type === 'chat') {
      return ((this.formData() as ChatSection).properties as ChatConfig);
    }
  }

  private getFormConfig(): FormSectionConfig | undefined {
    if (this.formData().type === 'form') {
      return ((this.formData() as FormSection).properties ?? FORM_SECTION_CONFIG_SHAPE);
    }
  }

  private getCalendarConfig(): CalendarDisplayOptions | undefined {
    if (this.formData().type === 'cal') {
      return ((this.formData() as CalendarSection).properties as CalendarDisplayOptions);
    }
  }

  private getChartConfig(): ChartOption | undefined {
    if (this.formData().type === 'chart') {
      return ((this.formData() as ChartSection).properties as ChartOption);
    }
  }

  private getSankeyConfig(): SankeyConfig | undefined {
    if (this.formData().type === 'sankey') {
      return ((this.formData() as SankeySection).properties as SankeyConfig);
    }
  }

  private getSpiderConfig(): SpiderConfig | undefined {
    if (this.formData().type === 'spider') {
      return ((this.formData() as SpiderSection).properties as SpiderConfig);
    }
  }

  private getAccordionConfig(): AccordionConfig | undefined {
    if (this.formData().type === 'accordion') {
      return ((this.formData() as AccordionSection).properties as AccordionConfig);
    }
    return undefined;
  }

  private getTocConfig(): TocConfig | undefined {
    if (this.formData().type === 'toc') {
      return ((this.formData() as TocSection).properties as TocConfig);
    }
  }

  private getTestimonialConfig(): TestimonialConfig | undefined {
    if (this.formData().type === 'testimonial') {
      return ((this.formData() as TestimonialSection).properties as TestimonialConfig);
    }
  }

  private getTilesConfig(): TilesConfig | undefined {
    if (this.formData().type === 'tiles') {
      return ((this.formData() as TilesSection).properties as TilesConfig);
    }
    return undefined;
  }

  private getNewsConfig(): NewsConfig | undefined {
    if (this.formData().type === 'news') {
      return ((this.formData() as NewsSection).properties as NewsConfig);
    }
    return undefined;
  }

  private getAdventConfig(): AdventConfig | undefined {
    if (this.formData().type === 'advent') {
      return ((this.formData() as AdventSection).properties as AdventConfig);
    }
    return undefined;
  }

  private getTimelineConfig(): TimelineConfig | undefined {
    if (this.formData().type === 'timeline') {
      return ((this.formData() as TimelineSection).properties as TimelineConfig);
    }
  }

  private getMemberConfig(): MemberCatConfig | undefined {
    const type = this.formData().type;
    if (type === 'member-age' || type === 'member-cat') {
      return ((this.formData() as MemberAgeSection | MemberCatSection).properties as MemberCatConfig);
    }
  }

  private getRagConfig(): RagConfig | undefined {
    if (this.formData().type === 'rag') {
      return ((this.formData() as RagSection).properties as RagConfig);
    }
  }

  private getEventsConfig(): EventsConfig | undefined {
    if (this.formData().type === 'events') {
      return ((this.formData() as any).properties as EventsConfig);
    }
  }

  private getCourseConfig(): CourseConfig | undefined {
    if (this.formData().type === 'course') {
      return ((this.formData() as CourseSection).properties as CourseConfig);
    }
  }

  private getInvitationsConfig(): InvitationsConfig | undefined {
    if (this.formData().type === 'invitations') {
      return ((this.formData() as any).properties as InvitationsConfig);
    }
  }

  private getIframeConfig(): IframeConfig | undefined {
    if (this.formData().type === 'iframe') {
      return ((this.formData() as IframeSection).properties as IframeConfig);
    }
  }

  private getDeparturesConfig(): DeparturesConfig | undefined {
    if (this.formData().type === 'departures') {
      return (this.formData() as DeparturesSection).properties;
    }
    return undefined;
  }

  private getConnectionsConfig(): ConnectionsConfig | undefined {
    if (this.formData().type === 'connections') {
      return (this.formData() as ConnectionsSection).properties;
    }
    return undefined;
  }

  private getEnergyConfig(): EnergyConfig | undefined {
    if (this.formData().type === 'energy') {
      return (this.formData() as EnergySection).properties;
    }
    return undefined;
  }

  private getCounterConfig(): CounterConfig | undefined {
    if (this.formData().type === 'counter') {
      return (this.formData() as CounterSection).properties;
    }
    return undefined;
  }

  private getFooterConfig(): FooterConfig | undefined {
    if (this.formData().type === 'footer') {
      return (this.formData() as FooterSection).properties;
    }
    return undefined;
  }

  private getWeatherConfig(): WeatherConfig | undefined {
    if (this.formData().type === 'weather') {
      return ((this.formData() as WeatherSection).properties as WeatherConfig);
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
      const config = (this.formData() as VideoSection).properties as VideoConfig;
      return config ? { ...config, documentKey: config.documentKey ?? '' } : config;   // legacy docs: undefined
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

  /** journal mode: the picked cover replaces the hero image; removing it leaves an empty image */
  protected onHeroCoverChange(images: ImageConfig[]): void {
    this.onHeroConfigChange(images[0] ?? IMAGE_CONFIG_SHAPE);
  }

  /** journal mode: the album shows this list instead of its folder */
  protected onAlbumImagesChange(images: ImageConfig[]): void {
    const section = this.formData();
    if (section.type === 'album') {
      this.formData.set({ ...section, properties: { ...section.properties, images } } as AlbumSection);
    }
  }

  /** journal mode: the video plays these clips instead of its url */
  protected onVideoClipsChange(clips: ImageConfig[]): void {
    const section = this.formData();
    if (section.type === 'video') {
      this.formData.set({ ...section, properties: { ...section.properties, clips } } as VideoSection);
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
      case 'hero':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as HeroSection);
        break;
      case 'slider':
        this.formData.set({...section, properties: { ...section.properties, imageStyle }} as SliderSection);
        break;
    }
  }

  /** undefined deletes the key (absent = swipe carousel) */
  protected onSlideshowChange(slideshow: ArticleSlideshow | undefined): void {
    const section = this.formData();
    if (section.type !== 'article') return;
    const { slideshow: _removed, ...properties } = section.properties ?? {};   // eslint-disable-line @typescript-eslint/no-unused-vars
    this.formData.set({ ...section, properties: slideshow ? { ...properties, slideshow } : properties } as ArticleSection);
  }

  /** clearing the layout deletes the key (absent = slider); the article suite refuses null and '' */
  protected onImageLayoutChange(imageLayout: string | undefined): void {
    const section = this.formData();
    if (section.type !== 'article') return;
    const { imageLayout: _removed, ...properties } = section.properties ?? {};   // eslint-disable-line @typescript-eslint/no-unused-vars
    this.formData.set({ ...section, properties: imageLayout ? { ...properties, imageLayout } : properties } as ArticleSection);
  }

  /** journal mode: writes the complete feedback object, only ever called by a user's toggle */
  protected onFeedbackChange(feedback: SectionFeedback): void {
    this.formData.set({ ...this.formData(), feedback });
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

  protected onCourseConfigChange(config: CourseConfig): void {
    const section = this.formData();
    if (section.type === 'course') {
      this.formData.set({
        ...section,
        properties: config
      } as CourseSection);
    }
  }

  protected onCalendarConfigChange(config: CalendarDisplayOptions): void {
    const section = this.formData();
    if (section.type === 'cal') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, ...config }
      } as CalendarSection);
    }
  }

  protected onChartConfigChange(config: ChartOption): void {
    const section = this.formData();
    if (section.type === 'chart') {
      this.formData.set({
        ...section,
        properties: config
      } as ChartSection);
    }
  }

  protected onSankeyConfigChange(config: SankeyConfig): void {
    const section = this.formData();
    if (section.type === 'sankey') {
      this.formData.set({
        ...section,
        properties: config
      } as SankeySection);
    }
  }

  protected onSpiderConfigChange(config: SpiderConfig): void {
    const section = this.formData();
    if (section.type === 'spider') {
      this.formData.set({
        ...section,
        properties: config
      } as SpiderSection);
    }
  }

  protected onAccordionConfigChange(config: AccordionConfig): void {
    const section = this.formData();
    if (section.type === 'accordion') {
      this.formData.set({
        ...section,
        properties: config
      } as AccordionSection);
    }
  }

  protected onTocConfigChange(config: TocConfig): void {
    const section = this.formData();
    if (section.type === 'toc') {
      this.formData.set({
        ...section,
        properties: config
      } as TocSection);
    }
  }

  protected onTestimonialConfigChange(config: TestimonialConfig): void {
    const section = this.formData();
    if (section.type === 'testimonial') {
      this.formData.set({
        ...section,
        properties: config
      } as TestimonialSection);
    }
  }

  /** the section's own colour (BaseSection.color); today only the tiles configuration offers it */
  protected onSectionColorChange(color: ColorIonic): void {
    this.formData.update((section) => ({ ...section, color }) as SectionModel);
  }

  protected onTilesConfigChange(config: TilesConfig): void {
    const section = this.formData();
    if (section.type === 'tiles') {
      this.formData.set({ ...section, properties: config } as TilesSection);
    }
  }

  protected onNewsConfigChange(config: NewsConfig): void {
    const section = this.formData();
    if (section.type === 'news') {
      this.formData.set({ ...section, properties: config } as NewsSection);
    }
  }

  protected onHeroPropertiesChange(properties: HeroConfig): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({ ...section, properties } as HeroSection);
    }
  }

  protected onHeroCtasChange(ctas: SectionCta[]): void {
    const section = this.formData();
    if (section.type === 'hero') {
      this.formData.set({ ...section, properties: { ...section.properties, ctas } } as HeroSection);
    }
  }

  /** the button list holds zero or one entry; no entry removes the article's button */
  protected onArticleCtasChange(ctas: SectionCta[]): void {
    const section = this.formData();
    if (section.type === 'article') {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cta: _removed, ...properties } = section.properties ?? {};
      const cta = ctas[0];
      this.formData.set({ ...section, properties: cta ? { ...properties, cta } : properties } as ArticleSection);
    }
  }

  protected onAdventConfigChange(config: AdventConfig): void {
    const section = this.formData();
    if (section.type === 'advent') {
      this.formData.set({
        ...section,
        properties: config
      } as AdventSection);
    }
  }

  protected onTimelineConfigChange(config: TimelineConfig): void {
    const section = this.formData();
    if (section.type === 'timeline') {
      this.formData.set({
        ...section,
        properties: config
      } as TimelineSection);
    }
  }

  protected onMemberConfigChange(config: MemberCatConfig): void {
    const section = this.formData();
    if (section.type === 'member-age' || section.type === 'member-cat') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, ...config }
      } as MemberAgeSection | MemberCatSection);
    }
  }

  protected onRagConfigChange(config: RagConfig): void {
    const section = this.formData();
    if (section.type === 'rag') {
      this.formData.set({
        ...section,
        properties: { ...section.properties, ...config }
      } as RagSection);
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

  protected onFormConfigChange(config: FormSectionConfig): void {
    const section = this.formData();
    if (section.type === 'form') {
      this.formData.set({ ...section, properties: config } as FormSection);
    }
  }

  protected onDeparturesConfigChange(config: DeparturesConfig): void {
    const section = this.formData();
    if (section.type === 'departures') {
      this.formData.set({ ...section, properties: config } as DeparturesSection);
    }
  }

  protected onConnectionsConfigChange(config: ConnectionsConfig): void {
    const section = this.formData();
    if (section.type === 'connections') {
      this.formData.set({ ...section, properties: config } as ConnectionsSection);
    }
  }

  protected onEnergyConfigChange(config: EnergyConfig): void {
    const section = this.formData();
    if (section.type === 'energy') {
      this.formData.set({ ...section, properties: config } as EnergySection);
    }
  }

  protected onContactConfigChange(config: ContactConfig): void {
    const section = this.formData();
    if (section.type === 'contact') {
      this.formData.set({ ...section, properties: config } as ContactSection);
    }
  }

  protected onCounterConfigChange(config: CounterConfig): void {
    const section = this.formData();
    if (section.type === 'counter') {
      this.formData.set({ ...section, properties: config } as CounterSection);
    }
  }

  protected onFooterConfigChange(config: FooterConfig): void {
    const section = this.formData();
    if (section.type === 'footer') {
      this.formData.set({ ...section, properties: config } as FooterSection);
    }
  }

  protected onWeatherConfigChange(config: WeatherConfig): void {
    const section = this.formData();
    if (section.type === 'weather') {
      this.formData.set({ ...section, properties: config } as WeatherSection);
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

  /** journal mode: the picker chose another track */
  protected onTrackConfigChange(config: JournalTrackConfig): void {
    const section = this.formData();
    if (section.type === 'track') {
      this.formData.set({ ...section, properties: config } as JournalTrackSection);
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

  /************************************** contact section *********************************************** */
  public async selectContactOrg(): Promise<void> {
    const org = await this.modelSelectService.selectOrg();
    const config = this.contactConfig();
    if (org?.okey && config) this.onContactConfigChange({ ...config, orgKey: org.okey });
  }

  public async selectContactPerson(): Promise<void> {
    const person = await this.modelSelectService.selectPerson();
    const config = this.contactConfig();
    if (person?.okey && config) this.onContactConfigChange({ ...config, personKey: person.okey });
  }

  /************************************** select person *********************************************** */
  public async selectPerson(): Promise<void> {
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL);
    const current = this.peopleConfig();
    if (avatar && current) this.onPeopleConfigChange(addPeoplePerson(current, avatar));
  }

  public async selectGroup(): Promise<void> {
    const group = await this.modelSelectService.selectGroup();
    const current = this.peopleConfig();
    if (group && current) this.onPeopleConfigChange(setPeopleGroup(current, group.okey));
  }

  /** a member of the section's group that the section should not show (picker limited to that group) */
  public async selectExcludedPerson(): Promise<void> {
    const current = this.peopleConfig();
    const groupKey = current?.groupId ?? '';
    if (!current || !groupKey) return;
    const avatar = await this.modelSelectService.selectPersonAvatar('', DEFAULT_LABEL, false, false, {
      groupKey, showGroupSelect: false, excludeKeys: peopleHiddenKeys(current),
    });
    if (!avatar?.key) return;
    this.onPeopleConfigChange(hidePeoplePerson(current, avatar.key));
  }

  /** the responsibility that gets a task for every answer to a form section */
  public async selectFormResponsibility(): Promise<void> {
    const responsibility = await this.modelSelectService.selectResponsibility();
    const section = this.formData();
    if (responsibility && section.type === 'form') {
      this.formData.set({ ...section, properties: { ...(section as FormSection).properties, responsibilityKey: responsibility.okey } } as FormSection);
    }
  }

  public async selectResponsibility(): Promise<void> {
    const responsibility = await this.modelSelectService.selectResponsibility();
    const current = this.peopleConfig();
    if (responsibility && current) this.onPeopleConfigChange(addPeopleResponsibility(current, responsibility.okey));
  }

  /** the group whose active responsibilities are shown after the chosen ones (its name is kept for the chip) */
  public async selectResponsibilityParent(): Promise<void> {
    const group = await this.modelSelectService.selectGroup();
    const current = this.peopleConfig();
    if (!group?.okey || !current) return;
    this.onPeopleConfigChange(setPeopleResponsibilityParent(current, `group.${group.okey}`, group.name));
  }
}
