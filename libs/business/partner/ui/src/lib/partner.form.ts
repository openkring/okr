import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { PartnerModel, RoleName, UserModel } from '@okr/shared-models';
import {
  CategorySelect, Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, TextInput,
  TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import { PartnerI18n, partnerStatusCategory, partnerValidations } from '@okr/business-partner-util';

/**
 * The partner record's editable half (C3 §5).
 *
 * `lastHeartbeatAt` and `reportedVersion` are shown by the list, never edited here: they are
 * written by the metering ingest with the Admin SDK, and a form that could set them would let an
 * operator fake the very heartbeat the contract's termination trigger reads.
 */
@Component({
  selector: 'okr-partner-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, DateInput, Chips, CategorySelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent,
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
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <!-- a select, not a text field: a typo'd status is a partner no code branches on -->
                  <okr-cat-select [category]="statusCategory()" [selectedItemName]="status()"
                    (selectedItemNameChange)="onFieldChange('status', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="orgKeyI18n()" [value]="orgKey()" (valueChange)="onFieldChange('orgKey', $event)"
                    [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="serviceUidI18n()" [value]="serviceUid()" (valueChange)="onFieldChange('serviceUid', $event)"
                    [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="contractStartI18n()" [storeDate]="contractStart()"
                    (storeDateChange)="onFieldChange('contractStart', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="contractEndI18n()" [storeDate]="contractEnd()"
                    (storeDateChange)="onFieldChange('contractEnd', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (hasRole('admin')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class PartnerForm {
  // inputs
  public readonly i18n = input.required<PartnerI18n>();
  public formData = model.required<PartnerModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  public readonly tenantId = input.required<string>();

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly partnerForm = form(this.formData, (path) =>
    validateVestTree(path, partnerValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.partnerForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly status = computed(() => this.formData()?.status ?? 'prospect');
  protected readonly orgKey = computed(() => this.formData()?.orgKey ?? '');
  protected readonly serviceUid = computed(() => this.formData()?.serviceUid ?? '');
  protected readonly contractStart = computed(() => this.formData()?.contractStart ?? '');
  protected readonly contractEnd = computed(() => this.formData()?.contractEnd ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper(),
  } as TextInputI18n));

  protected statusCategory = computed(() => partnerStatusCategory(this.tenantId()));

  protected orgKeyI18n = computed(() => ({
    name: 'orgKey',
    label: this.i18n().orgKey_label(),
    placeholder: this.i18n().orgKey_placeholder(),
    helper: this.i18n().orgKey_helper(),
  } as TextInputI18n));

  protected serviceUidI18n = computed(() => ({
    name: 'serviceUid',
    label: this.i18n().serviceUid_label(),
    placeholder: this.i18n().serviceUid_placeholder(),
    helper: this.i18n().serviceUid_helper(),
  } as TextInputI18n));

  protected contractStartI18n = computed(() => ({
    name: 'contractStart',
    label: this.i18n().contractStart_label(),
    placeholder: this.i18n().contractStart_placeholder(),
    helper: this.i18n().contractStart_helper(),
  } as DateInputI18n));

  protected contractEndI18n = computed(() => ({
    name: 'contractEnd',
    label: this.i18n().contractEnd_label(),
    placeholder: this.i18n().contractEnd_placeholder(),
    helper: this.i18n().contractEnd_helper(),
  } as DateInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder(),
  } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
