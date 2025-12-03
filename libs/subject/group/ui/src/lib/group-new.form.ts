import { Component, computed, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { RoleName, SwissCity, UserModel } from '@bk2/shared-models';
import { CheckboxComponent, ChipsComponent, ErrorNoteComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { GROUP_NEW_FORM_SHAPE, GroupFormModel, GroupNewFormModel, groupNewFormValidations } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-new-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, ChipsComponent, NotesInputComponent, ErrorNoteComponent, CheckboxComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-content>
        <ion-grid>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
              <bk-error-note [errors]="nameErrors()" />                                                                                                                     
            </ion-col>
            <ion-col size="12" size-md="6">
              <!-- tbd: add word mask and check uniqueness -->
              <bk-text-input name="id" [value]="id()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('id', $event)" />
              <bk-error-note [errors]="idErrors()" />                                                                                                                     
            </ion-col>
          </ion-row>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasContent" [isChecked]="hasContent()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasContent', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasChat" [isChecked]="hasChat()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasChat', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasCalendar" [isChecked]="hasCalendar()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasCalendar', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasTasks" [isChecked]="hasTasks()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasTasks', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasFiles" [isChecked]="hasFiles()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasFiles', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasAlbum" [isChecked]="hasAlbum()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasAlbum', $event)"/>
            </ion-col>
            <ion-col size="12" size-md="6">
              <bk-checkbox name="hasMembers" [isChecked]="hasMembers()" [showHelper]="true" [readOnly]="isReadOnly()" (changed)="onFieldChange('hasMembers', $event)"/>
            </ion-col>
            <!-- tbd: group hierarchy:  select an org or group, fill in parentKey, parentName, parentModelType -->
          </ion-row>

        </ion-grid>
      </ion-card-content>
    </ion-card>
    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [value]="notes()" [readOnly]="isReadOnly()" />
    }
  </form>
  `
})
export class GroupNewFormComponent {
  // inputs
  public formData = model.required<GroupNewFormModel>();
  public currentUser = input<UserModel | undefined>();
  public allTags = input.required<string>();
  public readOnly = input(true); 
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = groupNewFormValidations;
  protected readonly shape = GROUP_NEW_FORM_SHAPE;
  private readonly validationResult = computed(() => groupNewFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected idErrors = computed(() => this.validationResult().getErrors('id'));

  // fields
  protected name = computed(() => this.formData().name ?? '');
  protected id = computed(() => this.formData().id ?? '');
  protected tags = computed(() => this.formData().tags ?? '');
  protected notes = computed(() => this.formData().notes ?? '');
  protected hasContent = computed(() => this.formData().hasContent ?? true);
  protected hasChat = computed(() => this.formData().hasChat ?? true);
  protected hasCalendar = computed(() => this.formData().hasCalendar ?? true);
  protected hasTasks = computed(() => this.formData().hasTasks ?? true);
  protected hasFiles = computed(() => this.formData().hasFiles ?? true);
  protected hasAlbum = computed(() => this.formData().hasAlbum ?? true);
  protected hasMembers = computed(() => this.formData().hasMembers ?? true);

  protected onFormChange(value: GroupNewFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('GroupNewForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, $event: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: $event }));
    debugFormErrors('GroupNewForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected onCitySelected(city: SwissCity): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, city: city.name, countryCode: city.countryCode, zipCode: String(city.zipCode) }));
    debugFormErrors('GroupNewForm.onCitySelected', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
