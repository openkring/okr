import { AsyncPipe } from '@angular/common';
import { Component, inject, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonTextarea } from '@ionic/angular/standalone';
import { vestFormsViewProviders } from 'ngx-vest-forms';

import { DESCRIPTION_LENGTH } from '@bk2/shared-constants';
import { TranslatePipe, bkTranslate } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { decrypt, encrypt } from '@bk2/shared-util-core';
import { ButtonCopyComponent } from './button-copy.component';

/**
 * Vest updates work by binding to ngModel.
 * This works here for normal text changes in the ion-textarea.
 * But for the actions on the buttons (clear, d/encrypt) we need to additionally signal the changed result.
 */
@Component({
  selector: 'bk-notes',
  standalone: true,
  imports: [
    TranslatePipe, AsyncPipe, SvgIconPipe,
    FormsModule,
    IonIcon, IonTextarea, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem,
    ButtonCopyComponent
  ],
  viewProviders: [vestFormsViewProviders],
  styles: [`ion-item.helper { --min-height: 0; }`],
  template: `
  <ion-card>
    <ion-card-header>
      <ion-card-title>Notizen</ion-card-title>
    </ion-card-header>
    <ion-card-content>
      <ion-item lines="none">
        <ion-textarea (ionInput)="onChange($event)"
            type="text"
            [name]="name()"
            [ngModel]="value()"
            labelPlacement="floating"
            label="{{'@input.' + name() + '.label' | translate | async }}"
            placeholder="{{'@input.' + name() + '.placeholder' | translate | async }}"
            inputMode="text"
            [counter]="!readOnly()"
            fill="outline"
            [autoGrow]="autoGrow()"
            [maxlength]="maxLength()"
            [rows]="rows()"
            [readonly]="readOnly()"
          />
      </ion-item>
      <ion-item lines="none">
        @if (clearable()) {
          <ion-icon src="{{'close_cancel' | svgIcon }}" (click)="clearValue()" />
        }
        @if (copyable()) {
          <bk-button-copy [value]="value()" />
        }
        @if (encryptable()) {
          <ion-icon src="{{'resource_key' | svgIcon }}" (click)="dencrypt()" />
        }
      </ion-item>
    </ion-card-content>
  </ion-card>
  `
})
export class NotesInputComponent {
  private readonly alertController = inject(AlertController);

  public value = model.required<string>(); // mandatory view model
  public name = input('notes'); // name of the input field
  public readOnly = input(false); // if true, the input field is read-only
  public maxLength = input(DESCRIPTION_LENGTH); // max number of characters allowed
  public rows = input(5); // number of rows

  protected clearable = input(true); // show a button to clear the notes
  protected copyable = input(true); // show a button to copy the notes
  protected encryptable = input(true); // show a button to encrypt or decrypt the notes
  public autoGrow = input(true); // if true, the input field grows with the content

  protected changed = output<string>(); // output event when the value changes

  private password = '';

  public clearValue(): void {
    this.value.set('');
  }

  public onChange(event: CustomEvent): void {
    this.value.set(event.detail.value);
    this.changed.emit(this.value());
  }

  public async dencrypt(): Promise<void> {
    if (!this.password || this.password.length === 0) {
      const _alert = await this.alertController.create({
        header: 'Passwort eingeben',
        message: 'Achtung: wenn du das Passwort vergisst, kann der Text nicht mehr entschlüsselt werden !',
        inputs: [{
          name: 'PasswordPrompt',
          type: 'text',
          placeholder: 'Passwort'
        }],
        buttons: [{
          text: bkTranslate('@general.operation.change.cancel'),
          role: 'cancel'
        }, {
          text: bkTranslate('@general.operation.change.ok'),
          handler: (_data) => {
            this.password = _data['PasswordPrompt'];
            this.dencryptWithPassword(this.password);
          }
        }]
      });
      await _alert.present();
    } else { // we already have a password
      this.dencryptWithPassword(this.password);
    }
  }

  private async dencryptWithPassword(password: string) {
    let _value = this.value();
    if (_value.startsWith('**')) { // text is encrypted -> decrypt it
      _value = await decrypt(_value.substring(2), password);
    }  else {  // text is plain -> encrypt it
      _value = '**' + await encrypt(_value, password);
    } 
    this.value.set(_value);
    this.changed.emit(this.value());
  }
}
