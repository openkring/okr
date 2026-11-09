import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonNote, IonRow } from '@ionic/angular';

import { UploadService } from '@okr/avatar-data-access';
import { URL_LENGTH } from '@okr/shared-constants';
import { ImageConfig, ImageType } from '@okr/shared-models';
import { ErrorNote, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import { IMAGE_CAPTION_LENGTH, IMAGE_CREDIT_LENGTH, imageEditValidations, SectionI18n } from '@okr/cms-section-util';

const IMAGE_TYPE_NAMES = Object.keys(ImageType).filter(k => isNaN(Number(k)));

/**
 * The fields of one image (Bild-Konfiguration bearbeiten). Dumb form: the parent modal owns saving
 * through its change-confirmation banner.
 */
@Component({
  selector: 'okr-image-edit-form',
  standalone: true,
  imports: [
    TextInput, StringSelect, ErrorNote,
    IonButton, IonCard, IonCardContent, IonGrid, IonNote, IonRow, IonCol,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()" (valueChange)="onFieldChange('label', $event)" [autofocus]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="labelErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="imageTypeI18n()" [selectedString]="typeName()" (selectedStringChange)="onTypeChange($event)" [stringList]="imageTypeNames" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="typeErrors()" />
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="overlayI18n()" [value]="overlay()" (valueChange)="onFieldChange('overlay', $event)" [maxLength]="captionLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="overlayErrors()" />
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="creditI18n()" [value]="credit()" (valueChange)="onFieldChange('credit', $event)" [maxLength]="creditLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="creditErrors()" />
                  @if (!isReadOnly() && url()) {
                    <ion-button size="small" fill="clear" [disabled]="readingCredit()" (click)="readCreditFromFile()">
                      {{ i18n().image_edit_credit_read() }}
                    </ion-button>
                    @if (creditWasEmpty()) {
                      <ion-note class="ion-padding-start" color="medium">{{ i18n().image_edit_credit_read_empty() }}</ion-note>
                    }
                  }
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="altTextI18n()" [value]="altText()" (valueChange)="onFieldChange('altText', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="altTextErrors()" />
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="urlI18n()" [value]="url()" (valueChange)="onFieldChange('url', $event)" [maxLength]="urlLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="urlErrors()" />
                </ion-col>
                <ion-col size="12">
                  <okr-text-input [i18n]="actionUrlI18n()" [value]="actionUrl()" (valueChange)="onFieldChange('actionUrl', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="actionUrlErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class ImageEditForm {
  private readonly uploadService = inject(UploadService);

  // inputs
  public readonly i18n = input.required<SectionI18n>();
  public formData = model.required<ImageConfig>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected readonly imageForm = form(this.formData, (path) => validateVestTree(path, imageEditValidations as any));
  // the error notes read the same run back off the form — the suite runs once per change
  private readonly validationResult = vestErrors(this.imageForm);

  constructor() {
    effect(() => this.valid.emit(this.imageForm().valid()));
  }

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly captionLength = IMAGE_CAPTION_LENGTH;
  protected readonly creditLength = IMAGE_CREDIT_LENGTH;
  protected readonly urlLength = URL_LENGTH;

  // state of the "read attribution from the image file" action
  protected readonly readingCredit = signal(false);
  protected readonly creditWasEmpty = signal(false);

  // fields
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly label = computed(() => this.formData()?.label ?? '');
  protected readonly url = computed(() => this.formData()?.url ?? '');
  protected readonly actionUrl = computed(() => this.formData()?.actionUrl ?? '');
  protected readonly altText = computed(() => this.formData()?.altText ?? '');
  protected readonly overlay = computed(() => this.formData()?.overlay ?? '');
  protected readonly credit = computed(() => this.formData()?.credit ?? '');
  protected readonly typeName = computed(() => ImageType[this.formData()?.type] ?? 'Image');
  protected readonly imageTypeNames = IMAGE_TYPE_NAMES;

  // errors
  protected readonly labelErrors = computed(() => this.validationResult().getErrors('label'));
  protected readonly urlErrors = computed(() => this.validationResult().getErrors('url'));
  protected readonly actionUrlErrors = computed(() => this.validationResult().getErrors('actionUrl'));
  protected readonly altTextErrors = computed(() => this.validationResult().getErrors('altText'));
  protected readonly overlayErrors = computed(() => this.validationResult().getErrors('overlay'));
  protected readonly creditErrors = computed(() => this.validationResult().getErrors('credit'));
  protected readonly typeErrors = computed(() => this.validationResult().getErrors('type'));

  // i18n
  protected readonly labelI18n = computed(() => ({ name: 'imageLabel', label: this.i18n().image_edit_label_label(), placeholder: this.i18n().image_edit_label_placeholder(), helper: this.i18n().image_edit_label_helper() } as TextInputI18n));
  protected readonly urlI18n = computed(() => ({ name: 'imageUrl', label: this.i18n().image_edit_url_label(), placeholder: this.i18n().image_edit_url_placeholder(), helper: this.i18n().image_edit_url_helper() } as TextInputI18n));
  protected readonly actionUrlI18n = computed(() => ({ name: 'imageActionUrl', label: this.i18n().image_edit_action_label(), placeholder: this.i18n().image_edit_action_placeholder(), helper: this.i18n().image_edit_action_helper() } as TextInputI18n));
  protected readonly altTextI18n = computed(() => ({ name: 'imageAltText', label: this.i18n().altText_label(), placeholder: this.i18n().altText_placeholder(), helper: this.i18n().altText_helper() } as TextInputI18n));
  protected readonly overlayI18n = computed(() => ({ name: 'imageOverlay', label: this.i18n().image_edit_overlay_label(), placeholder: this.i18n().image_edit_overlay_placeholder(), helper: this.i18n().image_edit_overlay_helper() } as TextInputI18n));
  protected readonly creditI18n = computed(() => ({ name: 'imageCredit', label: this.i18n().image_edit_credit_label(), placeholder: this.i18n().image_edit_credit_placeholder(), helper: this.i18n().image_edit_credit_helper() } as TextInputI18n));
  protected readonly imageTypeI18n = computed(() => ({ name: 'imageType', label: this.i18n().image_edit_type_label() } as StringSelectI18n));

  protected onFieldChange(fieldName: keyof ImageConfig, fieldValue: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onTypeChange(name: string): void {
    const type = ImageType[name as keyof typeof ImageType];
    if (type === undefined) return;
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, type }));
  }

  /**
   * Reads the attribution embedded in the image file (IPTC/EXIF) into the credit field — the manual
   * counterpart to the read at upload time, for images added before that existed or whose metadata
   * imgix had not cached yet. It overwrites the field, because the user asked for it explicitly.
   */
  protected async readCreditFromFile(): Promise<void> {
    if (this.isReadOnly()) return;
    this.readingCredit.set(true);
    this.creditWasEmpty.set(false);
    try {
      const credit = await this.uploadService.readImageCredit(this.url());
      if (credit) this.onFieldChange('credit', credit);
      else this.creditWasEmpty.set(true);
    } finally {
      this.readingCredit.set(false);
    }
  }
}
