import { Component, computed, input, model, output, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { MatrixRoom, UserModel } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n, UrlInput, UrlInputI18n } from '@bk2/shared-ui';
import { DEFAULT_NAME, DEFAULT_URL } from '@bk2/shared-constants';
import { debugFormErrors, debugFormModel } from '@bk2/shared-util-core';

import { roomValidations } from '@bk2/chat-util';

export interface RoomEditFormI18n {
  roomId_label: Signal<string>;
  roomId_placeholder: Signal<string>;
  roomId_helper: Signal<string>;
  name_label: Signal<string>;
  name_placeholder: Signal<string>;
  name_helper: Signal<string>;
  invite_label: Signal<string>;
  invite_placeholder: Signal<string>;
  invite_helper: Signal<string>;
  unreadCount_label: Signal<string>;
  unreadCount_placeholder: Signal<string>;
  unreadCount_helper: Signal<string>;
  topic_label: Signal<string>;
  topic_placeholder: Signal<string>;
  avatar_label: Signal<string>;
  avatar_placeholder: Signal<string>;
  avatar_helper: Signal<string>;
  isDirect_label: Signal<string>;
  isDirect_helper: Signal<string>;
}

@Component({
  selector: 'bk-room-edit-form',
  standalone: true,
  imports: [
    vestForms,
    TextInput, ErrorNote, NotesInput, Checkbox, UrlInput, NumberInput,
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
                <bk-text-input [i18n]="roomIdI18n()" [value]="roomId()" (valueChange)="onFieldChange('roomId', $event)" [readOnly]="true" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [readOnly]="false" [autofocus]="true" [maxLength]=30 />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-checkbox [i18n]="isDirectI18n()" [checked]="isDirect()" (checkedChange)="onFieldChange('isDirect', $event)" [showHelper]="true" [readOnly]="false" />
              </ion-col>
              <ion-col size="12">
                <bk-url [i18n]="avatarI18n()" [value]="avatar()" (valueChange)="onFieldChange('avatar', $event)" [readOnly]="false" />
                <bk-error-note [errors]="urlErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-number-input [i18n]="unreadCountI18n()" [value]="unreadCount()" (valueChange)="onFieldChange('unreadCount', $event)" [readOnly]="true" />
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-notes-input [i18n]="topicI18n()" [value]="topic()" (valueChange)="onFieldChange('topic', $event)" [readOnly]="false" />
    </form>
  `
})
export class RoomEditForm {
  // inputs
  public readonly i18n = input.required<RoomEditFormI18n>();
  public formData = model.required<MatrixRoom>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);

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

  // i18n
  protected roomIdI18n = computed(() => ({
    name: 'roomId',
    label: this.i18n().roomId_label(),
    placeholder: this.i18n().roomId_placeholder(),
    helper: this.i18n().roomId_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected inviteI18n = computed(() => ({
    name: 'invite',
    label: this.i18n().invite_label(),
    placeholder: this.i18n().invite_placeholder(),
    helper: this.i18n().invite_helper()
  } as TextInputI18n));

  protected unreadCountI18n = computed(() => ({
    name: 'unreadCount',
    label: this.i18n().unreadCount_label(),
    placeholder: this.i18n().unreadCount_placeholder(),
    helper: this.i18n().unreadCount_helper()
  } as NumberInputI18n));

  protected topicI18n = computed(() => ({
    name: 'topic',
    label: this.i18n().topic_label(),
    placeholder: this.i18n().topic_placeholder()
  } as NotesInputI18n));

  protected avatarI18n = computed(() => ({
    name: 'avatar',
    label: this.i18n().avatar_label(),
    placeholder: this.i18n().avatar_placeholder(),
    helper: this.i18n().avatar_helper(),
  } as UrlInputI18n));

  protected isDirectI18n = computed(() => ({
    name: 'isDirect',
    label: this.i18n().isDirect_label(),
    helper: this.i18n().isDirect_helper(),
  } as CheckboxI18n));

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
