import { Component, computed, DestroyRef, inject, input, output, signal } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote,
  IonRadio, IonRadioGroup, IonRange, IonRow, IonSegment, IonSegmentButton, ModalController
} from '@ionic/angular';

import {
  BlockAlign, CalloutTone, ColumnsBlock, EVENTS_CONFIG_SHAPE, IMAGE_CONFIG_SHAPE, ImageActionType, ImageConfig, ImageStyle, isSameValue,
  MailBlock, SectionCta, SpaceSize, UserModel
} from '@okr/shared-models';
import { URL_LENGTH } from '@okr/shared-constants';
import { UploadService } from '@okr/avatar-data-access';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { compactImageStyle, fill, MAX_MAIL_EVENTS, resolveImageStyle } from '@okr/shared-util-core';
import {
  ARTICLE_BLOCK_ICONS, ARTICLE_PROFILE, ArticleEditorI18n, ArticleUpload, BLOCK_ALIGNS, blockTypeLabel, COLUMN_PRESETS,
  drawableImages, EditorProfile, galleryErrors, getFieldErrors, IMAGE_CAPTION_LENGTH, IMAGE_CREDIT_LENGTH, ImageUploadTarget, isEventsShown, isMailCaptionHidden, isPictureMissing, MAIL_CAPTION_POSITIONS, MAIL_IMAGE_WIDTHS,
  MAIL_TEXT_PICTURE_MESSAGE, mailImageWidth, mailStyleCaptionPosition, mailToneOf, resizeColumn, restErrors, SectionErrors, setColumnCount, setColumnSizes, shownBlockFields, SPACE_SIZES, withMailLinks
} from '@okr/cms-section-util';

import { pickArticleImage } from './article-image-pick.modal';
import { ArticleImagesConfiguration } from './article-images-configuration';
import { ARTICLE_PANEL_STYLES } from './article-panel.styles';
import { CtaConfiguration } from './cta-configuration';
import { ImagesConfiguration } from './images-configuration';
import { ImageStyleConfiguration } from './image-style-configuration';

const filled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/**
 * The settings of the selected block (spec 1.175 §7.3) and nothing else; the profile decides which there are (1.176 §8.2). Every change
 * emits exactly one new block object; nothing is emitted on init. Uploaded pictures go to `onUpload` instead, because they may arrive when another block is selected.
 */
@Component({
  selector: 'okr-article-block-panel',
  standalone: true,
  imports: [
    SvgIconPipe, Checkbox, ErrorNote, NumberInput, StringSelect, TextInput, ImagesConfiguration, ImageStyleConfiguration, ArticleImagesConfiguration, CtaConfiguration,
    IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonNote,
    IonRadio, IonRadioGroup, IonRange, IonRow, IonSegment, IonSegmentButton,
  ],
  host: { role: 'region', '[attr.aria-label]': 'panelLabel()' },
  styles: [ARTICLE_PANEL_STYLES, `
    ion-range { --knob-size: 20px; }
    .range-value { flex: none; min-width: 64px; text-align: end; font-size: 0.85rem; }
    .presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .preset { display: flex; gap: 3px; width: 72px; height: 36px; padding: 5px; border: 1px solid var(--ion-color-medium); border-radius: 6px; background: transparent; cursor: pointer; }
    .preset span { min-width: 0; border-radius: 2px; background: var(--ion-color-medium); opacity: 0.45; }
    .preset.current { border-color: var(--ion-color-primary); box-shadow: 0 0 0 1px var(--ion-color-primary); }
    .preset.current span { background: var(--ion-color-primary); opacity: 0.8; }
    .preset:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .swatch { display: inline-block; width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--ion-color-medium); margin-inline-end: 12px; }
    .swatch.primary { background: color-mix(in srgb, var(--ion-color-primary) 30%, transparent); }
    .swatch.secondary { background: color-mix(in srgb, var(--ion-color-secondary) 30%, transparent); }
    .swatch.tertiary { background: color-mix(in srgb, var(--ion-color-tertiary) 30%, transparent); }
    .swatch.neutral { background: var(--ion-color-light); }
    .panel-head .hidden-toggle { margin-inline-start: auto; }
  `],
  template: `
    <!-- a new block gets new fields: none of them keeps what was opened or typed for the one before -->
    @for (current of [{ id: block().id }]; track current.id) {
      <div class="panel-head">
        @if (icon(); as icon) { <ion-icon src="{{ icon | svgIcon }}" aria-hidden="true" /> }
        <h2>{{ typeLabel() }}</h2>
        @if (hasHiddenFields()) {
          <!-- the fields that normally keep their default -->
          <ion-button class="hidden-toggle" fill="clear" size="small" [attr.aria-label]="i18n().form_advanced_label()" [attr.aria-pressed]="showHidden()" (click)="showHidden.set(!showHidden())">
            <ion-icon slot="icon-only" src="{{ (showHidden() ? 'toggle' : 'toggle-off') | svgIcon }}" />
          </ion-button>
        }
      </div>
      @if (outdatedText(); as text) { <ion-note class="note outdated">{{ text }}</ion-note> }

      @switch (block().type) {
        @case ('text') {
          <ion-note class="note">{{ i18n().article_editor_panel_writeInArticle() }}</ion-note>
          <ion-card>
            <ion-card-content>
              <span class="field-label">{{ i18n().article_editor_align_label() }}</span>
              <ion-segment [value]="align()" [attr.aria-label]="i18n().article_editor_align_label()" (ionChange)="setAlign($event.detail.value)">
                @for (a of aligns; track a) { <ion-segment-button [value]="a"><ion-label>{{ alignLabels()[a] }}</ion-label></ion-segment-button> }
              </ion-segment>
              <okr-error-note [errors]="errorsFor('align')" />
            </ion-card-content>
          </ion-card>
          @if (htmlOtherError()) { <ion-note class="note" color="danger">{{ i18n().article_editor_error_noGerman() }}</ion-note> }
          <okr-error-note [errors]="htmlPictureErrors()" />
        }

        @case ('image') {
          <ion-card>
            <ion-card-content class="ion-no-padding">
              <okr-images-config variant="single" [prefillAltText]="onlyLinks()" [images]="images()" (imagesChange)="setImage($event)" [multiple]="false" [embedded]="true" [uniqueNames]="true" [showType]="!onlyLinks()"
                [uploads]="uploads()" [uploadTarget]="uploadTarget()" [emptyText]="i18n().article_editor_image_empty()"
                [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="false" [i18n]="i18n()" [errors]="imageListErrors()" />
              <div class="actions">
                @if (choices().length > 0) {
                  <ion-button size="small" fill="outline" (click)="pick()">{{ i18n().article_editor_image_fromArticle() }}</ion-button>
                }
              </div>
              @if (!uploads()) { <ion-note class="note">{{ i18n().article_editor_image_noUpload() }}</ion-note> }
              @if (pictureMissing()) { <ion-note class="note" color="danger">{{ i18n().article_editor_image_missing() }}</ion-note> }
            </ion-card-content>
          </ion-card>
          @if (!pictureMissing() && onlyLinks()) {
            <!-- a mail: caption, alt text, link and width -->
            <ion-card>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-text-input [i18n]="captionI18n()" [value]="image().overlay ?? ''" (valueChange)="patchImage({ overlay: $event })" [maxLength]="captionLength" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.overlay')" />
                      @if (captionHidden()) { <ion-note class="note">{{ i18n().article_editor_image_captionHidden() }}</ion-note> }
                    </ion-col>
                    <ion-col size="12">
                      <okr-string-select [i18n]="captionPositionI18n()" [selectedString]="captionPosition()" (selectedStringChange)="setCaptionPosition($event)"
                        [stringList]="captionPositions" [labels]="captionPositionLabels()" [readOnly]="false" />
                    </ion-col>
                    <ion-col size="12">
                      <okr-text-input [i18n]="altTextI18n()" [value]="image().altText ?? ''" (valueChange)="patchImage({ altText: $event })" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.altText')" />
                    </ion-col>
                    <ion-col size="12">
                      <okr-text-input [i18n]="linkI18n()" [value]="image().actionUrl ?? ''" (valueChange)="patchImage({ actionUrl: $event })" [maxLength]="urlLength" [showHelper]="true" inputMode="url" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.actionUrl')" />
                    </ion-col>
                    <ion-col size="12">
                      <okr-string-select [i18n]="widthI18n()" [selectedString]="width()" (selectedStringChange)="setWidth($event)" [stringList]="widths()" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('imageStyle.width')" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
          @if (!pictureMissing() && !onlyLinks()) {
            <!-- Caption: the text and how it shows; the alt text keeps its default (section title, then file name) unless the hidden fields show -->
            <ion-card>
              <ion-card-header><ion-card-title>{{ i18n().image_style_group_caption() }}</ion-card-title></ion-card-header>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-text-input [i18n]="captionI18n()" [value]="image().overlay ?? ''" (valueChange)="patchImage({ overlay: $event })" [maxLength]="captionLength" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.overlay')" />
                      @if (captionHidden()) { <ion-note class="note">{{ i18n().article_editor_image_captionHidden() }}</ion-note> }
                    </ion-col>
                    <ion-col size="12">
                      <okr-text-input [i18n]="creditI18n()" [value]="image().credit ?? ''" (valueChange)="patchImage({ credit: $event })" [maxLength]="creditLength" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.credit')" />
                      <ion-button size="small" fill="clear" [disabled]="readingCredit()" (click)="readCreditFromFile()">{{ i18n().image_edit_credit_read() }}</ion-button>
                      @if (creditWasEmpty() === block().id) { <ion-note class="note">{{ i18n().image_edit_credit_read_empty() }}</ion-note> }
                    </ion-col>
                  </ion-row>
                </ion-grid>
                <okr-image-style [formData]="imageStyle()" (formDataChange)="setImageStyle($event)" [embedded]="true" [showGroupTitles]="false"
                  [showImageGroup]="false" [showCaption]="true" [showAction]="false" [readOnly]="false" [i18n]="i18n()" [errors]="errors()" />
                @if (showHidden() || errorsFor('image.altText').length > 0) {
                  <ion-grid>
                    <ion-row>
                      <ion-col size="12">
                        <okr-text-input [i18n]="altTextI18n()" [value]="image().altText ?? ''" (valueChange)="patchImage({ altText: $event })" [readOnly]="false" />
                        <okr-error-note [errors]="errorsFor('image.altText')" />
                      </ion-col>
                    </ion-row>
                  </ion-grid>
                }
              </ion-card-content>
            </ion-card>
            <!-- Darstellung: Darstellung and Eckenradius; width, frame, thumbnail and imgix only with the hidden fields -->
            <ion-card>
              <ion-card-header><ion-card-title>{{ i18n().display_label() }}</ion-card-title></ion-card-header>
              <ion-card-content class="ion-no-padding">
                <okr-image-style [formData]="imageStyle()" (formDataChange)="setImageStyle($event)" [embedded]="true" [showGroupTitles]="false"
                  [showImageGroup]="true" [essentials]="true" [showAdvanced]="showHidden()" [showCaption]="false" [showAction]="false" [readOnly]="false" [i18n]="i18n()" [errors]="errors()" />
              </ion-card-content>
            </ion-card>
          }
          @if (column(); as column) {
            <ion-card>
              <ion-card-content>
                <span class="field-label">{{ i18n().article_editor_image_columnWidth() }}</span>
                <ion-item lines="none">
                  <ion-range [min]="1" [max]="maxSize(column.count)" [step]="1" [snaps]="true" [value]="column.size" [attr.aria-label]="i18n().article_editor_image_columnWidth()"
                    (ionChange)="setColumnWidth($event.detail.value, column)" />
                  <span slot="end" class="range-value">{{ sizeLabel(column.size) }}</span>
                </ion-item>
              </ion-card-content>
            </ion-card>
          }
          @if (!pictureMissing() && !onlyLinks()) {
            <!-- Aktion: what a click on the picture does, and the link it follows -->
            <ion-card>
              <ion-card-header><ion-card-title>{{ i18n().image_style_group_action() }}</ion-card-title></ion-card-header>
              <ion-card-content class="ion-no-padding">
                <okr-image-style [formData]="imageStyle()" (formDataChange)="setImageStyle($event)" [embedded]="true" [showGroupTitles]="false"
                  [showImageGroup]="false" [showCaption]="false" [showAction]="true" [showAdvanced]="true" [readOnly]="false" [i18n]="i18n()" [errors]="errors()" />
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-text-input [i18n]="linkI18n()" [value]="image().actionUrl ?? ''" (valueChange)="patchImage({ actionUrl: $event })" [maxLength]="urlLength" [showHelper]="true" inputMode="url" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('image.actionUrl')" />
                      @if (linkNote(); as note) { <ion-note class="note">{{ note }}</ion-note> }
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          }
        }

        @case ('gallery') {
          <ion-card>
            <ion-card-header><ion-card-title>{{ i18n().article_images_title() }}</ion-card-title></ion-card-header>
            <ion-card-content class="ion-no-padding">
              <okr-images-config [images]="images()" (imagesChange)="patch({ images: $event })" [embedded]="true" [uniqueNames]="true" [showType]="!onlyLinks()"
                [uploads]="uploads()" [uploadTarget]="uploadTarget()" [emptyText]="i18n().article_editor_image_empty()"
                [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="false" [i18n]="i18n()" [errors]="errors()" />
              <div class="actions">
                @if (choices().length > 0) {
                  <ion-button size="small" fill="outline" (click)="pick()">{{ i18n().article_editor_image_fromArticle() }}</ion-button>
                }
              </div>
              @if (!uploads()) { <ion-note class="note">{{ i18n().article_editor_image_noUpload() }}</ion-note> }
              @if (pictureMissing()) { <ion-note class="note" color="danger">{{ i18n().article_editor_gallery_missing() }}</ion-note> }
              @if (onlyLinks() && !pictureMissing()) {
                <okr-string-select [i18n]="captionPositionI18n()" [selectedString]="captionPosition()" (selectedStringChange)="setCaptionPosition($event)"
                  [stringList]="captionPositions" [labels]="captionPositionLabels()" [readOnly]="false" />
                @if (captionHidden()) { <ion-note class="note">{{ i18n().article_editor_image_captionHidden() }}</ion-note> }
              }
            </ion-card-content>
          </ion-card>
          @if (images().length > 0 && !profile().galleryPairs) {
            <okr-article-images-config mode="appearance" [showPlacement]="false" [title]="i18n().article_editor_panel_look()"
              [images]="images()" [imageStyle]="imageStyle()" (imageStyleChange)="setImageStyle($event)"
              [imageLayout]="layout()" (imageLayoutChange)="patch({ layout: $event })"
              [slideshow]="slideshow()" (slideshowChange)="patch({ slideshow: $event })"
              [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="false" [i18n]="i18n()" [errors]="lookErrors()" />
          }
        }

        @case ('button') {
          <!-- an article's button only links; what does something is the section «Aktions-Button» -->
          @if (profile().kind === 'article') { <ion-note class="note">{{ i18n().article_editor_button_hint() }}</ion-note> }
          <okr-cta-config [formData]="ctas()" (formDataChange)="setCta($event)" [max]="1" errorKey="cta" [showHeader]="false" [readOnly]="false" [i18n]="i18n()" [errors]="errors()" />
          <ion-card>
            <ion-card-content>
              <span class="field-label">{{ i18n().article_editor_align_label() }}</span>
              <ion-segment [value]="align()" [attr.aria-label]="i18n().article_editor_align_label()" (ionChange)="setAlign($event.detail.value)">
                @for (a of aligns; track a) { <ion-segment-button [value]="a"><ion-label>{{ alignLabels()[a] }}</ion-label></ion-segment-button> }
              </ion-segment>
              <okr-error-note [errors]="errorsFor('align')" />
            </ion-card-content>
          </ion-card>
        }

        @case ('columns') {
          <ion-card>
            <ion-card-content>
              <span class="field-label">{{ i18n().article_editor_columns_count() }}</span>
              <ion-segment [value]="sizes().length" [attr.aria-label]="i18n().article_editor_columns_count()" (ionChange)="setCount($event.detail.value)">
                @for (n of counts; track n) { <ion-segment-button [value]="n"><ion-label>{{ n }}</ion-label></ion-segment-button> }
              </ion-segment>
              <span class="field-label">{{ i18n().article_editor_columns_widths() }}</span>
              <div class="presets" role="group" [attr.aria-label]="i18n().article_editor_columns_widths()">
                @for (preset of presets(); track preset.join('/')) {
                  <button type="button" class="preset" [class.current]="isCurrent(preset)" [attr.aria-pressed]="isCurrent(preset)" [attr.aria-label]="presetLabel(preset)" (click)="setSizes(preset)">
                    @for (size of preset; track $index) { <span [style.flex]="size"></span> }
                  </button>
                }
              </div>
              @if (sizesValid()) {
                @for (size of sizes(); track $index; let i = $index) {
                  <ion-item lines="none" class="ion-no-padding">
                    <ion-range [min]="1" [max]="maxSize(sizes().length)" [step]="1" [snaps]="true" [value]="size" [label]="columnLabel(i)" labelPlacement="start"
                      (ionChange)="setSize(i, $event.detail.value)" />
                    <span slot="end" class="range-value">{{ sizeLabel(size) }}</span>
                  </ion-item>
                }
              }
              @if (errorsFor('columns').length > 0) { <ion-note color="danger">{{ i18n().article_editor_columns_invalid() }}</ion-note> }
              @if (profile().stackReverse) {
                <okr-checkbox [i18n]="stackReverseI18n()" [checked]="stackReverse()" (checkedChange)="patch({ stackReverse: $event ? true : undefined })" [showHelper]="true" [readOnly]="false" />
              }
            </ion-card-content>
          </ion-card>
        }

        @case ('callout') {
          <ion-note class="note">{{ i18n().article_editor_panel_writeInArticle() }}</ion-note>
          <ion-card>
            <ion-card-content>
              <span class="field-label">{{ i18n().article_editor_tone_label() }}</span>
              <ion-radio-group [value]="tone()" [attr.aria-label]="i18n().article_editor_tone_label()" (ionChange)="setTone($event.detail.value)">
                <ion-list lines="none" class="ion-no-padding">
                  @for (t of profile().tones; track t) {
                    <ion-item class="ion-no-padding">
                      <span slot="start" class="swatch" [class]="t" aria-hidden="true"></span>
                      <ion-radio [value]="t" justify="space-between">{{ toneLabels()[t] }}</ion-radio>
                    </ion-item>
                  }
                </ion-list>
              </ion-radio-group>
              <okr-error-note [errors]="errorsFor('tone')" />
            </ion-card-content>
          </ion-card>
          @if (htmlOtherError()) { <ion-note class="note" color="danger">{{ i18n().article_editor_error_noGerman() }}</ion-note> }
          <okr-error-note [errors]="htmlPictureErrors()" />
        }

        @case ('space') {
          <ion-card>
            <ion-card-content>
              <span class="field-label">{{ i18n().article_editor_space_label() }}</span>
              <ion-segment [value]="spaceSize()" [attr.aria-label]="i18n().article_editor_space_label()" (ionChange)="setSpace($event.detail.value)">
                @for (s of spaceSizes; track s) { <ion-segment-button [value]="s"><ion-label>{{ spaceLabels()[s] }}</ion-label></ion-segment-button> }
              </ion-segment>
              <okr-error-note [errors]="errorsFor('size')" />
            </ion-card-content>
          </ion-card>
        }

        @case ('events') {
          @if (eventsShown()) {
            <ion-note class="note">{{ i18n().article_editor_mail_events_helper() }}</ion-note>
            <ion-card>
              <ion-card-content class="ion-no-padding">
                <ion-grid>
                  <ion-row>
                    <ion-col size="12">
                      <okr-string-select [i18n]="calendarI18n()" [selectedString]="calendarKey()" (selectedStringChange)="patch({ calendarKey: $event })"
                        [stringList]="calendarKeys()" [labels]="calendarNames()" [readOnly]="false" />
                      @if (errorsFor('calendarKey').length > 0) { <ion-note class="note" color="danger">{{ i18n().article_editor_mail_events_calendarMissing() }}</ion-note> }
                    </ion-col>
                    <ion-col size="12">
                      <okr-text-input [i18n]="eventsTitleI18n()" [value]="eventsTitle()" (valueChange)="patch({ title: $event === '' ? undefined : $event })" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('title')" />
                    </ion-col>
                    <ion-col size="12">
                      <okr-number-input [i18n]="maxEventsI18n()" [value]="maxEvents()" (valueChange)="patch({ maxEvents: $event })" [integer]="true" [min]="1" [max]="maxEventsMax"
                        [maxLength]="2" [showHelper]="true" [readOnly]="false" />
                      <okr-error-note [errors]="errorsFor('maxEvents')" />
                    </ion-col>
                  </ion-row>
                </ion-grid>
              </ion-card-content>
            </ion-card>
          } @else {
            <ion-note class="note">{{ i18n().article_editor_panel_unknown() }}</ion-note>
          }
        }

        @case ('divider') { <ion-note class="note">{{ i18n().article_editor_panel_nothing() }}</ion-note> }
        @default { <ion-note class="note">{{ i18n().article_editor_panel_unknown() }}</ion-note> }
      }

      <!-- an error that no field above shows, so that a missing save banner is never unexplained -->
      @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }
    }
  `,
})
export class ArticleBlockPanel {
  private readonly modalController = inject(ModalController);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uploadService = inject(UploadService);
  private readonly actionI18n = inject(I18nService).translateAll({ followLink: '@shared/categories.imageAction.followlink.label' });

  // inputs
  public readonly block = input.required<MailBlock>();
  public readonly profile = input<EditorProfile>(ARTICLE_PROFILE);
  /** the column the block stands in: its size (of 12) and the number of columns; only used for an image */
  public readonly column = input<{ size: number; count: number } | undefined>();
  /** the errors of this block: `blockErrors(errors, id, blocks)` */
  public readonly errors = input<SectionErrors>({});
  /** the languages whose translation is outdated: `outdatedLanguagesOf(paths, id)` */
  public readonly outdated = input<string[]>([]);
  /** of a mail: the calendars that an events block can list */
  public readonly calendars = input<readonly { key: string; name: string }[]>([]);
  /** «Aus diesem Artikel»: `articleImageChoices(section)` */
  public readonly articleImages = input<ImageConfig[]>([]);
  /** false in trial mode: no file is uploaded */
  public readonly uploads = input(true);
  /** takes uploaded pictures (apply them with `withUpload`); may be called when the panel is gone */
  public readonly onUpload = input.required<(upload: ArticleUpload) => void>();
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly i18n = input.required<ArticleEditorI18n>();

  // outputs
  public readonly blockChange = output<MailBlock>();
  /** the new size (of 12) of the column the image stands in: apply it with `resizeColumn` and `setColumnSizes` */
  public readonly columnSizeChange = output<number>();

  // constants
  protected readonly aligns = BLOCK_ALIGNS;
  protected readonly spaceSizes = SPACE_SIZES;
  protected readonly counts = [2, 3] as const;
  protected readonly captionLength = IMAGE_CAPTION_LENGTH;
  protected readonly creditLength = IMAGE_CREDIT_LENGTH;
  protected readonly urlLength = URL_LENGTH;
  protected readonly captionPositions = [...MAIL_CAPTION_POSITIONS] as string[];
  protected readonly maxEventsMax = MAX_MAIL_EVENTS;

  // head
  protected readonly eventsShown = computed(() => isEventsShown(this.profile(), this.column() !== undefined));
  /** events where they cannot stand */
  private readonly isUnknown = computed(() => this.block().type === 'events' && !this.eventsShown());
  protected readonly typeLabel = computed(() => blockTypeLabel(this.i18n(), this.isUnknown() ? '' : this.block().type, this.profile()));
  protected readonly panelLabel = computed(() => fill(this.i18n().article_editor_panel_label(), { block: this.typeLabel() }));
  protected readonly icon = computed<string | undefined>(() => this.isUnknown() ? undefined : ARTICLE_BLOCK_ICONS[this.block().type]);
  protected readonly outdatedText = computed(() => this.outdated().length === 0 ? ''
    : fill(this.i18n().article_editor_outdated(), { languages: this.outdated().map((l) => l.toUpperCase()).join(', ') }));

  // text, button: alignment
  protected readonly align = computed<BlockAlign>(() => {
    const block = this.block();
    return (block.type === 'text' || block.type === 'button' ? block.align : undefined) ?? 'left';
  });
  protected readonly alignLabels = computed<Record<BlockAlign, string>>(() => ({
    left: this.i18n().article_editor_align_left(), center: this.i18n().article_editor_align_center(), right: this.i18n().article_editor_align_right(),
  }));

  // image, gallery
  protected readonly image = computed<ImageConfig>(() => {
    const block = this.block();
    const image = block.type === 'image' ? block.image : undefined;
    return image && typeof image === 'object' ? image : { ...IMAGE_CONFIG_SHAPE, url: '' };
  });
  protected readonly images = computed<ImageConfig[]>(() => {
    const block = this.block();
    if (block.type === 'image') return this.pictureMissing() ? [] : [block.image];
    return block.type === 'gallery' ? drawableImages(block.images) : [];
  });
  protected readonly pictureMissing = computed(() => isPictureMissing(this.block()));
  /** the pictures of the article that this block does not show yet */
  protected readonly choices = computed(() => {
    const own = new Set(this.images().map((image) => image?.url));
    return this.articleImages().filter((image) => !own.has(image.url));
  });
  /** the hidden fields of the image block (width, frame, thumbnail, imgix, alt text): they keep their default until shown */
  protected readonly showHidden = signal(false);
  /** «Aus Datei lesen» of the credit: running, and the id of the block whose file had no credit */
  protected readonly readingCredit = signal(false);
  protected readonly creditWasEmpty = signal<string | undefined>(undefined);
  protected readonly hasHiddenFields = computed(() => this.block().type === 'image' && !this.onlyLinks() && !this.pictureMissing());
  protected readonly imageStyle = computed<ImageStyle>(() => {
    const block = this.block();
    const style = block.type === 'image' || block.type === 'gallery' ? block.imageStyle : undefined;
    return resolveImageStyle(style && typeof style === 'object' ? style : undefined);
  });
  /** a mail: a picture has a link and no other action, and nothing of a look but width and caption */
  protected readonly onlyLinks = computed(() => this.profile().imageAction === 'link');
  protected readonly captionHidden = computed(() => this.onlyLinks() ? isMailCaptionHidden(this.block()) : filled(this.image().overlay) && (this.imageStyle().captionPosition ?? 'none') === 'none');
  protected readonly linkNote = computed(() => {
    // the link alone decides the action
    if (this.onlyLinks()) return '';
    const follows = this.imageStyle().action === ImageActionType.FollowLink;
    const link = filled(this.image().actionUrl);
    if (link === follows) return '';
    return link ? fill(this.i18n().article_editor_image_linkInactive(), { action: this.actionI18n.followLink() }) : this.i18n().article_editor_image_linkMissing();
  });
  protected readonly captionPosition = computed<string>(() => mailStyleCaptionPosition(this.imageStyle()));
  protected readonly captionPositionLabels = computed(() => [this.i18n().captionPosition_none(), this.i18n().captionPosition_top(), this.i18n().captionPosition_bottom()]);
  protected readonly captionPositionI18n = computed<StringSelectI18n>(() => ({ name: 'captionPosition', label: this.i18n().captionPosition_label() }));
  protected readonly width = computed(() => mailImageWidth(this.imageStyle()));
  /** a width from elsewhere (an article) stays until another one is chosen */
  protected readonly widths = computed(() => MAIL_IMAGE_WIDTHS.includes(this.width()) ? [...MAIL_IMAGE_WIDTHS] : [...MAIL_IMAGE_WIDTHS, this.width()]);
  protected readonly widthI18n = computed<StringSelectI18n>(() => ({ name: 'imageWidth', label: this.i18n().article_editor_mail_image_width() }));
  protected readonly layout = computed(() => { const block = this.block(); return block.type === 'gallery' ? block.layout : undefined; });
  protected readonly slideshow = computed(() => { const block = this.block(); return block.type === 'gallery' ? block.slideshow : undefined; });
  /** captured with the id of this block: the pictures belong to it, whatever is selected when they arrive */
  protected readonly uploadTarget = computed<ImageUploadTarget>(() => {
    const blockId = this.block().id;
    const send = this.onUpload();
    return {
      added: (images) => send({ kind: 'images', place: { blockId }, images }),
      details: (details) => send({ kind: 'details', details }),
    };
  });
  protected readonly captionI18n = computed<TextInputI18n>(() => ({
    name: 'imageOverlay', label: this.i18n().image_edit_overlay_label(), placeholder: this.i18n().image_edit_overlay_placeholder(), helper: '',
  }));
  protected readonly creditI18n = computed<TextInputI18n>(() => ({
    name: 'imageCredit', label: this.i18n().image_edit_credit_label(), placeholder: this.i18n().image_edit_credit_placeholder(), helper: this.i18n().image_edit_credit_helper(),
  }));
  protected readonly altTextI18n = computed<TextInputI18n>(() => ({
    name: 'imageAltText', label: this.i18n().altText_label(), placeholder: this.i18n().altText_placeholder(), helper: this.i18n().altText_helper(),
  }));
  protected readonly linkI18n = computed<TextInputI18n>(() => ({
    name: 'imageActionUrl', label: this.i18n().article_editor_image_link_label(), placeholder: this.i18n().article_editor_image_link_placeholder(), helper: this.i18n().article_editor_image_link_helper(),
  }));

  // button
  protected readonly ctas = computed<SectionCta[]>(() => {
    const block = this.block();
    const cta = block.type === 'button' ? block.cta : undefined;
    return [cta && typeof cta === 'object' ? cta : { label: '', url: '', style: 'primary' }];
  });

  // columns
  protected readonly sizes = computed<number[]>(() => {
    const block = this.block();
    return block.type === 'columns' && Array.isArray(block.columns) ? block.columns.filter((c) => !!c && typeof c === 'object').map((c) => c.size) : [];
  });
  protected readonly sizesValid = computed(() => this.counts.some((n) => n === this.sizes().length)
    && this.sizes().every((s) => Number.isInteger(s) && s >= 1) && this.sizes().reduce((sum, s) => sum + s, 0) === 12);
  protected readonly presets = computed(() => COLUMN_PRESETS.filter((preset) => preset.length === this.sizes().length));
  protected readonly stackReverse = computed(() => { const block = this.block(); return block.type === 'columns' && block.stackReverse === true; });
  protected readonly stackReverseI18n = computed<CheckboxI18n>(() => ({
    name: 'stackReverse', label: this.i18n().article_editor_columns_stackReverse_label(), helper: this.i18n().article_editor_columns_stackReverse_helper(),
  }));

  // callout, space
  protected readonly tone = computed(() => {
    const block = this.block();
    if (block.type !== 'callout') return undefined;
    // of a copied article: shown as the tone that the mail has
    return this.profile().kind === 'mail' ? mailToneOf(block.tone) : block.tone;
  });
  protected readonly toneLabels = computed<Record<CalloutTone, string>>(() => ({
    primary: this.i18n().article_editor_tone_primary(), secondary: this.i18n().article_editor_tone_secondary(),
    tertiary: this.i18n().article_editor_tone_tertiary(), neutral: this.i18n().article_editor_tone_neutral(),
  }));
  protected readonly spaceSize = computed(() => { const block = this.block(); return block.type === 'space' ? block.size : undefined; });
  protected readonly spaceLabels = computed<Record<SpaceSize, string>>(() => ({
    small: this.i18n().article_editor_space_small(), medium: this.i18n().article_editor_space_medium(), large: this.i18n().article_editor_space_large(),
  }));

  // events
  protected readonly calendarKey = computed(() => { const block = this.block(); return block.type === 'events' && typeof block.calendarKey === 'string' ? block.calendarKey : ''; });
  /** one that is no longer offered stays chosen */
  private readonly offered = computed(() => {
    const key = this.calendarKey();
    return key === '' || this.calendars().some((calendar) => calendar.key === key) ? this.calendars() : [...this.calendars(), { key, name: key }];
  });
  protected readonly calendarKeys = computed(() => this.offered().map((calendar) => calendar.key));
  protected readonly calendarNames = computed(() => this.offered().map((calendar) => calendar.name));
  protected readonly calendarI18n = computed<StringSelectI18n>(() => ({ name: 'calendarKey', label: this.i18n().article_editor_mail_events_calendar() }));
  protected readonly eventsTitle = computed(() => { const block = this.block(); return block.type === 'events' && typeof block.title === 'string' ? block.title : ''; });
  protected readonly eventsTitleI18n = computed<TextInputI18n>(() => ({
    name: 'eventsTitle', label: this.i18n().article_editor_mail_events_title_label(), placeholder: this.i18n().article_editor_mail_events_title_placeholder(), helper: '',
  }));
  protected readonly maxEvents = computed(() => { const block = this.block(); return block.type === 'events' ? block.maxEvents : EVENTS_CONFIG_SHAPE.maxEvents; });
  protected readonly maxEventsI18n = computed<NumberInputI18n>(() => ({
    name: 'maxEvents', label: this.i18n().article_editor_mail_events_max_label(), placeholder: '', helper: fill(this.i18n().article_editor_mail_events_max_helper(), { max: MAX_MAIL_EVENTS }),
  }));

  // errors
  /** under the list stands what has no field of its own: a missing picture has a note, alt text and link have fields once there is one */
  protected readonly imageListErrors = computed<SectionErrors>(() => {
    const own = this.pictureMissing() ? ['images[0].url'] : ['images[0].altText', 'images[0].actionUrl', 'images[0].credit'];
    return Object.fromEntries(Object.entries(this.errors()).filter(([field]) => !own.includes(field)));
  });
  /** a picture in a text that a mail cannot show has its own words; any other error of the html is a missing German text */
  protected readonly htmlPictureErrors = computed(() => this.errorsFor('html').filter((message) => message === MAIL_TEXT_PICTURE_MESSAGE));
  protected readonly htmlOtherError = computed(() => this.errorsFor('html').some((message) => message !== MAIL_TEXT_PICTURE_MESSAGE));
  /** the errors of a gallery under the names of its look card */
  protected readonly lookErrors = computed(() => galleryErrors(this.errors(), this.block()));
  protected readonly rest = computed(() => restErrors(this.lookErrors(), shownBlockFields(this.block(), this.profile(), this.column() !== undefined)));

  /************************************** changes *********************************************** */
  /** Emits the block with these fields; a field that is undefined is left out. Nothing is emitted if that is no change. */
  protected patch(changes: Record<string, unknown>): void {
    const next: Record<string, unknown> = { ...this.block(), ...changes };
    for (const key of Object.keys(changes)) if (next[key] === undefined) delete next[key];
    this.emit(next as unknown as MailBlock);
  }

  private emit(next: MailBlock): void {
    const block = this.onlyLinks() ? withMailLinks(next) : next;
    if (!isSameValue(block, this.block())) this.blockChange.emit(block);
  }

  protected setAlign(value: unknown): void {
    if (this.aligns.includes(value as BlockAlign)) this.patch({ align: value === 'left' ? undefined : value });
  }

  protected setTone(value: unknown): void {
    if (this.profile().tones.includes(value as CalloutTone)) this.patch({ tone: value });
  }

  protected setSpace(value: unknown): void {
    if (this.spaceSizes.includes(value as SpaceSize)) this.patch({ size: value });
  }

  /** the list holds one picture; none = the block is as new */
  protected setImage(images: ImageConfig[]): void {
    this.patch({ image: images[0] ?? { ...IMAGE_CONFIG_SHAPE, url: '' } });
  }

  protected patchImage(changes: Partial<ImageConfig>): void {
    this.patch({ image: { ...this.image(), ...changes } });
  }

  protected setImageStyle(style: ImageStyle): void {
    this.patch({ imageStyle: compactImageStyle(style) });
  }

  protected setCaptionPosition(position: string): void {
    if (position !== this.captionPosition()) this.patchStyle({ captionPosition: position as ImageStyle['captionPosition'] });
  }

  protected setWidth(width: string): void {
    if (width !== this.width()) this.patchStyle({ width });
  }

  /** of a mail: what is stored beside it stays as it is */
  private patchStyle(changes: Partial<ImageStyle>): void {
    const block = this.block();
    if (block.type === 'image' || block.type === 'gallery') this.setImageStyle({ ...resolveImageStyle(block.imageStyle), ...changes });
  }

  /** reads the credit from the file's IPTC/EXIF metadata; the panel may show another block when it arrives */
  protected async readCreditFromFile(): Promise<void> {
    const { id } = this.block();
    const url = this.image().url;
    if (!url) return;
    this.readingCredit.set(true);
    this.creditWasEmpty.set(undefined);
    try {
      const credit = await this.uploadService.readImageCredit(url);
      if (this.destroyRef.destroyed || this.block().id !== id) return;
      if (credit) this.patchImage({ credit });
      else this.creditWasEmpty.set(id);
    } finally {
      this.readingCredit.set(false);
    }
  }

  /** «Aus diesem Artikel»: a copy of the picture with all its texts */
  protected async pick(): Promise<void> {
    const { id } = this.block();
    const image = await pickArticleImage(this.modalController, this.choices(), this.i18n());
    // the panel may be gone or show another block by now
    const block = this.block();
    if (!image || this.destroyRef.destroyed || block.id !== id) return;
    if (block.type === 'image') this.patch({ image });
    else if (block.type === 'gallery') this.patch({ images: [...this.images(), image] });
  }

  protected setCta(ctas: SectionCta[]): void {
    if (ctas[0]) this.patch({ cta: ctas[0] });
  }

  // columns
  protected setCount(value: unknown): void {
    const count = this.counts.find((n) => n === Number(value));
    if (count) this.emit(setColumnCount(this.block() as ColumnsBlock, count));
  }

  protected setSizes(sizes: number[]): void {
    this.emit(setColumnSizes(this.block() as ColumnsBlock, sizes));
  }

  protected setSize(index: number, value: unknown): void {
    this.setSizes(resizeColumn(this.sizes(), index, Number(value)));
  }

  protected setColumnWidth(value: unknown, column: { size: number; count: number }): void {
    const size = Number(value);
    if (Number.isInteger(size) && size !== column.size) this.columnSizeChange.emit(size);
  }

  /************************************** texts *********************************************** */
  protected maxSize(count: number): number { return 12 - (count - 1); }
  protected isCurrent(preset: number[]): boolean { return preset.every((size, i) => size === this.sizes()[i]); }
  protected presetLabel(preset: number[]): string { return fill(this.i18n().article_editor_columns_preset(), { sizes: preset.join('/') }); }
  protected columnLabel(index: number): string { return fill(this.i18n().article_editor_columns_column(), { n: index + 1 }); }
  protected sizeLabel(size: number): string { return fill(this.i18n().article_editor_columns_size(), { size }); }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
