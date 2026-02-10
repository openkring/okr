import { Component, computed, linkedSignal, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { AuthCredentials, AUTH_CREDENTIAL_SHAPE } from '@bk2/shared-models';
import { EmailInputComponent, ErrorNoteComponent } from '@bk2/shared-ui';

import { pwdresetValidations } from '@bk2/auth-util';

@Component({
  selector: 'bk-pwdreset-form',
  standalone: true,
  imports: [vestForms, FormsModule, IonGrid, IonRow, IonCol, EmailInputComponent, ErrorNoteComponent],
  template: `
    <form scVestForm
      [formValue]="vm()"
      [suite]="suite"
      (formValueChange)="onFormChange($event)">
      <ion-grid>
        <ion-row>
          <ion-col size="12">
            <bk-email
              name="loginEmail"
              [(value)]="loginEmail"
              [autofocus]="true"
              [showHelper]="true"
              [copyable]="false"
              [clearInput]="false"
              [readOnly]="false"
              autocomplete="username email" />
            <bk-error-note [errors]="emailErrors()" />
          </ion-col>
        </ion-row>
      </ion-grid>
    </form>
  `,
})
export class PwdResetForm {
  // inputs
  public readonly vm = model.required<AuthCredentials>(); // vm always contains the current values of the form
  public readonly suite = pwdresetValidations;
  public validChange = output<boolean>();

  // fields
  protected loginEmail = linkedSignal(() => this.vm().loginEmail);

  // errors
  protected emailErrors = signal<string[]>([]);

  protected onFormChange(value: AuthCredentials): void {
    this.vm.set(value);
    const result = pwdresetValidations(this.vm());
    this.emailErrors.set(result.getErrors('loginEmail'));
    this.validChange.emit(result.isValid());
  }
}
