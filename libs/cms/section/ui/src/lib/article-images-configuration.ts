import { Component, computed, inject, input, model, signal } from '@angular/core';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonLabel, IonNote, IonRow,
  IonSegment, IonSegmentButton, ModalController
} from '@ionic/angular';

import { ViewPositions } from '@okr/shared-categories';
import { ArticleSlideshow, EDITOR_CONFIG_SHAPE, EditorConfig, ImageConfig, ImageStyle, SLIDESHOW_EFFECTS, SlideshowEffect, UserModel, ViewPosition } from '@okr/shared-models';
import { CategoryOld, CategoryOldI18n, Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { ARTICLE_IMAGES_SEGMENT_FIELDS, DEFAULT_SLIDESHOW, SLIDESHOW_DURATION_MAX, SLIDESHOW_INTERVAL_MAX, articleImagePosition, getErrorSegments, getFieldErrors, ImageLayoutId, resolveImageLayout, SectionErrors, SectionI18n } from '@okr/cms-section-util';

import { ImagesConfiguration } from './images-configuration';
import { ImageStyleConfiguration } from './image-style-configuration';
import { ImageLayoutPreview } from './image-layout-preview';
import { ImageLayoutSelectModal } from './image-layout-select.modal';

type Segment = 'select' | 'layout' | 'styles';

/** Mosaic and big-grid read well with six pictures; the picker caps its thumbnails the same way. */
const MAX_PREVIEW_COUNT = 6;

/** `big-small` → `bigSmall`, the suffix of the SECTION_I18N_KEYS names. */
const keyOf = (id: ImageLayoutId): string => id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

/** with more than one image the images span the full width: above or below the text (plan decision 6) */
const MULTI_IMAGE_POSITIONS = ViewPositions.filter((p) => p.id === ViewPosition.Top || p.id === ViewPosition.Bottom);

/**
 * The «Bilder» card of an article (spec 1.154 §5): one card with three segments.
 * - **Auswahl**: the image list (add, sort, edit one image).
 * - **Layout**: with several images the current layout and the picker; the position of the images (left/right and
 *   the column size only with exactly one image); the caption and action groups of the image style.
 * - **Styles**: the rest of the image style (advanced only).
 *
 * Journal mode (plan decision 8): Auswahl with the journal's picker and Layout with only the layout picker and the
 * caption group; the journal record carries no position, column size or action, and no Styles.
 */
@Component({
  selector: 'okr-article-images-config',
  standalone: true,
  imports: [
    CategoryOld, Checkbox, StringSelect, ErrorNote, NumberInput, ImagesConfiguration, ImageStyleConfiguration, ImageLayoutPreview,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonLabel, IonNote, IonButton,
    IonSegment, IonSegmentButton
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .layout-current { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .layout-preview { width: 160px; max-width: 100%; }
    .layout-name { font-weight: 600; margin-bottom: 4px; }
    .error-dot { display: inline-block; width: 8px; height: 8px; margin-inline-start: 6px; border-radius: 50%; background: var(--ion-color-danger); vertical-align: middle; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().article_images_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
          <ion-segment-button value="select">
            <ion-label>{{ i18n().article_images_segment_select() }}@if (hasErrors('select')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="layout">
            <ion-label>{{ i18n().article_images_segment_layout() }}@if (hasErrors('layout')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          @if (stylesAvailable()) {
            <ion-segment-button value="styles">
              <ion-label>{{ i18n().article_images_segment_styles() }}@if (hasErrors('styles')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>

        @switch (segment()) {
          @case ('select') {
            <okr-images-config
              [images]="images()" (imagesChange)="images.set($event)"
              [embedded]="true"
              [emptyText]="emptyText()"
              [requirePicker]="journalMode()"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
          @case ('layout') {
            <ion-grid>
              <ion-row>
                @if (count() === 0) {
                  <ion-col size="12">
                    <ion-note>{{ i18n().article_images_layout_empty() }}</ion-note>
                  </ion-col>
                }
                @if (layout(); as layout) {
                  <ion-col size="12">
                    <div class="layout-current">
                      <okr-image-layout-preview class="layout-preview" [layout]="layout" [count]="previewCount()" [label]="layoutName()" aria-hidden="true" />
                      <div>
                        <div class="layout-name">{{ layoutName() }}</div>
                        <ion-button fill="outline" size="small" [disabled]="isReadOnly()" (click)="chooseLayout()">
                          {{ i18n().article_images_layout_choose() }}
                        </ion-button>
                      </div>
                    </div>
                  </ion-col>
                }
                <!-- the slideshow (la21staefa header): only for the carousel layout with two or more images -->
                @if (!journalMode() && layout() === 'slider') {
                  <ion-col size="12" size-md="6">
                    <okr-string-select [i18n]="effectI18n()" [selectedString]="slideshowEffect()" (selectedStringChange)="onEffectChange($event)"
                      [stringList]="effects" [labels]="effectLabels()" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="errorsFor('slideshow.effect')" />
                  </ion-col>
                  @if (slideshow(); as show) {
                    <ion-col size="12" size-md="6">
                      <okr-checkbox [i18n]="autoplayI18n()" [checked]="show.autoplay" (checkedChange)="onSlideshowField('autoplay', $event)" [readOnly]="isReadOnly()" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="intervalI18n()" [value]="show.interval" (valueChange)="onSlideshowField('interval', $event)"
                        [min]="1" [max]="intervalMax" [maxLength]="4" [showHelper]="true" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="errorsFor('slideshow.interval')" />
                    </ion-col>
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="durationI18n()" [value]="show.duration" (valueChange)="onSlideshowField('duration', $event)"
                        [min]="0.2" [max]="durationMax" [maxLength]="4" [showHelper]="true" [readOnly]="isReadOnly()" />
                      <okr-error-note [errors]="errorsFor('slideshow.duration')" />
                    </ion-col>
                  }
                }
                <!-- shown with any image count, so an unknown stored id with two or more images never blocks saving silently (below two images the layout is ignored and not validated) -->
                <ion-col size="12">
                  <okr-error-note [errors]="errorsFor('imageLayout')" />
                </ion-col>
                @if (!journalMode() && count() > 0) {
                  <ion-col size="12" size-md="6">
                    <okr-category-old [i18n]="positionI18n()" [value]="position()" (valueChange)="onPositionChange($event)"
                                      [readOnly]="isReadOnly()" [categories]="positions()" />
                  </ion-col>
                  @if (count() === 1) {
                    <ion-col size="12" size-md="6">
                      <okr-number-input [i18n]="colSizeI18n()" [value]="colSize()" (valueChange)="onColSizeChange($event)"
                                        [readOnly]="isReadOnly()" [showHelper]="true" />
                    </ion-col>
                  }
                }
              </ion-row>
            </ion-grid>
            @if (count() > 0) {
              <!-- caption (and outside the journal the action): moved here from the image style, no longer advanced-only -->
              <okr-image-style
                [formData]="imageStyle()" (formDataChange)="imageStyle.set($event)"
                [embedded]="true"
                [showImageGroup]="false"
                [showCaption]="true"
                [showAction]="!journalMode()"
                [showAdvanced]="true"
                [readOnly]="isReadOnly()"
                [i18n]="i18n()"
                [errors]="errors()"
              />
            } @else if (!journalMode()) {
              <okr-error-note [errors]="errorsFor('action')" />
              <okr-error-note [errors]="errorsFor('zoomFactor')" />
            }
          }
          @case ('styles') {
            <okr-image-style
              [formData]="imageStyle()" (formDataChange)="imageStyle.set($event)"
              [embedded]="true"
              [showCaption]="false"
              [showAction]="false"
              [showAdvanced]="true"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
              [errors]="errors()"
            />
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class ArticleImagesConfiguration {
  private readonly modalController = inject(ModalController);

  // inputs
  public readonly images = model.required<ImageConfig[]>();
  public readonly imageStyle = model.required<ImageStyle>();
  /** the stored layout id; undefined = slider (today's carousel) */
  public readonly imageLayout = model<string | undefined>(undefined);
  /** position and column size of the images (CMS only; the journal record has none) */
  public readonly content = model<EditorConfig>(EDITOR_CONFIG_SHAPE);
  /** the self-running slideshow of the carousel; undefined = swipe only */
  public readonly slideshow = model<ArticleSlideshow | undefined>(undefined);
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  /** the section form's advanced toggle: the Styles segment appears only with it */
  public readonly showAdvanced = input(false);
  /** travel journal (spec 1.154): photos from the journal's picker; no position, column size, action or Styles */
  public readonly journalMode = input(false);
  public readonly emptyText = input('');
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly stylesAvailable = computed(() => !this.journalMode() && this.showAdvanced());

  // segments: until the user picks one, the card opens on the first segment with errors (so an invalid stored
  // value is never hidden behind a closed segment); a chosen segment that is no longer offered (Styles after the
  // advanced toggle went off) falls back the same way
  private readonly chosenSegment = signal<Segment | undefined>(undefined);
  private readonly offeredSegments = computed<Segment[]>(() => this.stylesAvailable() ? ['select', 'layout', 'styles'] : ['select', 'layout']);
  protected readonly errorSegments = computed(() => getErrorSegments(this.errors(), ARTICLE_IMAGES_SEGMENT_FIELDS, this.offeredSegments()));
  protected readonly segment = computed<Segment>(() => {
    const chosen = this.chosenSegment();
    if (chosen && this.offeredSegments().includes(chosen)) return chosen;
    return this.errorSegments()[0] ?? 'select';
  });

  // layout
  protected readonly count = computed(() => this.images().length);
  /** the layout that renders for the current count; undefined with fewer than two images */
  protected readonly layout = computed(() => resolveImageLayout(this.imageLayout(), this.count()));
  protected readonly previewCount = computed(() => Math.min(this.count(), MAX_PREVIEW_COUNT));
  protected readonly layoutName = computed(() => {
    const layout = this.layout();
    return layout ? (this.i18n() as unknown as Record<string, () => string>)[`layout_${keyOf(layout)}_label`]?.() ?? layout : '';
  });

  // position: the one the article renders with (several images: top, or bottom only with a layout)
  protected readonly position = computed(() => this.count() > 1
    ? articleImagePosition(this.content().position, this.count(), this.imageLayout())
    : this.content().position ?? ViewPosition.None);
  protected readonly positions = computed(() => this.count() > 1 ? MULTI_IMAGE_POSITIONS : ViewPositions);
  protected readonly colSize = computed(() => this.content().colSize ?? 4);

  // slideshow
  protected readonly effects = [...SLIDESHOW_EFFECTS] as string[];
  protected readonly intervalMax = SLIDESHOW_INTERVAL_MAX;
  protected readonly durationMax = SLIDESHOW_DURATION_MAX;
  protected readonly slideshowEffect = computed(() => this.slideshow()?.effect ?? 'none');
  protected readonly effectLabels = computed(() => [
    this.i18n().article_slideshow_effect_none(), this.i18n().article_slideshow_effect_fade(), this.i18n().article_slideshow_effect_slide(),
    this.i18n().article_slideshow_effect_zoom(), this.i18n().article_slideshow_effect_kenburns(),
  ]);
  protected readonly effectI18n = computed((): StringSelectI18n => ({ name: 'slideshowEffect', label: this.i18n().article_slideshow_effect_label() }));
  protected readonly autoplayI18n = computed((): CheckboxI18n => ({ name: 'slideshowAutoplay', label: this.i18n().article_slideshow_autoplay_label(), helper: '' }));
  protected readonly intervalI18n = computed((): NumberInputI18n => ({
    name: 'slideshowInterval', label: this.i18n().article_slideshow_interval_label(), placeholder: '', helper: this.i18n().article_slideshow_interval_helper(),
  }));
  protected readonly durationI18n = computed((): NumberInputI18n => ({
    name: 'slideshowDuration', label: this.i18n().article_slideshow_duration_label(), placeholder: '', helper: this.i18n().article_slideshow_duration_helper(),
  }));

  // labels
  protected readonly positionI18n = computed(() => ({ name: 'position', label: this.i18n().editor_position_label() } as CategoryOldI18n));
  protected readonly colSizeI18n = computed(() => ({
    name: 'colSize', label: this.i18n().editor_colSize_label(), placeholder: this.i18n().editor_colSize_placeholder(), helper: this.i18n().editor_colSize_helper(),
  } as NumberInputI18n));

  /************************************** actions *********************************************** */
  protected onSegmentChange(value: string | number | undefined): void {
    if (value === 'select' || value === 'layout' || value === 'styles') this.chosenSegment.set(value);
  }

  protected async chooseLayout(): Promise<void> {
    if (this.isReadOnly()) return;
    const modal = await this.modalController.create({
      component: ImageLayoutSelectModal,
      componentProps: { count: this.count(), current: this.imageLayout() },
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && typeof data === 'string') this.imageLayout.set(data);
  }

  protected onPositionChange(position: ViewPosition): void {
    this.content.update((content) => ({ ...content, position }));
    // several images without a stored layout always render on top (existing articles must not move, decision 6);
    // an explicit «below» therefore stores today's slider, which honours it
    if (this.count() > 1 && position === ViewPosition.Bottom && this.imageLayout() === undefined) {
      this.imageLayout.set(this.layout());
    }
  }

  /** 'none' removes the setting (absent = swipe only); switching one on starts from the la21staefa defaults */
  protected onEffectChange(effect: string): void {
    if (effect === 'none') { this.slideshow.set(undefined); return; }
    this.slideshow.update((show) => ({ ...(show ?? DEFAULT_SLIDESHOW), effect: effect as SlideshowEffect }));
  }

  protected onSlideshowField(field: 'autoplay' | 'interval' | 'duration', value: boolean | number): void {
    this.slideshow.update((show) => ({ ...(show ?? DEFAULT_SLIDESHOW), [field]: value }));
  }

  protected onColSizeChange(colSize: number): void {
    this.content.update((content) => ({ ...content, colSize }));
  }

  /** whether a segment holds an error: its button gets a marker */
  protected hasErrors(segment: Segment): boolean {
    return this.errorSegments().includes(segment);
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
