import { AsyncPipe } from '@angular/common';
import { Component, computed, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { LowercaseWordMask } from '@bk2/shared-config';
import { WORD_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe } from '@bk2/shared-i18n';
import { GroupModel, RoleName, UserModel } from '@bk2/shared-models';
import { ButtonCopyComponent, CheckboxComponent, ChipsComponent, NotesInputComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { groupValidations } from '@bk2/subject-group-util';

@Component({
  selector: 'bk-group-form',
  standalone: true,
  imports: [
    vestForms,
    TranslatePipe, AsyncPipe,
    TextInputComponent, ChipsComponent, NotesInputComponent, CheckboxComponent, ButtonCopyComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonLabel, IonItem
  ],
   styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
  `],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite" 
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@subject.group.field.attributes' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row> 
              <ion-col size="12">
                @if(isNew()) {
                  <bk-text-input name="groupId" [value]="bkey()" (valueChange)="onFieldChange('bkey', $event)" [maxLength]="maxWordLength" [mask]="mask" [showHelper]=true [readOnly]="isReadOnly()" />
                } @else {
                  <ion-item lines="none">
                    <ion-label>{{ '@subject.group.field.groupId' | translate | async }}: {{ bkey() }}</ion-label>
                    <bk-button-copy [value]="bkey()" />
                  </ion-item>
                }                                     
              </ion-col>
              <ion-col size="12">
                <bk-text-input name="groupName" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]=50 [readOnly]="isReadOnly()" [showHelper]="true" />
              </ion-col>
                <ion-col size="12" size-md="">
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
                <bk-checkbox name="hasContent" [checked]="hasContent()" (checkedChange)="onFieldChange('hasContent', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasChat" [checked]="hasChat()" (checkedChange)="onFieldChange('hasChat', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasCalendar" [checked]="hasCalendar()" (checkedChange)="onFieldChange('hasCalendar', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasTasks" [checked]="hasTasks()" (checkedChange)="onFieldChange('hasTasks', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              <!--
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasFiles" [checked]="hasFiles()" (checkedChange)="onFieldChange('hasFiles', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasAlbum" [checked]="hasAlbum()" (checkedChange)="onFieldChange('hasAlbum', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
              -->
              <ion-col size="12" size-md="6">
                <bk-checkbox name="hasMembers" [checked]="hasMembers()" (checkedChange)="onFieldChange('hasMembers', $event)" [showHelper]="true" [readOnly]="isReadOnly()" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- tbd: group hierarchy: select an org or group, fill in parentKey, parentName, parentModelType -->

      @if(hasRole('privileged') || hasRole('memberAdmin')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }

      @if(hasRole('admin')) { 
        <bk-notes name="notes" [readOnly]="isReadOnly()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" />
      }
    </form>
  }
  `
})
export class GroupFormComponent {
  // inputs
  public formData = model.required<GroupModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly isNew = input(false);
  public readOnly = input(true);  
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  
  // validation and errors
  protected readonly suite = groupValidations;
  private readonly validationResult = computed(() => groupValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected bkeyErrors = computed(() => this.validationResult().getErrors('bkey'));

  // fields
  protected name = linkedSignal(() => this.formData().name ?? '');
  protected bkey = linkedSignal(() => this.formData().bkey ?? '');
  protected tags = linkedSignal(() => this.formData().tags ?? '');
  protected notes = linkedSignal(() => this.formData().notes ?? '');
  protected hasContent = linkedSignal(() => this.formData().hasContent ?? true);
  protected hasChat = linkedSignal(() => this.formData().hasChat ?? true);
  protected hasCalendar = linkedSignal(() => this.formData().hasCalendar ?? true);
  protected hasTasks = linkedSignal(() => this.formData().hasTasks ?? true);
  //protected hasFiles = linkedSignal(() => this.formData().hasFiles ?? true);
  //protected hasAlbum = linkedSignal(() => this.formData().hasAlbum ?? true);
  protected hasMembers = linkedSignal(() => this.formData().hasMembers ?? true);

  // passing constants to template
  protected mask = LowercaseWordMask;
  protected readonly maxWordLength = WORD_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | boolean): void {
    if (fieldName === 'bkey') {
      fieldValue = (fieldValue as string).toLowerCase();
    }
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: GroupModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('GroupForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('GroupForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
