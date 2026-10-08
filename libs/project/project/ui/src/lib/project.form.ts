import { Component, computed, effect, inject, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AvatarSelect } from '@okr/avatar-ui';
import { DEFAULT_NOTES, DEFAULT_TAGS, DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, CategoryListModel, ProjectModel, RoleName, UserModel } from '@okr/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { MODEL_SELECTOR, validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole, newAvatarInfo } from '@okr/shared-util-core';
import { PROJECT_NAME_LENGTH, ProjectI18n, projectValidations } from '@okr/project-project-util';

@Component({
  selector: 'okr-project-form',
  standalone: true,
  imports: [
    ErrorNote, TextInput, NotesInput, DateInput, CategorySelect, Chips, AvatarSelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonItem, IonLabel
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"
                    [autofocus]="true" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="nameErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" (valueChange)="onFieldChange('description', $event)"
                    [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="descriptionErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="startDateI18n()" [storeDate]="startDate()" (storeDateChange)="onFieldChange('startDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="startDateErrors()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="endDateI18n()" [storeDate]="endDate()" (storeDateChange)="onFieldChange('endDate', $event)" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="endDateErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().state() }}:</ion-label>
                    <okr-cat-select [category]="states()" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)"
                      [readOnly]="isReadOnly()" [withAll]="false" />
                  </ion-item>
                  <okr-error-note [errors]="stateErrors()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <okr-avatar-select name="projectManager" [avatar]="projectManager()"
          [title]="i18n().projectManager()" [note]="i18n().projectManager_note()" [selectLabel]="i18n().projectManager_select()"
          [clearable]="!isReadOnly()" [readOnly]="isReadOnly()"
          (selectClicked)="selectProjectManager()" (clearClicked)="onProjectManagerChange(undefined)" />

        <!-- guarded, always last -->
        @if (hasRole('privileged')) {
          <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        }
        @if (hasRole('privileged')) {
          <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)"
            [maxLength]="descriptionLength" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `
})
export class ProjectForm {
  private readonly modelSelector = inject(MODEL_SELECTOR);

  /** kept in step with the caps the Vest suite enforces on these fields */
  protected readonly nameLength = PROJECT_NAME_LENGTH;
  protected readonly descriptionLength = DESCRIPTION_LENGTH;

  // inputs
  public readonly i18n = input.required<ProjectI18n>();
  public readonly formData = model.required<ProjectModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly allTags = input(DEFAULT_TAGS);
  public readonly states = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);   // toggled by the parent to reset the Vest state on cancel

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  // signal form — wraps formData with Vest validation
  protected readonly projectForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, projectValidations as any));

  // per-field Vest errors for the notes under each field, read off the signal form (one Vest run per change)
  private readonly validationResult = vestErrors(this.projectForm);
  protected readonly nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected readonly descriptionErrors = computed(() => this.validationResult().getErrors('description'));
  protected readonly startDateErrors = computed(() => this.validationResult().getErrors('startDate'));
  protected readonly endDateErrors = computed(() => this.validationResult().getErrors('endDate'));
  protected readonly stateErrors = computed(() => this.validationResult().getErrors('state'));

  constructor() {
    effect(() => this.valid.emit(this.projectForm().valid()));
  }

  // computed field accessors (legacy docs may lack fields — coalesce)
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly name = computed(() => this.formData()?.name ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? DEFAULT_NOTES);
  protected readonly startDate = computed(() => this.formData()?.startDate ?? '');
  protected readonly endDate = computed(() => this.formData()?.endDate ?? '');
  protected readonly state = computed(() => this.formData()?.state ?? '');
  protected readonly projectManager = computed(() => this.formData()?.projectManager);
  protected readonly tags = computed(() => this.formData()?.tags ?? DEFAULT_TAGS);
  protected readonly notes = computed(() => this.formData()?.notes ?? DEFAULT_NOTES);

  // per-field i18n
  protected readonly nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected readonly descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description(),
    placeholder: this.i18n().description_placeholder()
  } as NotesInputI18n));

  protected readonly startDateI18n = computed(() => ({
    name: 'startDate',
    label: this.i18n().startDate(),
    placeholder: this.i18n().startDate_placeholder()
  } as DateInputI18n));

  protected readonly endDateI18n = computed(() => ({
    name: 'endDate',
    label: this.i18n().endDate(),
    placeholder: this.i18n().endDate_placeholder()
  } as DateInputI18n));

  protected readonly notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected onFieldChange(fieldName: string, fieldValue: string | string[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onProjectManagerChange(avatar: AvatarInfo | undefined): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, projectManager: avatar }));
  }

  /** Opens the person picker (the picker is a feature-layer modal behind the MODEL_SELECTOR token). */
  protected async selectProjectManager(): Promise<void> {
    if (this.isReadOnly()) return;
    const person = await this.modelSelector.selectPerson();
    if (!person) return;
    this.onProjectManagerChange(newAvatarInfo(person.okey, person.firstName, person.lastName, 'person', person.gender, '', ''));
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
