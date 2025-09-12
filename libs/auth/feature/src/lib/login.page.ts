import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { TranslatePipe } from '@bk2/shared-i18n';
import { AuthCredentials } from '@bk2/shared-models';
import { HeaderComponent } from '@bk2/shared-ui';
import { navigateByUrl } from '@bk2/shared-util-angular';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';

import { AuthService } from '@bk2/auth-data-access';
import { LoginFormComponent } from '@bk2/auth-ui';

@Component({
  selector: 'bk-login-page',
  standalone: true,
  imports: [TranslatePipe, AsyncPipe, HeaderComponent, LoginFormComponent, IonContent, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonButton],
  styles: `
  .background-image { filter: blur(8px); -webkit-filter: blur(8px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1;}
  .title { text-align: center; font-size: 2rem; padding: 20px; }
  .logo { max-width: 150px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; padding: 20px; }
  .button-container { margin: 20px; }
  @media (width <= 600px) {
     .login-form { width: 100%; text-align: center; z-index: 5; }
     .login-container {  display: flex; height: 100%; padding: 10px; }
   }
   @media (width > 600px) {
     .login-form { border-radius: 10px; max-width: 600px; width: 90%; text-align: center; z-index: 5; }
     .login-container {  display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
   }
  `,
  template: `
    <bk-header title="{{ '@auth.operation.login.title' | translate | async }}" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" alt="Background" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="gotoHome()" />
          <ion-label class="title"
            ><strong>{{ '@auth.operation.login.title' | translate | async }}</strong></ion-label
          >
          <bk-login-form [(vm)]="currentCredentials" (validChange)="onValidChange($event)" />
          <div class="button-container">
            <ion-grid>
              <ion-row>
                <ion-col>
                  <ion-button #loginButton [disabled]="!formIsValid()" (click)="login()">{{ '@auth.operation.login.title' | translate | async }}</ion-button>
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col>
                  <ion-button fill="outline" (click)="resetPassword()" size="small">{{ '@auth.operation.pwdreset.title' | translate | async }}</ion-button>
                </ion-col>
              </ion-row>
            </ion-grid>
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class LoginPageComponent {
  private readonly router = inject(Router);
  protected readonly appStore = inject(AppStore);
  protected readonly authService = inject(AuthService);

  public logoUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().welcomeBannerUrl)}`);

  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });

  public async resetPassword(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().passwordResetUrl);
  }

  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().rootUrl);
  }

  /**
   * Login a returning user with already existing credentials.
   */
  public async login(): Promise<void> {
    this.authService.login(this.currentCredentials(), this.appStore.appConfig().rootUrl, this.appStore.appConfig().loginUrl);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
