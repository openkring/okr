import { Component, linkedSignal, model, output, input, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AuthCredentials } from '@bk2/shared-models';
import { EmailInputComponent, ErrorNoteComponent, PasswordInputComponent } from '@bk2/shared-ui';

import { authCredentialsValidations, emailValidations, loginValidations, passwordValidations } from '@bk2/auth-util';

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
    EmailInputComponent, PasswordInputComponent, ErrorNoteComponent,
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
                  name="loginEmail"
                  [(value)]="loginEmail"
                  [autofocus]="true"
                  [showHelper]="true"
                  [helperText]="emailHelper()"
                  [copyable]="false"
                  [clearInput]="false"
                  [readOnly]="false"
                  autocomplete="username email" />
                <bk-error-note [errors]="emailErrors()" />
              </ion-col>
            </ion-row>
          }
          @if (context === 'login' || context === 'password') {
            <ion-row>
              <ion-col size="12">
                <bk-password-input
                  name="loginPassword"
                  [(value)]="loginPassword"
                  [showHelper]="true"
                  [helperText]="pwdHelper()"
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
  public readonly vm = model.required<AuthCredentials>(); // vm always contains the current values of the form
  public readonly context = input<'login' | 'email' | 'password'>('login');

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

  protected emailHelper = computed(() => this.context() === 'email' ? '@input.emailEmail.helper' : '@input.loginEmail.helper');
  protected pwdHelper = computed(() => this.context() === 'password' ? '@input.passwordPassword.helper' : '@input.loginPassword.helper');

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
