import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonInput, IonInputPasswordToggle, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { EMAIL_LENGTH, PASSWORD_MAX_LENGTH } from '@bk2/shared-constants';

import { SvgIconPipe } from '@bk2/shared-pipes';
import { Chips, Header, ResultLog } from '@bk2/shared-ui';
import { getCategoryItemNames } from '@bk2/shared-util-core';
import { AvatarInfo } from '@bk2/shared-models';

import { flattenRoles, structureRoles } from '@bk2/user-util';
import { AvatarDisplay } from '@bk2/avatar-ui';

import { AocRolesStore } from './aoc-roles.store';

@Component({
  selector: 'bk-aoc-roles',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule, 
    Header, AvatarDisplay, ResultLog, Chips,
    IonContent, IonCard, IonCardHeader, IonCardContent, IonCardTitle, IonGrid, IonRow, IonCol, IonLabel, IonButton, IonIcon, IonNote, IonInput, IonInputPasswordToggle, IonItem
  ],
  providers: [AocRolesStore],
  template: `
    <bk-header [i18n]="{ title: aocRolesStore.i18n.roles_title() }" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocRolesStore.i18n.person_select_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocRolesStore.i18n.person_select_content() }}</ion-col>
            </ion-row>
            <ion-row>
              @if(avatar(); as avatar) {
              <ion-label>
                <bk-avatar-display [avatars]="[avatar]" [showName]="true" />
                <ion-icon src="{{ 'cancel' | svgIcon }}" slot="end" (click)="clearPerson()" />
              </ion-label>
              } @else {
              <ion-button (click)="selectPerson()">
                <ion-icon src="{{ 'personSearch' | svgIcon }}" slot="start" />
                {{ aocRolesStore.i18n.account_select() }}
              </ion-button>
              }
            </ion-row>
            @if(selectedPerson(); as person) {
            <ion-row>
              <ion-col size="3">
                <ion-label>Person:</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ person.firstName }} {{ person.lastName }}</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ person.bkey }}</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ person.favEmail }}</ion-label>
              </ion-col>
            </ion-row>
            } @if(selectedUser(); as user) {
            <ion-row>
              <ion-col size="3">
                <ion-label>User:</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ user.firstName }} {{ user.lastName }}</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ user.bkey }}</ion-label>
              </ion-col>
              <ion-col size="3">
                <ion-label>{{ user.loginEmail }}</ion-label>
              </ion-col>
            </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocRolesStore.i18n.check_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocRolesStore.i18n.check_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="checkAuthorisation()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{ 'shield' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.check_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocRolesStore.i18n.account_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocRolesStore.i18n.account_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-input
                  (ionInput)="onPasswordChange($event)"
                  type="password"
                  name="passwordAoc"
                  [ngModel]="pwdValue()"
                  labelPlacement="floating"
                  [label]="aocRolesStore.i18n.pwd_label()"
                  [placeholder]="aocRolesStore.i18n.pwd_placeholder()"
                  inputMode="text"
                  [maxlength]="pwdLength"
                  [clearInput]="true"
                  (ionClear)="clearPasswordInput()"
                  [counter]="true"
                >
                  <ion-input-password-toggle slot="end"></ion-input-password-toggle>
                </ion-input>
                <ion-item lines="none" class="helper">
                  <ion-note>{{ aocRolesStore.i18n.pwd_helper() }}</ion-note>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-button (click)="createAccountAndUser()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.account_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none" class="helper">
                  <ion-note>{{ aocRolesStore.i18n.pwd_set() }}</ion-note>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-button (click)="setPassword()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{ 'lock-closed' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.account_pwd_set() }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-item lines="none" class="helper">
                  <ion-note>{{ aocRolesStore.i18n.pwd_reset() }}</ion-note>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-button (click)="resetPassword()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{ 'email' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.account_pwd_reset() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocRolesStore.i18n.fbuser_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocRolesStore.i18n.fbuser_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
              </ion-col>
              <ion-col size="6">
                <ion-button (click)="updateFbuser()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{ 'edit' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.fbuser_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ aocRolesStore.i18n.impersonate_title() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ aocRolesStore.i18n.impersonate_content() }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="impersonateUser()" [disabled]="!selectedUser()">
                  <ion-icon src="{{ 'shield' | svgIcon }}" slot="start" />
                  {{ aocRolesStore.i18n.impersonate_button() }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-chips chipName="role" [storedChips]="roles()" (storedChipsChange)="onRoleChange($event)" [allChips]="allRoleNames()" [readOnly]="false" />
      <bk-result-log [title]="logTitle()"  cardTitle="Resultat" [log]="logInfo()" />
    </ion-content>
  `,
})
export class AocRoles {
  protected readonly aocRolesStore = inject(AocRolesStore);
  protected pwdValue = signal<string>('');
  protected emailValue = signal<string>('');

  protected readonly logTitle = computed(() => this.aocRolesStore.logTitle());
  protected readonly logInfo = computed(() => this.aocRolesStore.log());
  protected readonly isLoading = computed(() => this.aocRolesStore.isLoading());
  protected readonly allRoles = computed(() => this.aocRolesStore.appStore.getCategory('roles'));
  protected readonly allRoleNames = computed(() => getCategoryItemNames(this.allRoles()));

  protected pwdLength = PASSWORD_MAX_LENGTH;
  protected emailLength = EMAIL_LENGTH;

  protected selectedPerson = computed(() => this.aocRolesStore.selectedPerson());
  protected selectedUser = computed(() => this.aocRolesStore.selectedUser());
  protected roles = linkedSignal(() => flattenRoles(this.selectedUser()?.roles ?? { 'registered': true }));

  protected avatar = computed(() => {
    const person = this.aocRolesStore.selectedPerson();
    if (person) {
      return {
        key: person.bkey,
        name1: person.firstName,
        name2: person.lastName,
        label: '',
        modelType: 'person',
      } as AvatarInfo;
    }
    return undefined;
  });

  protected async selectPerson(): Promise<void> {
    await this.aocRolesStore.selectPerson();
  }

  protected clearPerson(): void {
    this.aocRolesStore.setSelectedPerson(undefined);
  }

  /**
   * Create a new Firebase user account for the selected person if it does not yet exist.
   * Create a new user account for the same user to link the Firebase account with the subject.
   */
  public async createAccountAndUser(): Promise<void> {
    await this.aocRolesStore.createAccountAndUser(this.pwdValue());
  }

  /**
   * Set the password for the user account to a given value.
   * This is only possible if the user account has been created before.
   * This is a sensitive operation and should be avoided (as the admin then knows the user's password).
   */
  public async setPassword(): Promise<void> {
    await this.aocRolesStore.setPassword(this.pwdValue());
  }

  public async updateFbuser(): Promise<void> {
    await this.aocRolesStore.updateFbuser();
  }

  public async resetPassword(): Promise<void> {
    await this.aocRolesStore.resetPassword();
  }

  public async checkAuthorisation(): Promise<void> {
    await this.aocRolesStore.checkAuthorisation();
  }

  public impersonateUser(): void {
    this.aocRolesStore.impersonateUser();
  }

  protected onPasswordChange(event: CustomEvent): void {
    this.pwdValue.set(event.detail.value);
  }

  protected clearPasswordInput(): void {
    this.pwdValue.set('');
  }

  protected onRoleChange($event: string): void {
    const user = this.selectedUser();
    if (user) {
      user.roles = structureRoles($event);
      this.aocRolesStore.updateUser(user);
    }    
  }
}


/**
 * TBD:
 * loginEmail ersetzen mit modal, wo alle editierbaren Attribute des Firebase Users geändert werden können
 * loginEmail -> auch email auf user und person ändern
 * find all persons that do not have a user model
 * find all persons that do not have a firebase account
 * find all persons where the login email ist not the same on firebase user, user model and person favEmail
 */