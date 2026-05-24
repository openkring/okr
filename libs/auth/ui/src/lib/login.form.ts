import { Component, computed, linkedSignal, model, output, input, signal, Signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AuthCredentials } from '@bk2/shared-models';
import { EmailInput, EmailInputI18n, ErrorNote, PasswordInput, PasswordInputI18n } from '@bk2/shared-ui';

import { authCredentialsValidations, emailValidations, loginValidations, passwordValidations } from '@bk2/auth-util';

export interface LoginFormI18n {
  email_label: Signal<string>;
  email_placeholder: Signal<string>;
  password_label: Signal<string>;
  password_placeholder: Signal<string>;
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
    vestForms,
    FormsModule,
    EmailInput, PasswordInput, ErrorNote,
    IonGrid, IonRow, IonCol
  ],
  template: `
    <form scVestForm
      [formValue]="vm()"
      [suite]="suite"
      (formValueChange)="onFormChange($event)">
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
  public readonly emailHelper = input.required<string>();
  public readonly pwdHelper = input.required<string>();

  protected loginEmailI18n = computed(() => ({
    name: 'loginEmail',
    label: this.i18n().email_label(),
    placeholder: this.i18n().email_placeholder(),
    helper: this.emailHelper()
  } as EmailInputI18n));
  protected loginPasswordI18n = computed(() => ({
    name: 'loginPassword',
    label: this.i18n().password_label(),
    placeholder: this.i18n().password_placeholder(),
    helper: this.pwdHelper()
  } as PasswordInputI18n));

  protected get suite() {
    switch (this.context()) {
      case 'email': return emailValidations;
      case 'password': return passwordValidations;
      default: return loginValidations;
    }
  }
  public validChange = output<boolean>();
  // fields
  protected loginEmail = linkedSignal(() => this.vm().loginEmail);
  protected loginPassword = linkedSignal(() => this.vm().loginPassword);

  // errors
  protected emailErrors = signal<string[]>([]);
  protected passwordErrors = signal<string[]>([]);

  protected onFormChange(value: AuthCredentials): void {
    this.vm.set(value);
    const result = authCredentialsValidations(this.vm(), undefined, this.context());
    this.emailErrors.set(result.getErrors('loginEmail'));
    this.passwordErrors.set(result.getErrors('loginPassword'));
    this.validChange.emit(result.isValid());
  }
}
