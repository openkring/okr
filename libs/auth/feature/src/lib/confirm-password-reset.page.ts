import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonLabel, IonRow, IonText } from '@ionic/angular/standalone';

import { Header } from '@okr/shared-ui';
import { getImgixUrlWithAutoParams } from '@okr/shared-util-core';
import { AuthCredentials } from '@okr/shared-models';

import { LoginForm } from '@okr/auth-ui';
import { isRetryablePwdResetFailure, PwdResetFailure } from '@okr/auth-util';

import { AuthStore } from './auth.store';

@Component({
  selector: 'okr-confirm-password-reset-page',
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
    /*
      The screens sit on a blurred, 70%-opaque photo. Without a ground of their own the labels,
      helper texts and the clear/outline buttons were drawn straight onto that photo and their
      contrast depended on whichever part of the tenant's banner happened to be underneath.
      A translucent panel keeps the photo visible but gives every text a defined background.
      --ion-background-color-rgb follows the light/dark theme; the shadow separates the panel
      from the image at the edges.
    */
    .login-form {
      background: rgba(var(--ion-background-color-rgb, 255, 255, 255), 0.88);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      color: var(--ion-text-color);
      border-radius: 16px;
      padding: 4px 12px 12px;
      box-shadow: 0 10px 30px rgb(0 0 0 / 30%);
    }
    @media (width <= 600px) {
      .login-form { width: 100%; text-align: center; z-index: 5; }
      .login-container { display: flex; height: 100%; padding: 10px; }
    }
    @media (width > 600px) {
      .login-form { max-width: 600px; width: 90%; text-align: center; z-index: 5; }
      .login-container { display: flex; align-items: center; justify-content: center; height: 100%; padding: 20px; margin: 20px; }
    }
  `,
  template: `
    <okr-header [i18n]="{ title: store.i18n.pwdconfirm() }" [showCloseButton]="false" />
    <ion-content>
      <div class="login-container">
        <img class="background-image" [src]="backgroundImageUrl()" [alt]="store.i18n.background_alt()" />
        <div class="login-form">
          <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="store.gotoHome()" />
          <ion-label class="title"><strong>{{ store.i18n.newpwd() }}</strong></ion-label>

          @if (checking()) {
            <!-- The link is verified before anything is asked of the user; see ngOnInit. -->
            <ion-text><p>{{ store.i18n.checking() }}</p></ion-text>
          } @else if (deadLink()) {
            <ion-text color="danger">
              <p>{{ errorMessage() }}</p>
            </ion-text>
            <div class="button-container">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" (click)="store.gotoNewResetLink()">
                      {{ store.i18n.request_new_link() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col>
                    <ion-button expand="block" fill="outline" (click)="store.gotoLogin()">
                      {{ store.i18n.goto_login() }}
                    </ion-button>
                  </ion-col>
                </ion-row>
              </ion-grid>
            </div>
          } @else if (success()) {
            <ion-text color="success">
              <p>{{ store.i18n.success() }}</p>
            </ion-text>
          } @else {
            @if (errorMessage()) {
              <ion-text color="danger">
                <p>{{ errorMessage() }}</p>
              </ion-text>
            }
            <okr-login-form context="password"
              [(vm)]="currentCredentials" (validChange)="onValidChange($event)"
              [i18n]="store.i18n"
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
export class ConfirmPasswordResetPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  protected readonly store = inject(AuthStore);

  // inputs
  private readonly oobCode = this.route.snapshot.queryParamMap.get('oobCode') ?? '';
  private readonly continueUrl = this.route.snapshot.queryParamMap.get('continueUrl') ?? '/auth/login';

  // computed
  public logoUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.store.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.store.config().welcomeBannerUrl)}`);

  // signals
  protected formIsValid = signal(false);
  public currentCredentials = signal<AuthCredentials>({
    loginEmail: '',
    loginPassword: '',
  });
  protected success = signal(false);
  /** True until the link has been checked — the form is not shown before we know it is usable. */
  protected checking = signal(false);

  /** Why the last attempt failed — undefined while nothing has gone wrong yet. */
  protected failure = signal<PwdResetFailure | undefined>(this.oobCode ? undefined : 'unknown');

  /**
   * A dead link cannot be saved by retrying, so the form is replaced by the message plus the
   * two ways out (new link / sign in). weakPassword and network keep the form: the message
   * appears above it and the user simply tries again.
   */
  protected deadLink = computed(() => {
    const reason = this.failure();
    return reason !== undefined && !isRetryablePwdResetFailure(reason);
  });

  protected errorMessage = computed(() => {
    switch (this.failure()) {
      case 'expired':      return this.store.i18n.error_expired();
      case 'used':         return this.store.i18n.error_used();
      case 'noAccount':    return this.store.i18n.error_noAccount();
      case 'weakPassword': return this.store.i18n.error_weakPassword();
      case 'network':      return this.store.i18n.error_network();
      case 'unknown':      return this.store.i18n.invalid_link();
      default:             return '';
    }
  });

  // methods
  /**
   * Check the link before asking for anything.
   *
   * The page used to render the form straight away and only validate the code on submit, so an
   * expired or already-used link was reported after the user had thought up and typed a
   * password. Verifying here costs one call, turns that into an immediate answer, and yields
   * the address the link belongs to — which the form needs as its account field so iOS can
   * store the new password against something.
   */
  public async ngOnInit(): Promise<void> {
    if (!this.oobCode) return;              // failure is already 'unknown' — the dead-link branch renders
    this.checking.set(true);
    const result = await this.store.verifyResetCode(this.oobCode);
    this.checking.set(false);
    if (typeof result === 'string') {
      this.failure.set(result);
      return;
    }
    this.currentCredentials.update(c => ({ ...c, loginEmail: result.email }));
  }

  public async confirm(): Promise<void> {
    const reason = await this.store.confirmPasswordReset(this.oobCode, this.continueUrl, this.currentCredentials().loginPassword);
    this.failure.set(reason);
    if (!reason) this.success.set(true);
  }

  protected onValidChange(isValid: boolean): void {
    this.formIsValid.set(isValid);
  }
}
