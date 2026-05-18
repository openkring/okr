import { Component, computed, effect, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { AuthCredentials } from '@bk2/shared-models';
import { Header } from '@bk2/shared-ui';

import { AuthService } from '@bk2/auth-data-access';
import { LoginForm } from '@bk2/auth-ui';

import { AuthStore } from './auth.store';

@Component({
  selector: 'bk-login-modal',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonButton, IonItem
  ],
  template: `
    <bk-header [title]="store.i18n.login_title()" [isModal]="true" />
    <ion-content>
      <bk-login-form context="login"
        [(vm)]="currentCredentials" (validChange)="formIsValid = $event"
        [emailHelper]="emailHelper()"
        [pwdHelper]="pwdHelper()"
      />
      <ion-item lines="none">
        <ion-button slot="start" fill="clear" (click)="cancel()">{{ store.i18n.cancel() }}</ion-button>
        <ion-button slot="end" fill="clear" [disabled]="!formIsValid" (click)="login()">{{ store.i18n.login_title() }}</ion-button>
      </ion-item>
    </ion-content>
  `,
})
export class LoginModal {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);
  protected readonly authService = inject(AuthService);
  protected readonly store = inject(AuthStore);

  protected formIsValid = false;
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });

  protected emailHelper = computed(() => '');
  protected pwdHelper = computed(() => '');
  // default context is login
// protected emailHelper = computed(() => this.context() === 'email' ? '@input.emailEmail.helper' : '@input.loginEmail.helper');/
// protected pwdHelper = computed(() => this.context() === 'password' ? '@input.passwordPassword.helper' : '@input.loginPassword.helper');


  constructor() {
    effect(() => {
      console.log('formIsValid=', this.formIsValid);
      console.log('currentCredentials', this.currentCredentials());
    });
  }

  public async login(): Promise<void> {
    await this.modalController.dismiss(this.currentCredentials, 'cancel');
    this.authService.login(this.currentCredentials(), this.appStore.appConfig().rootUrl, this.appStore.appConfig().loginUrl);
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(undefined, 'cancel');
  }
}
