import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { DEFAULT_DATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, RoleName, InvitationModel, UserModel, DEFAULT_INVITATION_STATE, DEFAULT_INVITATION_ROLE } from '@bk2/shared-models';
import { Chips, DateInput, DateInputI18n, NotesInput, NotesInputI18n, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';
import { PrettyDatePipe } from '@bk2/shared-pipes';
import { I18nService } from '@bk2/shared-i18n';

import { AvatarDisplay, AvatarInput } from '@bk2/avatar-ui';
import { invitationValidations, createPersonAvatar } from '@bk2/relationship-invitation-util';
import { PFX } from './scope';

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
  private readonly i18nService = inject(I18nService);
  protected readonly fieldI18n = this.i18nService.translateAll({
    bkey_label: PFX + 'bkey.label',
    bkey_placeholder: PFX + 'bkey.placeholder',
    bkey_helper: PFX + 'bkey.helper',
    notes_label: PFX + 'notes.label',
    notes_placeholder: PFX + 'notes.placeholder',
    sentAt_label:          PFX + 'sentAt.label',
    sentAt_placeholder:    PFX + 'sentAt.placeholder',
    sentAt_helper:         PFX + 'sentAt.helper',
    respondedAt_label:     PFX + 'respondedAt.label',
    respondedAt_placeholder: PFX + 'respondedAt.placeholder',
    respondedAt_helper:    PFX + 'respondedAt.helper',
    state_label:           PFX + 'state.label',
    role_label:            PFX + 'role.label',
  });
  protected bkeyI18n = computed(() => ({ name: 'bkey', label: this.fieldI18n.bkey_label(), placeholder: this.fieldI18n.bkey_placeholder(), helper: this.fieldI18n.bkey_helper() } as TextInputI18n));
  protected notesI18n = computed(() => ({ name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder() } as NotesInputI18n));
  protected sentAtI18n = computed(() => ({ name: 'sentAt', label: this.fieldI18n.sentAt_label(), placeholder: this.fieldI18n.sentAt_placeholder(), helper: this.fieldI18n.sentAt_helper() } as DateInputI18n));
  protected respondedAtI18n = computed(() => ({ name: 'respondedAt', label: this.fieldI18n.respondedAt_label(), placeholder: this.fieldI18n.respondedAt_placeholder(), helper: this.fieldI18n.respondedAt_helper() } as DateInputI18n));
  protected stateI18n       = computed(() => ({ name: 'state', label: this.fieldI18n.state_label() } as StringSelectI18n));
  protected roleI18n        = computed(() => ({ name: 'role',  label: this.fieldI18n.role_label()  } as StringSelectI18n));

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
