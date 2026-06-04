import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_NOTES, DEFAULT_TAGS, LONG_NAME_LENGTH } from '@bk2/shared-constants';
import { CategoryListModel, RoleName, TaskModel, UserModel } from '@bk2/shared-models';
import { CategorySelect, Chips, DateInput, DateInputI18n, ErrorNote, NotesInput, NotesInputI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { TaskI18n, taskValidations } from '@bk2/task-util';

@Component({
  selector: 'bk-task-form',
  standalone: true,
  imports: [
    vestForms,
    DateInput, CategorySelect, Chips, NotesInput,
    TextInput, ErrorNote,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonLabel, IonItem
],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @if(hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <bk-text-input [i18n]="bkeyI18n()" [value]="bkey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            <ion-row>
              <ion-col size="12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameLength" [autofocus]="true" [readOnly]="isReadOnly()" [copyable]="true" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="dueDateI18n()" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-date-input [i18n]="completionDateI18n()" [storeDate]="completionDate()" (storeDateChange)="onFieldChange('completionDate', $event)" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().state() }}:</ion-label>
                  <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-item>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().priority() }}:</ion-label>
                  <bk-cat-select [category]="priorities()!" [selectedItemName]="priority()" (selectedItemNameChange)="onFieldChange('priority', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-item>
              </ion-col>
              <ion-col size="12" size-md="6">
                <ion-item lines="none">
                  <ion-label>{{ i18n().importance() }}:</ion-label>
                  <bk-cat-select [category]="importances()!" [selectedItemName]="importance()" (selectedItemNameChange)="onFieldChange('importance', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                </ion-item>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(hasRole('privileged') || hasRole('eventAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class TaskForm {
  // inputs
  public readonly i18n = input.required<TaskI18n>();
  public readonly formData = model.required<TaskModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = taskValidations;
  private readonly validationResult = computed(() => taskValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = linkedSignal(() => this.formData().name);
  protected dueDate = linkedSignal(() => this.formData().dueDate);
  protected completionDate = linkedSignal(() => this.formData().completionDate);
  protected state = linkedSignal(() => this.formData().state);
  protected priority = linkedSignal(() => this.formData().priority);
  protected importance = linkedSignal(() => this.formData().importance);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected nameLength = LONG_NAME_LENGTH;

  // i18n
  protected bkeyI18n = computed(() => ({
    name: 'bkey',
    label: this.i18n().bkey_label(),
    placeholder: this.i18n().bkey_placeholder(),
    helper: this.i18n().bkey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes',
    label: this.i18n().notes_label(),
    placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));

  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.i18n().dueDate_label(), placeholder: this.i18n().dueDate_placeholder(), helper: this.i18n().dueDate_helper() } as DateInputI18n));
  protected completionDateI18n = computed(() => ({ name: 'completionDate', label: this.i18n().completionDate_label(), placeholder: this.i18n().completionDate_placeholder(), helper: this.i18n().completionDate_helper() } as DateInputI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: TaskModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('TaskForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('TaskForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
