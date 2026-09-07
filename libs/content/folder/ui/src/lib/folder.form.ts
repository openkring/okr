import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { FolderModel, RoleName, UserModel } from '@okr/shared-models';
import { Checkbox, CheckboxI18n, Chips, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@okr/shared-constants';

import { FolderI18n, folderValidations, hasPublicFolderTag, isPublicFolderKey, setFolderPublicTag } from '@okr/content-folder-util';

@Component({
  selector: 'okr-folder-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, Chips, Checkbox,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
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
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-checkbox [i18n]="membersMayUploadI18n()" [checked]="membersMayUpload()"
                    (checkedChange)="onBooleanChange('membersMayUpload', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <!-- Publication is decided at CREATION: it needs the '-public' key suffix, and keys
                   are immutable. On an existing folder the box therefore only stays operable when
                   the key already qualifies (untagging is how a gallery is withdrawn) — otherwise
                   it is read-only, and the helper says why. -->
              @if (hasRole('contentAdmin')) {
                <ion-row>
                  <ion-col size="12">
                    <okr-checkbox [i18n]="isPublicI18n()" [checked]="isPublic()"
                      (checkedChange)="onPublicChange($event)"
                      [showHelper]="true" [readOnly]="isReadOnly() || !canChangePublic()" />
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (hasRole('contentAdmin')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('contentAdmin')) {
          <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class FolderForm {
  // inputs
  public readonly i18n = input.required<FolderI18n>();
  public formData = model.required<FolderModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly readOnly = input(true);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly folderForm = form(this.formData, (path) =>
    validateVestTree(path, folderValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.folderForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? DEFAULT_NOTES);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  // legacy folders have no membersMayUpload field — coalesce to false
  protected readonly membersMayUpload = computed(() => this.formData()?.membersMayUpload === true);

  /* ---- publication ----
   * There is no `isPublic` FIELD on FolderModel and there deliberately is not one: publication is
   * the pair (key suffix, `public` tag), and the Cloud Function reads exactly that pair. A third
   * representation would be a fourth thing to keep in sync and the one the gate does not read.
   */
  protected readonly isPublic = computed(() => hasPublicFolderTag(this.formData()?.tags ?? ''));
  /** A folder still being created has no key yet — the store derives a qualifying one on save. */
  protected readonly canChangePublic = computed(() => {
    const okey = this.formData()?.okey ?? '';
    return okey.length === 0 || isPublicFolderKey(okey);
  });

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().title_label(),
    placeholder: this.i18n().title_placeholder(),
    helper: this.i18n().title_helper()
  } as TextInputI18n));

  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description_label(),
    placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected membersMayUploadI18n = computed(() => ({
    name: 'membersMayUpload',
    label: this.i18n().membersMayUpload_label(),
    helper: this.i18n().membersMayUpload_helper()
  } as CheckboxI18n));

  protected isPublicI18n = computed(() => ({
    name: 'isPublic',
    label: this.i18n().isPublic_label(),
    helper: this.i18n().isPublic_helper()
  } as CheckboxI18n));

  /** Writes through to `tags`, which is where publication actually lives. */
  protected onPublicChange(isPublic: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, tags: setFolderPublicTag(vm.tags ?? '', isPublic) }));
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onBooleanChange(fieldName: string, fieldValue: boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
