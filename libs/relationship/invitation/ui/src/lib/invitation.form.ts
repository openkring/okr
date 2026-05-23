import { Component, computed, input, linkedSignal, model, output, Signal } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_DATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, RoleName, InvitationModel, UserModel, DEFAULT_INVITATION_STATE, DEFAULT_INVITATION_ROLE } from '@bk2/shared-models';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';
import { PrettyDatePipe } from '@bk2/shared-pipes';
import { AvatarDisplay, AvatarInput } from '@bk2/avatar-ui';
import { invitationValidations, createPersonAvatar } from '@bk2/relationship-invitation-util';

export interface InvitationFormI18n {
  bkey_label: Signal<string>;
  bkey_placeholder: Signal<string>;
  bkey_helper: Signal<string>;
  notes_label: Signal<string>;
  notes_placeholder: Signal<string>;
  sentAt_label: Signal<string>;
  sentAt_placeholder: Signal<string>;
  sentAt_helper: Signal<string>;
  respondedAt_label: Signal<string>;
  respondedAt_placeholder: Signal<string>;
  respondedAt_helper: Signal<string>;
  state_label: Signal<string>;
  role_label: Signal<string>;
}

@Component({
  selector: 'bk-invitation-form',
  standalone: true,
  imports: [
    vestForms,
    PrettyDatePipe,
    Chips, AvatarDisplay, AvatarInput, NotesInput, StringSelect, DateInput, TextInput,
    IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonLabel
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form scVestForm
        [formValue]="formData()"
        (formValueChange)="onFormChange($event)"
        [suite]="suite"
        (dirtyChange)="dirty.emit($event)"
        (validChange)="valid.emit($event)"
      >
        @if(currentUser(); as currentUser) {
          <ion-card>
            <ion-card-header>
              <ion-card-title>Invitation</ion-card-title>
            </ion-card-header>
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
                  <!-- calevent -->
                  <ion-col size="12" size-md="6">
                    <ion-label>{{ date() | prettyDate}}</ion-label>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-label>{{ name() }}</ion-label>
                  </ion-col>
                </ion-row>

                <ion-row>
                  <!-- inviter -->
                  <ion-col size="12" size-md="6">
                    <ion-label>Inviter</ion-label>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      @if(isReadOnly() || !editable()) {
                        <bk-avatar-display [avatars]="[inviterAvatar()]" [showName]="true" />
                      } @else {
                        <bk-avatar-input (avatarAdded)="add('inviter', $event)" (selectClicked)="selectClicked.emit('inviter')" />
                      }
                    </ion-item>
                  </ion-col>

                  <!-- invitee -->
                  <ion-col size="12" size-md="6">
                    <ion-label>Invitee</ion-label>
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <ion-item lines="none">
                      @if(isReadOnly() || !editable()) {
                        <bk-avatar-display [avatars]="[inviteeAvatar()]" [showName]="true" />
                      } @else {
                        <bk-avatar-input (avatarAdded)="add('invitee', $event)" (selectClicked)="selectClicked.emit('invitee')" />
                      }
                    </ion-item>
                  </ion-col>

                  <!-- state -->
                  <ion-col size="12" size-md="6">
                    <bk-string-select [i18n]="stateI18n()" [selectedString]="state()" (selectedStringChange)="onFieldChange('state', $event)" [readOnly]="readOnly()" [stringList]="['pending', 'accepted', 'declined', 'maybe']" />
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-string-select [i18n]="roleI18n()" [selectedString]="role()" (selectedStringChange)="onFieldChange('role', $event)" [readOnly]="readOnly()" [stringList]="['required', 'optional', 'info']" />           
                  </ion-col>

                  <!-- sentAt -->
                  <ion-col size="12" size-md="6">
                    <bk-date-input [i18n]="sentAtI18n()" [storeDate]="sentAt()" (storeDateChange)="onFieldChange('sentAt', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                  </ion-col>

                  <!-- respondedAt -->
                  <ion-col size="12" size-md="6">
                    <bk-date-input [i18n]="respondedAtI18n()" [storeDate]="respondedAt()" (storeDateChange)="onFieldChange('respondedAt', $event)" [locale]="locale()" [readOnly]="isReadOnly()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            </ion-card-content>
          </ion-card>
        }

        @if(hasRole('privileged') || hasRole('resourceAdmin')) {
          <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
        } 
        
        @if(hasRole('admin')) {
          <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class InvitationForm {
  public readonly i18n = input.required<InvitationFormI18n>();
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.i18n().bkey_label(), placeholder: this.i18n().bkey_placeholder(), helper: this.i18n().bkey_helper() } as TextInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as NotesInputI18n));
  protected sentAtI18n = computed(() => ({ name: 'sentAt', label: this.i18n().sentAt_label(), placeholder: this.i18n().sentAt_placeholder(), helper: this.i18n().sentAt_helper() } as DateInputI18n));
  protected respondedAtI18n = computed(() => ({ name: 'respondedAt', label: this.i18n().respondedAt_label(), placeholder: this.i18n().respondedAt_placeholder(), helper: this.i18n().respondedAt_helper() } as DateInputI18n));
  protected stateI18n       = computed(() => ({ name: 'state', label: this.i18n().state_label() } as StringSelectI18n));
  protected roleI18n        = computed(() => ({ name: 'role',  label: this.i18n().role_label()  } as StringSelectI18n));

  // inputs
  public readonly formData = model.required<InvitationModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly locale = input.required<string>();
  public readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected editable = input(false);

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public selectClicked = output<'inviter' | 'invitee'>();

  // validation and errors
  protected readonly suite = invitationValidations;
  private readonly validationResult = computed(() => invitationValidations(this.formData()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected inviterAvatar = computed(() => createPersonAvatar(this.formData().inviterKey, this.formData().inviterFirstName, this.formData().inviterLastName));
  protected inviteeAvatar = computed(() => createPersonAvatar(this.formData().inviteeKey, this.formData().inviteeFirstName, this.formData().inviteeLastName));
  protected calEventKey = linkedSignal(() => this.formData().caleventKey);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected date = linkedSignal(() => this.formData().date ?? getTodayStr());
  protected state = linkedSignal(() => this.formData().state ?? DEFAULT_INVITATION_STATE);
  protected role = linkedSignal(() => this.formData().role ?? DEFAULT_INVITATION_ROLE);
  protected sentAt = linkedSignal(() => this.formData().sentAt ?? getTodayStr());
  protected respondedAt = linkedSignal(() => this.formData().respondedAt ?? DEFAULT_DATE);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected bkey = computed(() => this.formData().bkey ?? '');

  // passing constants to template
  protected nameLength = NAME_LENGTH;

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number | AvatarInfo[] | AvatarInfo): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  protected onFormChange(value: InvitationModel): void {
    this.formData.update(vm => ({ ...vm, ...value }));
    debugFormModel('InvitationForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('InvitationForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected add(role: 'inviter' | 'invitee', avatar: AvatarInfo): void {
    if (role === 'inviter') {
      this.formData.update(vm => ({
        ...vm,
        inviterKey: avatar.key,
        inviterFirstName: avatar.name1,
        inviterLastName: avatar.name2,
      }));
    } else if (role === 'invitee') {
      this.formData.update(vm => ({
        ...vm,
        inviteeKey: avatar.key,
        inviteeFirstName: avatar.name1,
        inviteeLastName: avatar.name2,
      }));
    }
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
