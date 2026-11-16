import { Component, computed, input, model, signal } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonGrid, IonLabel, IonRow,
  IonSegment, IonSegmentButton
} from '@ionic/angular';

import { HeroConfig, IMAGE_CONFIG_SHAPE, IMAGE_STYLE_SHAPE, ImageConfig, ImageStyle, UserModel } from '@okr/shared-models';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { getErrorSegments, getFieldErrors, LOGO_SEGMENT_FIELDS, SectionErrors, SectionI18n } from '@okr/cms-section-util';

import { ImagesConfiguration } from './images-configuration';
import { heroSlotImages, slotErrors } from './hero-image-slot';

type Segment = 'image' | 'style';
type LogoStyleField = 'width' | 'border' | 'borderRadius';

/**
 * The optional logo of a hero, drawn at the top of the white text box over the cover image.
 * - **Bild**: the logo as a one-image list with its thumbnail (upload, edit, remove).
 * - **Stil**: width, border and corner radius of the logo. These are the only parts of the hero's image style
 *   that still act: the cover image always fills the hero without a frame, caption or click action.
 */
@Component({
  selector: 'okr-hero-logo-config',
  standalone: true,
  imports: [
    ErrorNote, TextInput, ImagesConfiguration,
    IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonGrid, IonRow, IonCol, IonLabel,
    IonSegment, IonSegmentButton
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    .error-dot { display: inline-block; width: 8px; height: 8px; margin-inline-start: 6px; border-radius: 50%; background: var(--ion-color-danger); vertical-align: middle; }
  `],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().hero_logo_title() }}</ion-card-title>
        <ion-card-subtitle>{{ i18n().hero_logo_subtitle() }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event.detail.value)">
          <ion-segment-button value="image">
            <ion-label>{{ i18n().hero_logo_segment_image() }}@if (hasErrors('image')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="style">
            <ion-label>{{ i18n().hero_logo_segment_style() }}@if (hasErrors('style')) {<span class="error-dot" role="img" [attr.aria-label]="i18n().segment_errors()"></span>}</ion-label>
          </ion-segment-button>
        </ion-segment>

        @switch (segment()) {
          @case ('image') {
            <okr-images-config
              [images]="logoImages()" (imagesChange)="onLogoImagesChange($event)"
              [multiple]="false"
              [embedded]="true"
              [emptyText]="i18n().hero_logo_empty()"
              [storagePath]="storagePath()"
              [currentUser]="currentUser()"
              [readOnly]="isReadOnly()"
              [i18n]="i18n()"
            />
            <okr-error-note [errors]="logoImageErrors()" />
          }
          @case ('style') {
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="4">
                  <okr-text-input [i18n]="widthI18n()" [value]="imageStyle().width" (valueChange)="onStyleChange('width', $event)"
                                  [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('width')" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-text-input [i18n]="borderI18n()" [value]="imageStyle().border" (valueChange)="onStyleChange('border', $event)"
                                  [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('border')" />
                </ion-col>
                <ion-col size="12" size-md="4">
                  <okr-text-input [i18n]="borderRadiusI18n()" [value]="imageStyle().borderRadius" (valueChange)="onStyleChange('borderRadius', $event)"
                                  [readOnly]="isReadOnly()" [showHelper]="true" />
                  <okr-error-note [errors]="errorsFor('borderRadius')" />
                </ion-col>
              </ion-row>
            </ion-grid>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class HeroLogoConfiguration {
  // inputs
  public readonly formData = model.required<HeroConfig>();
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // until the user picks a segment, the card opens on the first one with errors
  private readonly chosenSegment = signal<Segment | undefined>(undefined);
  private readonly offeredSegments: Segment[] = ['image', 'style'];
  protected readonly errorSegments = computed(() => getErrorSegments(this.errors(), LOGO_SEGMENT_FIELDS, this.offeredSegments));
  protected readonly segment = computed<Segment>(() => this.chosenSegment() ?? this.errorSegments()[0] ?? 'image');

  protected readonly logoImages = computed(() => heroSlotImages(this.formData().logo));
  protected readonly logoImageErrors = computed(() => slotErrors(this.errors(), 'logo'));
  protected readonly imageStyle = computed<ImageStyle>(() => this.formData().imageStyle ?? IMAGE_STYLE_SHAPE);

  // labels: the same texts as the image style card
  protected readonly widthI18n = computed(() => ({
    name: 'width', label: this.i18n().width_label(), placeholder: this.i18n().width_placeholder(), helper: this.i18n().width_helper(),
  } as TextInputI18n));
  protected readonly borderI18n = computed(() => ({
    name: 'border', label: this.i18n().border_label(), placeholder: this.i18n().border_placeholder(), helper: this.i18n().border_helper(),
  } as TextInputI18n));
  protected readonly borderRadiusI18n = computed(() => ({
    name: 'borderRadius', label: this.i18n().borderRadius_label(), placeholder: this.i18n().borderRadius_placeholder(), helper: this.i18n().borderRadius_helper(),
  } as TextInputI18n));

  /************************************** actions *********************************************** */
  protected onSegmentChange(value: string | number | undefined): void {
    if (value === 'image' || value === 'style') this.chosenSegment.set(value);
  }

  /** one image at most: a new upload replaces the logo, removing it leaves an empty image (no logo) */
  protected onLogoImagesChange(images: ImageConfig[]): void {
    this.formData.update((config) => ({ ...config, logo: images[images.length - 1] ?? IMAGE_CONFIG_SHAPE }));
  }

  protected onStyleChange(field: LogoStyleField, value: string): void {
    this.formData.update((config) => ({ ...config, imageStyle: { ...(config.imageStyle ?? IMAGE_STYLE_SHAPE), [field]: value } }));
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
