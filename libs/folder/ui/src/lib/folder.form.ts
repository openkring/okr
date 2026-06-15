import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { FolderModel, RoleName, UserModel } from '@bk2/shared-models';
import { Chips, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, hasRole } from '@bk2/shared-util-core';
import { validateVestTree } from '@bk2/shared-util-angular';
import { DEFAULT_NOTES, DEFAULT_TAGS } from '@bk2/shared-constants';

import { FolderI18n, folderValidations } from '@bk2/folder-util';

@Component({
  selector: 'bk-folder-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, Chips,
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
                  <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [maxLength]="50" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last -->
        @if (hasRole('contentAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('contentAdmin')) {
          <bk-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)" [readOnly]="isReadOnly()" />
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

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
