import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';

import { AppStore } from '@bk2/shared-feature';
import { Header } from '@bk2/shared-ui';
import { AlertService, navigateByUrl } from '@bk2/shared-util-angular';
import { getImgixUrlWithAutoParams } from '@bk2/shared-util-core';
import { AuthCredentials } from '@bk2/shared-models';

import { AuthService } from '@bk2/auth-data-access';
import { LoginForm } from '@bk2/auth-ui';

import { AuthStore } from './auth.store';

@Component({
  selector: 'bk-confirm-password-reset-page',
  standalone: true,
  providers: [AuthStore],
  imports: [
    Header, LoginForm,
    IonContent, IonImg, IonLabel, IonGrid, IonRow, IonCol, IonButton, IonText,
  ],
  styles: `
    .background-image { filter: blur(8px); -webkit-filter: blur(8px); position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.7; z-index: 1; }
    .title { text-align: center; font-size: 2rem; padding: 20px; }
    .logo { max-width: 150px; text-align: center; display: block; margin-left: auto; margin-right: auto; width: 50%; z-index: 10; padding: 20px; }
    .button-container { margin: 20px; }
    @media (width <= 600px) {
      .login-form { width: 100%; text-align: center; z-index: 5; }
      .login-container { display: flex; height: 100%; padding: 10px; }
    }
    @media (width > 600px) {
      .login-form { border-radius: 10px; max-width: 600px; width: 90%; text-align: center; z-index: 5; }
      .login-container { display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
    }
  `,
  template: `
    <bk-header [i18n]="{ title: store.i18n.pwdconfirm_title() }" [showCloseButton]="false" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" alt="Ruderer des Seeclub Stäfa" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="gotoHome()" />
          <ion-label class="title"><strong>{{ store.i18n.newpwd() }}</strong></ion-label>

          @if (invalidCode()) {
            <ion-text color="danger">
              <p>{{ store.i18n.invalid_link() }}</p>
            </ion-text>
          } @else if (success()) {
            <ion-text color="success">
              <p>{{ store.i18n.success() }}</p>
            </ion-text>
          } @else {
            <bk-login-form context="password"
              [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
              [emailHelper]="emailHelper()"
              [pwdHelper]="pwdHelper()"
            />
            <div class="button-container">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" [disabled]="!formIsValid()" (click)="confirm()">
                      {{ store.i18n.savepwd() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </div>
          }
        </div>
      </div>
    </ion-content>
  `,
})
export class ConfirmPasswordResetPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly appStore = inject(AppStore);
  private readonly alertService = inject(AlertService);
  protected readonly store = inject(AuthStore);

  // inputs
  private readonly oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
  private readonly continueUrl = this.route.snapshot.queryParamMap.get('continueUrl') ?? '/auth/login';

  // computed
  public logoUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().welcomeBannerUrl)}`);
  protected emailHelper = computed(() => '');
  protected pwdHelper = computed(() => '');
  //protected emailHelper = computed(() => this.context() === 'email' ? '@input.emailEmail.helper' : '@input.loginEmail.helper');
  //protected pwdHelper = computed(() => this.context() === 'password' ? '@input.passwordPassword.helper' : '@input.loginPassword.helper');

  // signals
  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });
  protected success = signal(false);
  protected invalidCode = signal(!this.oobCode);

  // methods
  public async confirm(): Promise<void> {
    const email = await this.authService.confirmPasswordReset(this.oobCode, this.currentCredentials().loginPassword);
    if (email) {
      this.success.set(true);
      await this.alertService.showToast(`Passwort für ${email} wurde geändert.`);
      navigateByUrl(this.router, this.continueUrl);
    } else {
      this.invalidCode.set(true);
    }
  }

  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().rootUrl);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
