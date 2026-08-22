import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { AliasModel, RoleName, UserModel } from '@okr/shared-models';
import {
  CategorySelect, Checkbox, CheckboxI18n, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput,
  NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import {
  AliasI18n, aliasTargetTypeCategory, aliasTrackingSettingCategory, aliasValidations,
} from '@okr/system-alias-util';

/**
 * Das Alias-Formular.
 *
 * `alias` und `space` sind nach dem Anlegen READ-ONLY, und das ist die zentrale Eigenschaft
 * dieses Formulars: beide stehen in der Document-ID (`<tenant>__<space>__<alias>`) und damit in
 * jeder bereits ausgedruckten Adresse. Sie zu ändern hiesse, ein neues Dokument anzulegen und
 * das gedruckte ins Leere laufen zu lassen — deshalb ist Umleiten (targetUrl) erlaubt,
 * Umbenennen nicht.
 *
 * Ebenso ist `targetType` nach dem Anlegen gesperrt: ein Wechsel von `url` auf `model` würde die
 * Bedeutung des Codes ändern, nicht nur sein Ziel.
 */
@Component({
  selector: 'okr-alias-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, NumberInput, DateInput, Checkbox, Chips, CategorySelect, ErrorNote,
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
                  <okr-text-input [i18n]="spaceI18n()" [value]="space()"
                    (valueChange)="onFieldChange('space', $event)"
                    [autofocus]="isNew()" [maxLength]="20" [readOnly]="isLocked()" />
                  <okr-error-note [errors]="spaceErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="aliasI18n()" [value]="alias()"
                    (valueChange)="onFieldChange('alias', $event)"
                    [maxLength]="20" [readOnly]="isLocked()" [copyable]="!isNew()" />
                  <okr-error-note [errors]="aliasErrors()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="targetTypeCategory()" [selectedItemName]="targetType()"
                    (selectedItemNameChange)="onFieldChange('targetType', $event)"
                    [showHelper]="true" [readOnly]="isLocked()" />
                </ion-col>
                @if (targetType() === 'url') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="targetUrlI18n()" [value]="targetUrl()"
                      (valueChange)="onFieldChange('targetUrl', $event)"
                      [maxLength]="500" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="targetUrlErrors()" />
                  </ion-col>
                }
                @if (targetType() === 'model') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="targetKeyI18n()" [value]="targetKey()"
                      (valueChange)="onFieldChange('targetKey', $event)"
                      [maxLength]="60" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="targetKeyErrors()" />
                  </ion-col>
                }
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="isEnabledI18n()" [checked]="isEnabled()"
                    (checkedChange)="onFieldChange('isEnabled', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="validUntilI18n()" [storeDate]="validUntil()"
                    (storeDateChange)="onFieldChange('validUntil', $event)"
                    [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="maxUsesI18n()" [value]="maxUses()"
                    (valueChange)="onFieldChange('maxUses', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="maxUsesErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="trackingCategory()" [selectedItemName]="trackingLevel()"
                    (selectedItemNameChange)="onFieldChange('trackingLevel', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        @if (hasRole('privileged')) {
          <okr-chips chipName="tag" [storedChips]="tags()"
            (storedChipsChange)="onFieldChange('tags', $event)"
            [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('privileged')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()"
            (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class AliasForm {
  // inputs
  public readonly i18n = input.required<AliasI18n>();
  public formData = model.required<AliasModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly aliasForm = form(this.formData, (path) =>
    validateVestTree(path, aliasValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.aliasForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  /** Ein noch nicht geprägter Alias hat keinen okey — dann sind space/alias/targetType offen. */
  protected readonly isNew = computed(() => (this.formData()?.okey ?? '') === '');
  /** Nach dem Prägen unveränderlich: sie stehen in der Document-ID und in gedruckten Adressen. */
  protected readonly isLocked = computed(() => this.isReadOnly() || !this.isNew());

  protected readonly space = computed(() => this.formData()?.space ?? '');
  protected readonly alias = computed(() => this.formData()?.alias ?? '');
  protected readonly targetType = computed(() => this.formData()?.targetType ?? 'url');
  protected readonly targetUrl = computed(() => this.formData()?.targetUrl ?? '');
  protected readonly targetKey = computed(() => this.formData()?.targetKey ?? '');
  protected readonly isEnabled = computed(() => this.formData()?.isEnabled ?? true);
  protected readonly validUntil = computed(() => this.formData()?.validUntil ?? '');
  protected readonly maxUses = computed(() => this.formData()?.maxUses ?? 0);
  protected readonly trackingLevel = computed(() => this.formData()?.trackingLevel ?? 'inherit');
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);

  protected readonly targetTypeCategory = computed(() => aliasTargetTypeCategory(this.tenantId()));
  protected readonly trackingCategory = computed(() => aliasTrackingSettingCategory(this.tenantId()));

  protected readonly spaceI18n = computed(() => ({
    name: 'space',
    label: this.i18n().field_space_label(),
    placeholder: '',
    helper: this.i18n().field_space_helper(),
  } as TextInputI18n));

  protected readonly aliasI18n = computed(() => ({
    name: 'alias',
    label: this.i18n().field_alias_label(),
    placeholder: this.i18n().field_alias_placeholder(),
    helper: this.i18n().field_alias_helper(),
  } as TextInputI18n));

  protected readonly targetUrlI18n = computed(() => ({
    name: 'targetUrl',
    label: this.i18n().field_targeturl_label(),
    placeholder: this.i18n().field_targeturl_placeholder(),
    helper: this.i18n().field_targeturl_helper(),
  } as TextInputI18n));

  protected readonly targetKeyI18n = computed(() => ({
    name: 'targetKey',
    label: this.i18n().field_targetkey_label(),
    placeholder: 'person.<okey>',
    helper: this.i18n().field_targetkey_helper(),
  } as TextInputI18n));

  protected readonly isEnabledI18n = computed(() => ({
    name: 'isEnabled',
    label: this.i18n().field_isenabled_label(),
    helper: this.i18n().field_isenabled_helper(),
  } as CheckboxI18n));

  protected readonly validUntilI18n = computed(() => ({
    name: 'validUntil',
    label: this.i18n().field_validuntil_label(),
    placeholder: '',
    helper: this.i18n().field_validuntil_helper(),
  } as DateInputI18n));

  protected readonly maxUsesI18n = computed(() => ({
    name: 'maxUses',
    label: this.i18n().field_maxuses_label(),
    placeholder: '0',
    helper: this.i18n().field_maxuses_helper(),
  } as NumberInputI18n));

  protected readonly notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().field_notes_label(),
    placeholder: '',
    helper: this.i18n().field_notes_helper(),
  } as NotesInputI18n));

  private readonly validationResult = computed(() =>
    aliasValidations(this.formData(), this.tenantId(), (this.allTags() ?? '') as string),
  );
  protected readonly spaceErrors = computed(() => this.validationResult().getErrors('space'));
  protected readonly aliasErrors = computed(() => this.validationResult().getErrors('alias'));
  protected readonly targetUrlErrors = computed(() => this.validationResult().getErrors('targetUrl'));
  protected readonly targetKeyErrors = computed(() => this.validationResult().getErrors('targetKey'));
  protected readonly maxUsesErrors = computed(() => this.validationResult().getErrors('maxUses'));

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
