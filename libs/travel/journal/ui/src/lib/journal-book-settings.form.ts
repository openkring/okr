import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  BOOK_BLEED_MAX_MM, BOOK_COVER_TYPES, BOOK_PAGE_MULTIPLE_MAX, BOOK_SPINE_MAX_MM, BOOK_WRAP_MAX_MM, BookSettingsFormModel, bookSettingsValidations,
  JournalBookI18n,
} from '@okr/travel-journal-util';

/** A photo the author may pick as the cover: its image key and a thumbnail URL. */
export interface BookCoverChoice { key: string; url: string }

/**
 * The book settings (design §5.1, §5.3): title, subtitle, cover photo and the print settings. Spine and wrap only with
 * a cover. The parent modal saves.
 */
@Component({
  selector: 'okr-journal-book-settings-form',
  standalone: true,
  imports: [TextInput, NumberInput, StringSelect, ErrorNote, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonGrid, IonRow, IonCol],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .covers { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 6px; padding: 8px 16px 16px; }
    .cover { aspect-ratio: 3 / 2; border-radius: 6px; overflow: hidden; border: 2px solid transparent; background: var(--ion-color-light);
      cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: var(--ion-color-medium); }
    .cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .cover.selected { border-color: var(--ion-color-tertiary); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="subTitleI18n()" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)"
                    [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="subTitleErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().settings_cover_photo() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <div class="covers">
              <button type="button" class="cover" [class.selected]="coverImageKey() === ''" [disabled]="isReadOnly()"
                (click)="onFieldChange('coverImageKey', '')">{{ i18n().settings_cover_photo_auto() }}</button>
              @for (c of covers(); track c.key) {
                <button type="button" class="cover" [class.selected]="coverImageKey() === c.key" [disabled]="isReadOnly()"
                  (click)="onFieldChange('coverImageKey', c.key)">
                  @if (c.url) { <img [src]="c.url" alt="" loading="lazy" /> }
                </button>
              }
            </div>
          </ion-card-content>
        </ion-card>

        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().settings_print() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="bleedI18n()" [value]="bleedMm()" (valueChange)="onFieldChange('bleedMm', $event)"
                    [min]="0" [max]="bleedMax" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="bleedErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="multipleI18n()" [value]="pageMultiple()" (valueChange)="onFieldChange('pageMultiple', $event)"
                    [min]="1" [max]="multipleMax" [integer]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="multipleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="coverI18n()" [stringList]="coverTypes" [labels]="coverLabels()"
                    [selectedString]="cover()" (selectedStringChange)="onFieldChange('cover', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="coverErrors()" />
                </ion-col>
              </ion-row>
              @if (cover() !== 'none') {
                <ion-row>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="spineI18n()" [value]="spineMm()" (valueChange)="onFieldChange('spineMm', $event)"
                      [min]="0" [max]="spineMax" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="spineErrors()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="wrapI18n()" [value]="wrapMm()" (valueChange)="onFieldChange('wrapMm', $event)"
                      [min]="0" [max]="wrapMax" [showHelper]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="wrapErrors()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class JournalBookSettingsForm {
  // inputs
  public readonly i18n = input.required<JournalBookI18n>();
  public formData = model.required<BookSettingsFormModel>();
  public readonly covers = input<BookCoverChoice[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly settingsForm = form(this.formData, (path) => validateVestTree(path, bookSettingsValidations as any));
  private readonly validationResult = vestErrors(this.settingsForm);

  /** kept in step with the caps the Vest suite enforces */
  protected readonly longNameLength = LONG_NAME_LENGTH;
  protected readonly bleedMax = BOOK_BLEED_MAX_MM;
  protected readonly multipleMax = BOOK_PAGE_MULTIPLE_MAX;
  protected readonly spineMax = BOOK_SPINE_MAX_MM;
  protected readonly wrapMax = BOOK_WRAP_MAX_MM;
  protected readonly coverTypes: string[] = [...BOOK_COVER_TYPES];

  public constructor() {
    effect(() => this.valid.emit(this.settingsForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly subTitle = computed(() => this.formData()?.subTitle ?? '');
  protected readonly coverImageKey = computed(() => this.formData()?.coverImageKey ?? '');
  protected readonly bleedMm = computed(() => this.formData()?.bleedMm ?? 0);
  protected readonly pageMultiple = computed(() => this.formData()?.pageMultiple ?? 1);
  protected readonly cover = computed(() => this.formData()?.cover ?? 'none');
  protected readonly spineMm = computed(() => this.formData()?.spineMm ?? 0);
  protected readonly wrapMm = computed(() => this.formData()?.wrapMm ?? 0);

  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly subTitleErrors = computed(() => this.validationResult().getErrors('subTitle'));
  protected readonly bleedErrors = computed(() => this.validationResult().getErrors('bleedMm'));
  protected readonly multipleErrors = computed(() => this.validationResult().getErrors('pageMultiple'));
  protected readonly coverErrors = computed(() => this.validationResult().getErrors('cover'));
  protected readonly spineErrors = computed(() => this.validationResult().getErrors('spineMm'));
  protected readonly wrapErrors = computed(() => this.validationResult().getErrors('wrapMm'));

  protected readonly titleI18n = computed(() => ({
    name: 'title', label: this.i18n().settings_title_label(), placeholder: this.i18n().settings_title_ph(), helper: this.i18n().settings_title_helper(),
  } as TextInputI18n));
  protected readonly subTitleI18n = computed(() => ({
    name: 'subTitle', label: this.i18n().settings_subtitle_label(), placeholder: this.i18n().settings_subtitle_ph(),
    helper: this.i18n().settings_subtitle_helper(),
  } as TextInputI18n));
  protected readonly bleedI18n = computed(() => ({
    name: 'bleedMm', label: this.i18n().settings_bleed_label(), placeholder: '3', helper: this.i18n().settings_bleed_helper(),
  } as NumberInputI18n));
  protected readonly multipleI18n = computed(() => ({
    name: 'pageMultiple', label: this.i18n().settings_multiple_label(), placeholder: '4', helper: this.i18n().settings_multiple_helper(),
  } as NumberInputI18n));
  protected readonly spineI18n = computed(() => ({
    name: 'spineMm', label: this.i18n().settings_spine_label(), placeholder: '0', helper: this.i18n().settings_spine_helper(),
  } as NumberInputI18n));
  protected readonly wrapI18n = computed(() => ({
    name: 'wrapMm', label: this.i18n().settings_wrap_label(), placeholder: '0', helper: this.i18n().settings_wrap_helper(),
  } as NumberInputI18n));
  protected readonly coverI18n = computed(() => ({
    name: 'cover', label: this.i18n().settings_cover_label(), helper: this.i18n().settings_cover_helper(),
  } as StringSelectI18n));
  protected readonly coverLabels = computed(() => {
    const i18n = this.i18n();
    return [i18n.settings_cover_none(), i18n.settings_cover_softcover(), i18n.settings_cover_hardcover()];
  });

  protected onFieldChange(fieldName: keyof BookSettingsFormModel, fieldValue: string | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
