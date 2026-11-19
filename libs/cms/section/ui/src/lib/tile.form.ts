import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonRow, IonSelect, IonSelectOption
} from '@ionic/angular';

import { TILE_IMAGE_FITS, TILE_TONES, TileImageFit, TileItem, TileTone, TileVariant } from '@okr/shared-models';
import { ErrorNote, IconInput, ImageUrlInput, ImageUrlInputI18n, TextareaInput, TextInput, TextInputI18n } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  SectionI18n, TILE_IMAGE_URL_LENGTH, TILE_LINK_LABEL_LENGTH, TILE_TEXT_LENGTH, TILE_TITLE_LENGTH, TILE_URL_LENGTH, TILE_VALUE_LENGTH, tileValidations
} from '@okr/cms-section-util';

/**
 * The fields of one tile, grouped the way the tile is drawn: the tile itself (title and text, or value
 * and caption for a stat), its icon (name and colour) and its link (text and target). A stat tile has
 * no icon and no link, only its colour. Dumb form: the parent modal owns saving through its
 * change-confirmation banner. Only the plain German fields are edited — translations stay untouched.
 */
@Component({
  selector: 'okr-tile-form',
  standalone: true,
  imports: [
    TextInput, TextareaInput, IconInput, ImageUrlInput, ErrorNote, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonSelect, IonSelectOption, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-title { display: flex; align-items: center; gap: 8px; font-size: 1.1rem; }
    ion-card-title ion-icon { width: 24px; height: 24px; }
    .tone-primary { color: var(--ion-color-primary); }
    .tone-secondary { color: var(--ion-color-secondary); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().tiles_group_tile() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                @if (variant() === 'stat') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="valueI18n()" [value]="value()" (valueChange)="onFieldChange('value', $event)"
                                    [autofocus]="true" [maxLength]="valueLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="valueErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="captionI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                                    [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="titleErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-select [label]="i18n().tiles_tone_label()" labelPlacement="stacked" interface="popover"
                                [value]="tone()" [disabled]="isReadOnly()" (ionChange)="onFieldChange('tone', $event.detail.value)">
                      @for (t of tones; track t) {
                        <ion-select-option [value]="t">{{ toneLabels()[t] }}</ion-select-option>
                      }
                    </ion-select>
                    <okr-error-note [errors]="toneErrors()" />
                  </ion-col>
                } @else {
                  <ion-col size="12">
                    <okr-text-input [i18n]="itemTitleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                                    [autofocus]="true" [maxLength]="titleLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="titleErrors()" />
                  </ion-col>
                  <ion-col size="12">
                    <okr-textarea-input [i18n]="textI18n()" [value]="text()" (valueChange)="onFieldChange('text', $event)"
                                        [maxLength]="textLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="textErrors()" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (variant() === 'card') {
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ i18n().tiles_group_icon() }}
                @if (icon()) { <ion-icon [class]="'tone-' + tone()" src="{{ icon() | svgIcon }}" /> }
              </ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-icon-input [i18n]="iconI18n()" [icon]="icon()" (iconChange)="onFieldChange('icon', $event)"
                                    (selectClicked)="iconSelectClicked.emit()" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-select [label]="i18n().tiles_tone_label()" labelPlacement="stacked" interface="popover"
                                [value]="tone()" [disabled]="isReadOnly()" (ionChange)="onFieldChange('tone', $event.detail.value)">
                      @for (t of tones; track t) {
                        <ion-select-option [value]="t">{{ toneLabels()[t] }}</ion-select-option>
                      }
                    </ion-select>
                    <okr-error-note [errors]="toneErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if (variant() === 'image') {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().tiles_group_image() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="8">
                    <okr-image-url-input [i18n]="imageUrlI18n()" [value]="imageUrl()" (valueChange)="onFieldChange('imageUrl', $event)"
                                         [maxLength]="imageUrlLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="imageUrlErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="4">
                    <ion-select [label]="i18n().tiles_imageFit_label()" labelPlacement="stacked" interface="popover"
                                [value]="imageFit()" [disabled]="isReadOnly()" (ionChange)="onFieldChange('imageFit', $event.detail.value)">
                      @for (f of imageFits; track f) {
                        <ion-select-option [value]="f">{{ imageFitLabels()[f] }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if (variant() !== 'stat') {
          <ion-card>
            <ion-card-header>
              <ion-card-title>{{ i18n().tiles_group_link() }}</ion-card-title>
            </ion-card-header>
            <ion-card-content class="ion-no-padding">
              <ion-grid>
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="linkLabelI18n()" [value]="linkLabel()" (valueChange)="onFieldChange('linkLabel', $event)"
                                    [maxLength]="linkLabelLength" [readOnly]="isReadOnly()" [showHelper]="true" />
                    <okr-error-note [errors]="linkLabelErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)"
                                    [maxLength]="urlLength" [readOnly]="isReadOnly()" [showHelper]="true" inputMode="url" />
                    <okr-error-note [errors]="urlErrors()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }
      </form>
    }
  `,
})
export class TileForm {
  // inputs
  public readonly i18n = input.required<SectionI18n>();
  public formData = model.required<TileItem>();
  public readonly variant = input.required<TileVariant>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  public readonly iconSelectClicked = output<void>();

  // signal form — the suite needs the variant, which validateVestTree does not pass
  private readonly suiteWithContext = (model: TileItem) => tileValidations(model, this.variant());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly tileForm = form(this.formData, (path) => validateVestTree(path, this.suiteWithContext as any));
  // the error notes read the same run back off the form — the suite runs once per change
  private readonly validationResult = vestErrors(this.tileForm);

  constructor() {
    effect(() => this.valid.emit(this.tileForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly valueLength = TILE_VALUE_LENGTH;
  protected readonly titleLength = TILE_TITLE_LENGTH;
  protected readonly textLength = TILE_TEXT_LENGTH;
  protected readonly linkLabelLength = TILE_LINK_LABEL_LENGTH;
  protected readonly urlLength = TILE_URL_LENGTH;
  protected readonly imageUrlLength = TILE_IMAGE_URL_LENGTH;
  protected readonly tones = TILE_TONES;
  protected readonly imageFits = TILE_IMAGE_FITS;

  // fields
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly value = computed(() => this.formData()?.value ?? '');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly text = computed(() => this.formData()?.text ?? '');
  protected readonly icon = computed(() => this.formData()?.icon ?? '');
  protected readonly tone = computed<TileTone>(() => this.formData()?.tone ?? 'primary');
  protected readonly linkLabel = computed(() => this.formData()?.linkLabel ?? '');
  protected readonly url = computed(() => this.formData()?.url ?? '');
  protected readonly imageUrl = computed(() => this.formData()?.imageUrl ?? '');
  protected readonly imageFit = computed<TileImageFit>(() => this.formData()?.imageFit ?? 'cover');

  // errors
  protected readonly valueErrors = computed(() => this.validationResult().getErrors('value'));
  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly textErrors = computed(() => this.validationResult().getErrors('text'));
  protected readonly toneErrors = computed(() => this.validationResult().getErrors('tone'));
  protected readonly linkLabelErrors = computed(() => this.validationResult().getErrors('linkLabel'));
  protected readonly urlErrors = computed(() => this.validationResult().getErrors('url'));
  protected readonly imageUrlErrors = computed(() => this.validationResult().getErrors('imageUrl'));

  // i18n
  protected readonly toneLabels = computed<Record<TileTone, string>>(() => ({
    primary: this.i18n().tiles_tone_primary(), secondary: this.i18n().tiles_tone_secondary(),
  }));
  protected readonly imageFitLabels = computed<Record<TileImageFit, string>>(() => ({
    cover: this.i18n().tiles_imageFit_cover(), contain: this.i18n().tiles_imageFit_contain(),
  }));
  protected readonly imageUrlI18n = computed(() => this.textI18nOf('imageUrl', 'tiles_image_label', 'tiles_image_placeholder', 'tiles_image_helper') as ImageUrlInputI18n);
  protected readonly valueI18n = computed(() => this.textI18nOf('value', 'tiles_value_label', 'tiles_value_placeholder', 'tiles_value_helper'));
  protected readonly captionI18n = computed(() => this.textI18nOf('title', 'tiles_caption_label', 'tiles_caption_placeholder'));
  protected readonly itemTitleI18n = computed(() => this.textI18nOf('title', 'tiles_itemTitle_label', 'tiles_itemTitle_placeholder'));
  protected readonly textI18n = computed(() => this.textI18nOf('text', 'tiles_text_label', 'tiles_text_placeholder'));
  protected readonly iconI18n = computed(() => this.textI18nOf('icon', 'tiles_icon_label', 'tiles_icon_placeholder', 'tiles_icon_helper'));
  protected readonly linkLabelI18n = computed(() => this.textI18nOf('linkLabel', 'tiles_linkLabel_label', 'tiles_linkLabel_placeholder', 'tiles_linkLabel_helper'));
  protected readonly urlI18n = computed(() => this.textI18nOf('url', 'tiles_url_label', 'tiles_url_placeholder', 'tiles_url_helper'));

  private textI18nOf(name: string, label: keyof SectionI18n, placeholder: keyof SectionI18n, helper?: keyof SectionI18n): TextInputI18n {
    const i = this.i18n();
    return { name, label: i[label](), placeholder: i[placeholder](), helper: helper ? i[helper]() : '' };
  }

  protected onFieldChange(fieldName: keyof TileItem, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
