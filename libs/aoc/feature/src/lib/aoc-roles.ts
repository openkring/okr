import { AsyncPipe } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonContent, IonGrid, IonIcon, IonInput, IonInputPasswordToggle, IonItem, IonLabel, IonNote, IonRow } from "@ionic/angular/standalone";

import { TranslatePipe } from "@bk2/shared/i18n";
import { AvatarDisplayComponent, HeaderComponent, ResultLogComponent } from "@bk2/shared/ui";
import { AocRolesStore } from "./aoc-roles.store";
import { ModelType } from "@bk2/shared/models";
import { SvgIconPipe } from "@bk2/shared/pipes";
import { PASSWORD_MAX_LENGTH } from "@bk2/shared/constants";


@Component({
  selector: 'bk-aoc-roles',
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    FormsModule,
    HeaderComponent, AvatarDisplayComponent, ResultLogComponent,
    IonContent, IonCard, IonCardHeader, IonCardContent, IonCardTitle,
    IonGrid, IonRow, IonCol, IonLabel, IonButton, IonIcon,
    IonNote, IonInput, IonInputPasswordToggle, IonItem
  ],
  providers: [AocRolesStore],
  template: `
    <bk-header title="{{ '@aoc.roles.title' | translate | async }}" />
    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.roles.personSelect.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.roles.personSelect.content' | translate | async }}</ion-col>
            </ion-row>
              <ion-row>
                @if(avatar(); as avatar) {
                  <ion-label>
                    <bk-avatar-display [avatars]="[avatar]" [showName]="true" />
                    <ion-icon src="{{'close_cancel' | svgIcon}}" slot="end" (click)="clearPerson()" />
                  </ion-label>
                } @else {
                  <ion-button (click)="selectPerson()">
                    <ion-icon src="{{'person-search' | svgIcon}}" slot="start" />
                    {{ '@aoc.roles.account.select' | translate | async  }}
                  </ion-button>
                }
              </ion-row>
            </ion-grid>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.roles.check.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.roles.check.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="checkAuthorisation()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'shield-checkmark' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.check.button' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
          <ion-card-header>
            <ion-card-title>{{ '@aoc.roles.assignment.title' | translate | async }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-grid>
              <ion-row>
                <ion-col>{{ '@aoc.roles.assignment.content' | translate | async }}</ion-col>
              </ion-row>
              </ion-grid>
          </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.roles.account.title' | translate | async  }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.roles.account.content' | translate | async  }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6">
                <ion-input (ionInput)="onPasswordChange($event)"
                  type="password"
                  name="passwordAoc" 
                  [ngModel]="value()"
                  labelPlacement="floating"
                  label="{{'@input.passwordAoc.label' | translate | async }}"
                  placeholder="{{'@input.passwordAoc.placeholder' | translate | async }}"
                  inputMode="text"
                  [maxlength]="maxLength"
                  [clearInput]="true"
                  (ionClear)="clearInput()"
                  [counter]="true"
                  >
                  <ion-input-password-toggle slot="end"></ion-input-password-toggle>
                </ion-input>
                <ion-item lines="none" class="helper">
                  <ion-note>{{'@input.passwordAoc.helper' | translate | async}}</ion-note>
                </ion-item>
              </ion-col>
              <ion-col size="6">
                <ion-button (click)="createAccountAndUser()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'create_edit' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.account.button' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
            <!--
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="setPassword()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'lock-closed' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.account.password-set' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
              -->
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="resetPassword()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'email' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.account.password-reset' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ '@aoc.roles.chat.title' | translate | async }}</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-grid>
            <ion-row>
              <ion-col>{{ '@aoc.roles.chat.content' | translate | async }}</ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="checkChatUser()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'chatbox-ellipses' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.chat.check' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="createStreamUser()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'chatbox-ellipses' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.chat.add' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="6"></ion-col>
              <ion-col size="6">
                <ion-button (click)="revokeStreamUserToken()" [disabled]="!selectedPerson()">
                  <ion-icon src="{{'chatbox-ellipses' | svgIcon}}" slot="start" />
                  {{ '@aoc.roles.chat.revoke' | translate | async  }}
                </ion-button>
              </ion-col>
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>
      <bk-result-log [title]="logTitle()" [log]="logInfo()" />
    </ion-content>
    `
})
export class AocRolesComponent {
  protected readonly aocRolesStore = inject(AocRolesStore);
  protected value = signal<string>('');

  protected readonly logTitle = computed(() => this.aocRolesStore.logTitle());
  protected readonly logInfo = computed(() => this.aocRolesStore.log());
  protected readonly isLoading = computed(() => this.aocRolesStore.isLoading());

  protected maxLength = PASSWORD_MAX_LENGTH;

  protected selectedPerson = computed(() => this.aocRolesStore.selectedPerson());
  protected avatar = computed(() => {
    const _person = this.aocRolesStore.selectedPerson();
    if (_person) {
      return {
        key: _person.bkey,
        name1: _person.firstName,
        name2: _person.lastName,
        label: '',
        modelType: ModelType.Person,
      };
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
    await this.aocRolesStore.createAccountAndUser(this.value());
  }

  /**
   * Set the password for the user account to a given value.
   * This is only possible if the user account has been created before.
   * This is a sensitive operation and should be avoided (as the admin then knows the user's password).
   */
  public async setPassword(): Promise<void> {
    await this.aocRolesStore.setPassword();
  }

  public async resetPassword(): Promise<void> {
    await this.aocRolesStore.resetPassword();
  }

  public async checkAuthorisation(): Promise<void> {
    await this.aocRolesStore.checkAuthorisation();
  }

  public checkChatUser(): void {
    this.aocRolesStore.checkChatUser();
  }

  public revokeStreamUserToken(): void {
    this.aocRolesStore.revokeStreamUserToken();
  }

  public createStreamUser(): void {
    this.aocRolesStore.createStreamUser();
  }

  public impersonateUser(uid: string): void {
    this.aocRolesStore.impersonateUser(uid);
  }

  protected onPasswordChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
  }

  protected clearInput(): void {
    this.value.set('');
  }
}
