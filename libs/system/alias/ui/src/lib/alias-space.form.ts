import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';
import { AliasSpaceModel, RoleName, UserModel } from '@okr/shared-models';
import {
  CategorySelect, Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n,
  NumberInput, NumberInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { validateVestTree } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import {
  AliasI18n, aliasCharsetCategory, aliasSpaceKindCategory, aliasSpaceValidations,
  aliasTrackingLevelCategory,
} from '@okr/system-alias-util';

/**
 * Das Space-Formular.
 *
 * `name` sperrt sich, sobald der Space Aliase hat (`hasAliases`) — er steht im Pfad
 * (`/s/<name>/<code>`) und im Document-ID-Präfix jedes Alias darin. Ein Rename würde nicht
 * umbenennen, sondern jeden gedruckten Code verwaisen lassen. `label` bleibt frei änderbar,
 * die Anzeige darf also mitwachsen.
 *
 * `caseSensitive` und `charset` sind aus demselben Grund gesperrt: sie gehen in die Bildung der
 * Document-ID bzw. in bereits vergebene Codes ein.
 */
@Component({
  selector: 'okr-alias-space-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, NumberInput, Checkbox, CategorySelect, ErrorNote,
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
                  <okr-text-input [i18n]="nameI18n()" [value]="name()"
                    (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="!hasAliases()" [maxLength]="20" [readOnly]="isNameLocked()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="labelI18n()" [value]="label()"
                    (valueChange)="onFieldChange('label', $event)"
                    [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="kindCategory()" [selectedItemName]="kind()"
                    (selectedItemNameChange)="onFieldChange('kind', $event)"
                    [showHelper]="true" [readOnly]="isNameLocked()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="charsetCategory()" [selectedItemName]="charset()"
                    (selectedItemNameChange)="onFieldChange('charset', $event)"
                    [showHelper]="true" [readOnly]="isNameLocked()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="lengthI18n()" [value]="length()"
                    (valueChange)="onFieldChange('length', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="lengthErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="roleNeededI18n()" [value]="roleNeeded()"
                    (valueChange)="onFieldChange('roleNeeded', $event)"
                    [maxLength]="20" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="allowCustomI18n()" [checked]="allowCustom()"
                    (checkedChange)="onFieldChange('allowCustom', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-checkbox [i18n]="caseSensitiveI18n()" [checked]="caseSensitive()"
                    (checkedChange)="onFieldChange('caseSensitive', $event)"
                    [showHelper]="true" [readOnly]="isNameLocked()" />
                </ion-col>
              </ion-row>

              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="trackingCategory()" [selectedItemName]="trackingLevel()"
                    (selectedItemNameChange)="onFieldChange('trackingLevel', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-number-input [i18n]="retentionI18n()" [value]="retentionDays()"
                    (valueChange)="onFieldChange('retentionDays', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="retentionErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- Kein okr-chips: AliasSpaceModel ist bewusst KEIN TaggedModel. Ein Space ist
             Konfiguration, keine Kampagne - Kampagnen werden ueber die Notiz eines Alias
             unterschieden, nicht ueber einen eigenen Space und nicht ueber Tags. -->
        @if (hasRole('admin')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()"
            (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class AliasSpaceForm {
  public readonly i18n = input.required<AliasI18n>();
  public formData = model.required<AliasSpaceModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  /** Sobald der Space Aliase hat, sind Name, Art, Charset und Case unveränderlich. */
  public readonly hasAliases = input(false);

  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly spaceForm = form(this.formData, (path) =>
    validateVestTree(path, aliasSpaceValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.spaceForm().valid()));
  }

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isNameLocked = computed(() =>
    this.isReadOnly() || coerceBoolean(this.hasAliases()),
  );

  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly label = computed(() => this.formData()?.label ?? '');
  protected readonly kind = computed(() => this.formData()?.kind ?? 'redirect');
  protected readonly charset = computed(() => this.formData()?.charset ?? 'base32-safe');
  protected readonly length = computed(() => this.formData()?.length ?? 6);
  protected readonly roleNeeded = computed(() => this.formData()?.roleNeeded ?? 'privileged');
  protected readonly allowCustom = computed(() => this.formData()?.allowCustom ?? false);
  protected readonly caseSensitive = computed(() => this.formData()?.caseSensitive ?? false);
  protected readonly trackingLevel = computed(() => this.formData()?.trackingLevel ?? 'counter');
  protected readonly retentionDays = computed(() => this.formData()?.retentionDays ?? 365);
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);

  protected readonly kindCategory = computed(() => aliasSpaceKindCategory(this.tenantId()));
  protected readonly charsetCategory = computed(() => aliasCharsetCategory(this.tenantId()));
  protected readonly trackingCategory = computed(() => aliasTrackingLevelCategory(this.tenantId()));

  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().space_field_name_label(),
    placeholder: '',
    helper: this.hasAliases()
      ? this.i18n().space_field_name_locked()
      : this.i18n().space_field_name_helper(),
  } as TextInputI18n));

  protected readonly labelI18n = computed(() => ({
    name: 'label',
    label: this.i18n().space_field_label_label(),
    placeholder: '',
    helper: '',
  } as TextInputI18n));

  protected readonly lengthI18n = computed(() => ({
    name: 'length',
    label: this.i18n().space_field_length_label(),
    placeholder: '6',
    helper: '',
  } as NumberInputI18n));

  protected readonly roleNeededI18n = computed(() => ({
    name: 'roleNeeded',
    label: this.i18n().space_field_roleneeded_label(),
    placeholder: 'privileged',
    helper: '',
  } as TextInputI18n));

  protected readonly allowCustomI18n = computed(() => ({
    name: 'allowCustom',
    label: this.i18n().space_field_allowcustom_label(),
    helper: '',
  } as CheckboxI18n));

  protected readonly caseSensitiveI18n = computed(() => ({
    name: 'caseSensitive',
    label: this.i18n().space_field_casesensitive_label(),
    helper: '',
  } as CheckboxI18n));

  protected readonly retentionI18n = computed(() => ({
    name: 'retentionDays',
    label: this.i18n().space_field_retention_label(),
    placeholder: '365',
    helper: this.i18n().space_field_retention_helper(),
  } as NumberInputI18n));

  protected readonly notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().field_notes_label(),
    placeholder: '',
    helper: '',
  } as NotesInputI18n));

  private readonly validationResult = computed(() =>
    aliasSpaceValidations(this.formData(), this.tenantId(), (this.allTags() ?? '') as string),
  );
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly lengthErrors = computed(() => this.validationResult().getErrors('length'));
  protected readonly retentionErrors = computed(() => this.validationResult().getErrors('retentionDays'));

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
