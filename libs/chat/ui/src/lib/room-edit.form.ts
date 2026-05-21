import { Component, computed, inject, input, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { MatrixRoom, UserModel } from '@bk2/shared-models';
import { Checkbox, CheckboxI18n, ErrorNote, NotesInput, NotesInputI18n, NumberInput, NumberInputI18n, TextInput, TextInputI18n, UrlInput, UrlInputI18n } from '@bk2/shared-ui';
import { DEFAULT_NAME, DEFAULT_URL } from '@bk2/shared-constants';
import { debugFormErrors, debugFormModel } from '@bk2/shared-util-core';
import { I18nService } from '@bk2/shared-i18n';

import { roomValidations } from '@bk2/chat-util';
import { PFX } from './scope';

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
<!--               <ion-col size="12">
                <bk-text-input [i18n]="inviteI18n()" [value]="invite()" (valueChange)="onFieldChange('invite', $event)" [readOnly]="false" [maxLength]=500 />
              </ion-col> -->
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
  private readonly i18nService = inject(I18nService);

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

  // i18n
  protected readonly fieldI18n = this.i18nService.translateAll({
    roomId_label:       PFX + 'roomId.label',
    roomId_placeholder: PFX + 'roomId.placeholder',
    roomId_helper:      PFX + 'roomId.helper',
    name_label:         PFX + 'name.label',
    name_placeholder:   PFX + 'name.placeholder',
    name_helper:        PFX + 'name.helper',
    invite_label:           PFX + 'invite.label',
    invite_placeholder:     PFX + 'invite.placeholder',
    invite_helper:          PFX + 'invite.helper',
    unreadCount_label:      PFX + 'unreadCount.label',
    unreadCount_placeholder: PFX + 'unreadCount.placeholder',
    unreadCount_helper:     PFX + 'unreadCount.helper',
    topic_label:            PFX + 'topic.label',
    topic_placeholder:      PFX + 'topic.placeholder',
    avatar_label:           PFX + 'avatar.label',
    avatar_placeholder:     PFX + 'avatar.placeholder',
    avatar_helper:          PFX + 'avatar.helper',
    isDirect_label:         PFX + 'isDirect.label',
    isDirect_helper:        PFX + 'isDirect.helper',
  });

  protected roomIdI18n = computed(() => ({
    name: 'roomId',
    label: this.fieldI18n.roomId_label(),
    placeholder: this.fieldI18n.roomId_placeholder(),
    helper: this.fieldI18n.roomId_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper()
  } as TextInputI18n));

  protected inviteI18n = computed(() => ({
    name: 'invite',
    label: this.fieldI18n.invite_label(),
    placeholder: this.fieldI18n.invite_placeholder(),
    helper: this.fieldI18n.invite_helper()
  } as TextInputI18n));

  protected unreadCountI18n = computed(() => ({
    name: 'unreadCount',
    label: this.fieldI18n.unreadCount_label(),
    placeholder: this.fieldI18n.unreadCount_placeholder(),
    helper: this.fieldI18n.unreadCount_helper()
  } as NumberInputI18n));

  protected topicI18n = computed(() => ({
    name: 'topic',
    label: this.fieldI18n.topic_label(),
    placeholder: this.fieldI18n.topic_placeholder()
  } as NotesInputI18n));

  protected avatarI18n = computed(() => ({
    name: 'avatar',
    label: this.fieldI18n.avatar_label(),
    placeholder: this.fieldI18n.avatar_placeholder(),
    helper: this.fieldI18n.avatar_helper(),
  } as UrlInputI18n));

  protected isDirectI18n = computed(() => ({
    name: 'isDirect',
    label: this.fieldI18n.isDirect_label(),
    helper: this.fieldI18n.isDirect_helper(),
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
