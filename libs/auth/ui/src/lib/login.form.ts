import { Component, computed, effect, linkedSignal, model, output, input, Signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { AuthCredentials } from '@bk2/shared-models';
import { EmailInput, EmailInputI18n, ErrorNote, PasswordInput, PasswordInputI18n } from '@bk2/shared-ui';
import { validateVestTree } from '@bk2/shared-util-angular';

import { authCredentialsValidations, emailValidations, loginValidations, passwordValidations } from '@bk2/auth-util';

export interface LoginFormI18n {
  email_label: Signal<string>;
  email_placeholder: Signal<string>;
  email_helper: Signal<string>;
  password_label: Signal<string>;
  password_placeholder: Signal<string>;
  password_helper: Signal<string>;
}

/**
 * We use this same form in three different contexts:
 * - login: Login (with loginEmail and loginPassword)
 * - email: PasswordReset (with only loginEmail)
 * - password: PasswordSet (with only loginPassword)
 * This way, we can make sure that we always apply the same input and validation rules (consistency).
 */
@Component({
  selector: 'bk-login-form',
  standalone: true,
  imports: [
    EmailInput, PasswordInput, ErrorNote,
    IonGrid, IonRow, IonCol
  ],
  template: `
    <form novalidate>
      <ion-grid>
        @if (context(); as context) {
          @if (context === 'login' || context === 'email') {
            <ion-row>
              <ion-col size="12">
                <bk-email
                  [i18n]="loginEmailI18n()"
                  [(value)]="loginEmail"
                  [autofocus]="true"
                  [copyable]="false"
                  [clearInput]="false"
                  [readOnly]="false"
                  autocomplete="username email"
                />
                <bk-error-note [errors]="emailErrors()" />
              </ion-col>
            </ion-row>
          }
          @if (context === 'login' || context === 'password') {
            <ion-row>
              <ion-col size="12">
                <bk-password-input
                  [i18n]="loginPasswordI18n()"
                  [(value)]="loginPassword"
                />
                <bk-error-note [errors]="passwordErrors()" />
              </ion-col>
            </ion-row>
          }
        }
      </ion-grid>
    </form>
  `,
})
export class LoginForm {
  // inputs
  public readonly i18n = input.required<LoginFormI18n>();
  public readonly vm = model.required<AuthCredentials>(); // vm always contains the current values of the form
  public readonly context = input<'login' | 'email' | 'password'>('login');

  protected loginEmailI18n = computed(() => ({
    name: 'loginEmail',
    label: this.i18n().email_label(),
    placeholder: this.i18n().email_placeholder(),
    helper: this.i18n().email_helper()
  } as EmailInputI18n));
  protected loginPasswordI18n = computed(() => ({
    name: 'loginPassword',
    label: this.i18n().password_label(),
    placeholder: this.i18n().password_placeholder(),
    helper: this.i18n().password_helper()
  } as PasswordInputI18n));

  public validChange = output<boolean>();

  // fields
  protected loginEmail = linkedSignal(() => this.vm().loginEmail);
  protected loginPassword = linkedSignal(() => this.vm().loginPassword);

  // signal form — wraps vm with Vest validation; suite is chosen reactively based on context
  protected readonly loginForm = form(this.vm, (path) => {
    const suite = this.context() === 'email' ? emailValidations
                : this.context() === 'password' ? passwordValidations
                : loginValidations;
    validateVestTree(path, suite);
  });

  constructor() {
    effect(() => this.validChange.emit(this.loginForm().valid()));
  }

  // errors — computed from vest validation result
  private readonly validationResult = computed(() =>
    authCredentialsValidations(this.vm(), undefined, this.context()),
  );
  protected emailErrors = computed(() => this.validationResult().getErrors('loginEmail'));
  protected passwordErrors = computed(() => this.validationResult().getErrors('loginPassword'));
}
