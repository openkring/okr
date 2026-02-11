import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow, ModalController } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';
import { Router } from '@angular/router';

import { DEFAULT_DATE, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_TAGS, NAME_LENGTH } from '@bk2/shared-constants';
import { AvatarInfo, CategoryListModel, RoleName, InvitationModel, UserModel, DEFAULT_INVITATION_STATE, DEFAULT_INVITATION_ROLE } from '@bk2/shared-models';
import { ChipsComponent, DateInputComponent, NotesInputComponent, StringSelectComponent, TextInputComponent } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, getTodayStr, hasRole } from '@bk2/shared-util-core';

import { AvatarDisplayComponent, AvatarInputComponent } from '@bk2/avatar-ui';
import { invitationValidations, createPersonAvatar } from '@bk2/relationship-invitation-util';
import { PrettyDatePipe } from '@bk2/shared-pipes';

@Component({
  selector: 'bk-invitation-form',
  standalone: true,
  imports: [
    vestForms,
    PrettyDatePipe,
    ChipsComponent, AvatarDisplayComponent, AvatarInputComponent, NotesInputComponent, StringSelectComponent, DateInputComponent,
    TextInputComponent,
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
                      <bk-text-input name="bkey" [value]="bkey()" label="bkey" [readOnly]="true" [copyable]="true" />
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
                    <bk-string-select name="state"  [selectedString]="state()" (selectedStringChange)="onFieldChange('state', $event)" [readOnly]="readOnly()" [stringList] = "['pending', 'accepted', 'declined', 'maybe']" />           
                  </ion-col>
                  <ion-col size="12" size-md="6">
                    <bk-string-select name="role"  [selectedString]="role()" (selectedStringChange)="onFieldChange('role', $event)" [readOnly]="readOnly()" [stringList] = "['required', 'optional', 'info']" />           
                  </ion-col>

                  <!-- sentAt -->
                  <ion-col size="12" size-md="6">
                    <bk-date-input name="sentAt"  [storeDate]="sentAt()" (storeDateChange)="onFieldChange('sentAt', $event)" [locale]="locale()" [readOnly]="isReadOnly()" [showHelper]=true />
                  </ion-col>

                  <!-- respondedAt -->
                  <ion-col size="12" size-md="6">
                    <bk-date-input name="respondedAt"  [storeDate]="respondedAt()" (storeDateChange)="onFieldChange('respondedAt', $event)" [locale]="locale()" [readOnly]="isReadOnly()" [showHelper]=true />
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
          <bk-notes name="notes" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
        }
      </form>
    }
  `,
})
export class InvitationFormComponent {
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
