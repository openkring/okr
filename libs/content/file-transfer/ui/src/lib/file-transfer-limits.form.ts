import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonAvatar, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { ErrorNote, ImgDirective, NumberInput, NumberInputI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, getFullName } from '@okr/shared-util-core';
import { AvatarPipe } from '@okr/avatar-ui';
import { getDefaultIcon } from '@okr/avatar-util';
import {
  FileTransferI18n, FileTransferLimitOverrideFormData, FileTransferLimitsFormData, fileTransferLimitsValidations,
} from '@okr/content-file-transfer-util';

type LimitsField = Exclude<keyof FileTransferLimitsFormData, 'overrides'>;
type OverrideField = 'maxFileTransferGb' | 'maxOpenGb';

/**
 * Transfer limits of the tenant (spec 1.115 §4.4/§6), every size in GB. The parent converts with
 * toFileTransferLimitsFormData / fromFileTransferLimitsFormData and saves through the banner.
 * Per-person exceptions are added with the person picker; one above the ceiling is invalid.
 */
@Component({
  selector: 'okr-file-transfer-limits-form',
  standalone: true,
  imports: [
    ImgDirective, AvatarPipe, SvgIconPipe, NumberInput, ErrorNote,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonAvatar,
    IonButton, IonIcon, IonNote,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    ion-avatar { width: 30px; height: 30px; }
    .remove { cursor: pointer; }
    .select { padding: 8px 16px; }
  `],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="transferI18n()" [value]="maxFileTransferGb()" (valueChange)="onFieldChange('maxFileTransferGb', $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="maxFileTransferGbErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="openI18n()" [value]="maxOpenGb()" (valueChange)="onFieldChange('maxOpenGb', $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="maxOpenGbErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="ceilingI18n()" [value]="overrideCeilingGb()" (valueChange)="onFieldChange('overrideCeilingGb', $event)"
                    [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="overrideCeilingGbErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="externalsI18n()" [value]="maxExternalRecipients()" (valueChange)="onFieldChange('maxExternalRecipients', $event)"
                    [integer]="true" [min]="0" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="maxExternalRecipientsErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="defaultLifetimeI18n()" [value]="defaultLifetimeDays()" (valueChange)="onFieldChange('defaultLifetimeDays', $event)"
                    [integer]="true" [min]="1" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="defaultLifetimeDaysErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="maxLifetimeI18n()" [value]="maxLifetimeDays()" (valueChange)="onFieldChange('maxLifetimeDays', $event)"
                    [integer]="true" [min]="1" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="maxLifetimeDaysErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- per-person exceptions -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().limits_overrides_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-note>{{ i18n().limits_overrides_helper() }}</ion-note>
            </ion-item>
            @if (!isReadOnly()) {
              <div class="select">
                <ion-button expand="block" fill="outline" (click)="addOverride()">
                  <ion-icon slot="start" src="{{ 'person-add' | svgIcon }}" />
                  {{ i18n().limits_overrides_add() }}
                </ion-button>
              </div>
            }
            @if (overrides().length === 0) {
              <ion-item lines="none">
                <ion-note>{{ i18n().limits_overrides_empty() }}</ion-note>
              </ion-item>
            }
            <ion-grid>
              @for (o of overrides(); track o.personKey + $index) {
                <ion-row>
                  <ion-col size="12">
                    <ion-item lines="none">
                      <ion-avatar slot="start">
                        <img okrImg src="{{ 'person.' + o.personKey | avatar:personIcon }}" alt="Avatar" />
                      </ion-avatar>
                      <ion-label>{{ o.name }}</ion-label>
                      @if (!isReadOnly()) {
                        <ion-icon class="remove" slot="end" src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="i18n().remove()"
                          (click)="removeOverride($index)" />
                      }
                    </ion-item>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="overrideTransferI18n()" [value]="o.maxFileTransferGb"
                      (valueChange)="onOverrideChange($index, 'maxFileTransferGb', $event)" [min]="0" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <okr-number-input [i18n]="overrideOpenI18n()" [value]="o.maxOpenGb"
                      (valueChange)="onOverrideChange($index, 'maxOpenGb', $event)" [min]="0" [readOnly]="isReadOnly()" />
                  </ion-col>
                  <ion-col size="12">
                    <okr-error-note [errors]="overrideErrors($index)" />
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
export class FileTransferLimitsForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  // inputs
  public readonly i18n = input.required<FileTransferI18n>();
  public formData = model.required<FileTransferLimitsFormData>();
  /** The tenant whose accounts the person picker offers first. */
  public readonly tenantId = input('');
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly limitsForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, fileTransferLimitsValidations as any));
  private readonly validationResult = vestErrors(this.limitsForm);
  protected readonly maxFileTransferGbErrors = computed(() => this.validationResult().getErrors('maxFileTransferGb'));
  protected readonly maxOpenGbErrors = computed(() => this.validationResult().getErrors('maxOpenGb'));
  protected readonly overrideCeilingGbErrors = computed(() => this.validationResult().getErrors('overrideCeilingGb'));
  protected readonly maxExternalRecipientsErrors = computed(() => this.validationResult().getErrors('maxExternalRecipients'));
  protected readonly defaultLifetimeDaysErrors = computed(() => this.validationResult().getErrors('defaultLifetimeDays'));
  protected readonly maxLifetimeDaysErrors = computed(() => this.validationResult().getErrors('maxLifetimeDays'));
  protected overrideErrors(index: number): string[] {
    return this.validationResult().getErrors(`overrides[${index}]`);
  }

  constructor() {
    effect(() => this.valid.emit(this.limitsForm().valid()));
  }

  protected readonly personIcon = getDefaultIcon('person');
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly maxFileTransferGb = computed(() => this.formData()?.maxFileTransferGb ?? 0);
  protected readonly maxOpenGb = computed(() => this.formData()?.maxOpenGb ?? 0);
  protected readonly overrideCeilingGb = computed(() => this.formData()?.overrideCeilingGb ?? 0);
  protected readonly maxExternalRecipients = computed(() => this.formData()?.maxExternalRecipients ?? 0);
  protected readonly defaultLifetimeDays = computed(() => this.formData()?.defaultLifetimeDays ?? 1);
  protected readonly maxLifetimeDays = computed(() => this.formData()?.maxLifetimeDays ?? 1);
  protected readonly overrides = computed(() => this.formData()?.overrides ?? []);

  private numberI18n(name: string, label: string, helper = ''): NumberInputI18n {
    return { name, label, helper, placeholder: this.i18n().limits_placeholder() };
  }
  protected readonly transferI18n = computed(() =>
    this.numberI18n('maxFileTransferGb', this.i18n().limits_transfer_label(), this.i18n().limits_transfer_helper()));
  protected readonly openI18n = computed(() =>
    this.numberI18n('maxOpenGb', this.i18n().limits_open_label(), this.i18n().limits_open_helper()));
  protected readonly ceilingI18n = computed(() =>
    this.numberI18n('overrideCeilingGb', this.i18n().limits_ceiling_label(), this.i18n().limits_ceiling_helper()));
  protected readonly externalsI18n = computed(() =>
    this.numberI18n('maxExternalRecipients', this.i18n().limits_externals_label(), this.i18n().limits_externals_helper()));
  protected readonly defaultLifetimeI18n = computed(() =>
    this.numberI18n('defaultLifetimeDays', this.i18n().limits_default_lifetime_label(), this.i18n().limits_default_lifetime_helper()));
  protected readonly maxLifetimeI18n = computed(() =>
    this.numberI18n('maxLifetimeDays', this.i18n().limits_max_lifetime_label(), this.i18n().limits_max_lifetime_helper()));
  protected readonly overrideTransferI18n = computed(() =>
    this.numberI18n('overrideMaxFileTransferGb', this.i18n().limits_override_transfer_label()));
  protected readonly overrideOpenI18n = computed(() =>
    this.numberI18n('overrideMaxOpenGb', this.i18n().limits_override_open_label()));

  /** Adds an exception for one person, seeded with the general limits. */
  public async addOverride(): Promise<void> {
    const avatar = await this.modelSelector.selectPersonAvatar('', '', false, false, {
      accountsFirst: this.tenantId() || undefined,
      excludeKeys: this.overrides().map(o => o.personKey),
    });
    if (!avatar) return;
    const override: FileTransferLimitOverrideFormData = {
      personKey: avatar.key,
      name: getFullName(avatar.name1, avatar.name2),
      maxFileTransferGb: this.maxFileTransferGb(),
      maxOpenGb: this.maxOpenGb(),
    };
    this.setOverrides([...this.overrides(), override]);
  }

  protected removeOverride(index: number): void {
    this.setOverrides(this.overrides().filter((_, i) => i !== index));
  }

  protected onOverrideChange(index: number, field: OverrideField, value: number): void {
    this.setOverrides(this.overrides().map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  private setOverrides(overrides: FileTransferLimitOverrideFormData[]): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, overrides }));
  }

  protected onFieldChange(fieldName: LimitsField, fieldValue: number): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }
}
