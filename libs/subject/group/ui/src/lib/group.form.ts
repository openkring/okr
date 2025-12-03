import { AsyncPipe } from '@angular/common';
import { Component, computed, input, model, output, signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { LowercaseWordMask } from '@bk2/shared-config';
import { WORD_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { RoleName, UserModel } from '@bk2/shared-models';
import { CheckboxComponent, ChipsComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, hasRole } from '@bk2/shared-util-core';

import { GROUP_FORM_SHAPE, GroupFormModel, groupFormValidations } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    TextInputComponent, ChipsComponent, NotesInputComponent, CheckboxComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle
  ],
   styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  <form scVestForm
    [formShape]="shape"
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (formValueChange)="onFormChange($event)">

    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@subject.group.field.attributes' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row> 
            <ion-col size="12" size-md="6">
              <bk-text-input name="name" [value]="name()" [maxLength]=50 [readOnly]="isReadOnly()" (changed)="onFieldChange('name', $event)" />
            </ion-col>
              <ion-col size="12" size-md="">
                <bk-text-input name="id" [value]="id()" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="isReadOnly()" (changed)="onFieldChange('id', $event)" />                                        
              </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ '@subject.group.field.display' | translate | async }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
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
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>

    <!-- tbd: group hierarchy: select an org or group, fill in parentKey, parentName, parentModelType -->

    <bk-chips chipName="tag" [storedChips]="tags()" [allChips]="allTags()" [readOnly]="isReadOnly()" (changed)="onFieldChange('tags', $event)" />

    @if(hasRole('admin')) { 
      <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" />
    }
  </form>
  `
})
export class GroupFormComponent {
  // inputs
  public formData = model.required<GroupFormModel>();
  public currentUser = input<UserModel | undefined>();
  public readonly allTags = input.required<string>();
  public readOnly = input(true);  
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = groupFormValidations;
  protected readonly shape = GROUP_FORM_SHAPE;
  private readonly validationResult = computed(() => groupFormValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

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

  // passing constants to template
  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  protected onFormChange(value: GroupFormModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormErrors('GroupForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    debugFormErrors('GroupForm.onFieldChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
