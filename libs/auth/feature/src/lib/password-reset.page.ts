import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonCol, IonContent, IonGrid, IonImg, IonInput, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular/standalone';

import { EMAIL_LENGTH } from '@bk2/shared/constants';
import { getImgixUrlWithAutoParams } from '@bk2/shared/util-core';
import { navigateByUrl } from '@bk2/shared/util-angular';
import { HeaderComponent } from '@bk2/shared/ui';
import { TranslatePipe } from '@bk2/shared/i18n';
import { AuthService } from '@bk2/auth/data-access';
import { AppStore } from '@bk2/shared/feature';

@Component({
    selector: 'bk-password-reset-page',
    imports: [
      TranslatePipe, AsyncPipe, 
      HeaderComponent,
      IonContent, IonImg, IonLabel, IonItem, IonInput, IonNote, IonGrid, IonRow, IonCol, IonButton
    ],
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
      <bk-header title="{{'@auth.operation.pwdreset.title' | translate | async }}" />
      <ion-content>
        <div class="login-container">
          <img class="background-image" [src]="backgroundImageUrl()" alt="Background Image" />
          <div class="login-form">
            <ion-img class="logo" [src]="logoUrl()" alt="logo" (click)="gotoHome()"></ion-img>
            <ion-label class="title"><strong>{{ '@auth.operation.pwdreset.title' | translate | async }}</strong></ion-label>
            <ion-item lines="none">
              <ion-input name="email" [value]="email" (ionChange)="changeEmail($event)" 
                [autofocus]="true"
                type="email"
                [clearInput]="true"
                [counter]="true"
                [maxlength]="maxLength"
                label="{{ '@input.loginEmail.label' | translate | async }}"
                labelPlacement="floating"
                required
                errorText="{{'@input.loginEmail.error' | translate | async}}"
                placeholder="{{ '@input.loginEmail.placeholder' | translate | async }}">
              </ion-input>
            </ion-item>
            <ion-item lines="none">
              <ion-note>{{'@auth.operation.pwdreset.note' | translate | async}}</ion-note>
            </ion-item>
              <div class="button-container">
                <ion-grid>
                  <ion-row>
                    <ion-col size="4">
                      <ion-button expand="block" fill="outline" (click)="gotoHome()">{{'@general.operation.change.cancel' | translate | async}}</ion-button>
                    </ion-col>
                    <ion-col size="2" offset="6">
                      <ion-button expand="block" [disabled]="!email || email.length < 5 || !email.includes('@') || !email.includes('.')" (click)="resetPassword()">{{'@general.operation.change.ok' | translate | async}}</ion-button>
                    </ion-col>
                  </ion-row>
                </ion-grid>
            </div>  
          </div>
        </div>
      </ion-content>
    `
})
export class PasswordResetPageComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly appStore = inject(AppStore);

  public logoUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().logoUrl)}`);
  public backgroundImageUrl = computed(() => `${this.appStore.services.imgixBaseUrl()}/${getImgixUrlWithAutoParams(this.appStore.appConfig().welcomeBannerUrl)}`);

  public email: string | undefined;
  protected maxLength = EMAIL_LENGTH;

  protected changeEmail(event: CustomEvent): void {
    this.email = event.detail.value.trim();
  }

  /**
  * If the form is valid it will call the AuthData service to reset the user's password displaying a loading
  * component while the user waits.
  */
    public async resetPassword(): Promise<void> {
      if (this.email) {
        await this.authService.resetPassword(this.email, this.appStore.appConfig().loginUrl);
      }
    }

  /**
   * Change to the Home page.
   */
  public async gotoHome(): Promise<void> {
    await navigateByUrl(this.router, this.appStore.appConfig().rootUrl);
  }
}
