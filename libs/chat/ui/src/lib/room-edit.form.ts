import { Component, computed, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { MatrixRoom, UserModel } from '@bk2/shared-models';
import { CheckboxComponent, ErrorNoteComponent, NotesInputComponent, NumberInputComponent, TextInputComponent, UrlInputComponent } from '@bk2/shared-ui';
import { DEFAULT_NAME, DEFAULT_URL } from '@bk2/shared-constants';
import { debugFormErrors, debugFormModel } from '@bk2/shared-util-core';

import { roomValidations } from '@bk2/chat-util';

@Component({
  selector: 'bk-room-edit-form',
  standalone: true,
  imports: [
    vestForms,
    TextInputComponent, ErrorNoteComponent, NotesInputComponent, CheckboxComponent,
    UrlInputComponent, NumberInputComponent,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  <form scVestForm
    [formValue]="formData()"
    [suite]="suite" 
    (dirtyChange)="dirty.emit($event)"
    (validChange)="valid.emit($event)"
    (formValueChange)="onFormChange($event)">
  
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12" size-md="6">
                <bk-text-input name="roomId" [value]="roomId()" (valueChange)="onFieldChange('roomId', $event)" [readOnly]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input name="name" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="false" [autofocus]="true" [maxLength]=30 />
                <bk-error-note [errors]="nameErrors()" />                                                                                                                                                            
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox name="isDirect" [checked]="isDirect()" (checkedChange)="onFieldChange('isDirect', $event)" [showHelper]="true" [readOnly]="false" />
              </ion-col>
<!--               <ion-col size="12">
                <bk-text-input name="invite" [value]="invite()" (valueChange)="onFieldChange('invite', $event)" [readOnly]="false" [maxLength]=500 />
              </ion-col> -->
              <ion-col size="12">
                <bk-url name="avatar" [value]="avatar()" (valueChange)="onFieldChange('avatar', $event)" [showHelper]=true [readOnly]="false" />
                <bk-error-note [errors]="urlErrors()" />                                        
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input name="unreadCount" [value]="unreadCount()" (valueChange)="onFieldChange('unreadCount', $event)" [readOnly]="true" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-notes name="topic" [value]="topic()" (valueChange)="onFieldChange('topic', $event)" [readOnly]="false" />
    </form>
  `
})
export class RoomEditForm {
  // inputs
  public formData = model.required<MatrixRoom>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = roomValidations;
  private readonly validationResult = computed(() => roomValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected urlErrors = computed(() => this.validationResult().getErrors('avatar'));

  // fields
  protected roomId = computed(() => this.formData().roomId ?? DEFAULT_NAME);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected avatar = computed(() => this.formData().avatar ?? DEFAULT_URL);
  protected topic = computed(() => this.formData().topic ?? DEFAULT_NAME);
  protected isDirect = computed(() => this.formData().isDirect ?? false);
  protected unreadCount = computed(() => this.formData().unreadCount ?? 0);

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: MatrixRoom): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('RoomEditForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('RoomEditForm.onFormChange: ', this.validationResult().getErrors(), this.currentUser());
  }
}
