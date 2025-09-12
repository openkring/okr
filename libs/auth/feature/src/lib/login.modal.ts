import { AsyncPipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonItem, ModalController } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AuthCredentials } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';

import { AuthService } from '@bk2/auth-data-access';
import { LoginFormComponent } from '@bk2/auth-ui';

@Component({
  selector: 'bk-login-modal',
  standalone: true,
  imports: [HeaderComponent, LoginFormComponent, TranslatePipe, AsyncPipe, IonContent, IonButton, IonItem],
  template: `
    <bk-header title="{{ '@auth.operation.login.title' | translate | async }}" [isModal]="true" />
    <ion-content>
      <bk-login-form [(vm)]="currentCredentials" (validChange)="formIsValid = $event" />
      <ion-item lines="none">
        <ion-button slot="start" fill="clear" (click)="cancel()">{{ '@general.operation.change.cancel' | translate | async }}</ion-button>
        <ion-button slot="end" fill="clear" [disabled]="!formIsValid" (click)="login()">{{ '@auth.operation.login.title' | translate | async }}</ion-button>
      </ion-item>
    </ion-content>
  `,
})
export class LoginModalComponent {
  private readonly modalController = inject(ModalController);
  protected readonly appStore = inject(AppStore);
  protected readonly authService = inject(AuthService);

  protected formIsValid = false;
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });

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
