import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonNote, IonTextarea } from '@ionic/angular/standalone';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, decrypt, encrypt } from '@okr/shared-util-core';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { ErrorNote } from './error-note';
import { PFX } from './scope';

export interface NotesInputI18n {
  name: string;
  label: string;
  placeholder: string;
}

/**
 * Vest updates work by binding to ngModel.
 * This works here for normal text changes in the ion-textarea.
 * But for the actions on the buttons (clear, d/encrypt) we need to additionally signal the changed result.
 */
@Component({
  selector: 'okr-notes-input',
  standalone: true,
  imports: [
    SvgIconPipe,
    FormsModule,
    IonIcon, IonTextarea, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonNote,
    ButtonCopy, ErrorNote
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-card-content { padding: 0; }
    @media (width <= 600px) { ion-card { margin: 5px;} }

    /* single footer row: actions | validation message | character counter */
    .notes-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      padding: 0 16px 6px 12px;
    }
    .notes-footer .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .notes-footer .actions ion-icon,
    .notes-footer .actions ::ng-deep ion-icon {
      font-size: 20px;
      padding: 6px;                       /* 32px touch target */
      color: var(--ion-color-medium);
      cursor: pointer;
      transition: color 120ms ease-in-out;
    }
    .notes-footer .actions ion-icon:hover,
    .notes-footer .actions ion-icon:focus-visible,
    .notes-footer .actions ::ng-deep ion-icon:hover,
    .notes-footer .actions ::ng-deep ion-icon:focus-visible {
      color: var(--ion-color-primary);
    }
    .notes-footer .message {
      flex: 1 1 auto;
      min-width: 0;                       /* lets the ellipsis kick in */
    }
    .notes-footer .message ::ng-deep ion-note {
      display: block;
      font-size: 12px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .notes-footer .counter {
      flex: 0 0 auto;
      font-size: 12px;
      color: var(--ion-color-medium);
      font-variant-numeric: tabular-nums; /* no width jitter while typing */
    }
    .notes-footer .counter.warn { color: var(--ion-color-warning); }
    .notes-footer .counter.over { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
  <ion-card>
    @if(doShowTitle()) {
      <ion-card-header>
        <ion-card-title>{{ title() }}</ion-card-title>
      </ion-card-header>
    }
    <ion-card-content>

      @if(!isReadOnly()) {
        <ion-item lines="none">
          <ion-textarea
            type="text"
            [name]="i18n().name"
            [ngModel]="value()"
            (ngModelChange)="value.set($event)"
            placeholder="{{ i18n().placeholder }}"
            aria-label="{{ i18n().label }}"
            inputMode="text"
            fill="outline"
            [autoGrow]="isAutoGrow()"
            [maxlength]="maxLength()"
            [rows]="rows()"
            [readonly]="isReadOnly()"
          />
        </ion-item>
        <!-- one footer row inside the card: actions, validation message and counter share a line.
             Ionic's built-in [counter] is off so the count can live here instead of its own row. -->
        <div class="notes-footer">
          <div class="actions">
            @if (isClearable()) {
              <ion-icon src="{{'cancel' | svgIcon }}" (click)="clearValue()" tabindex="-1" />
            }
            @if (isCopyable()) {
              <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
            }
            @if (isEncryptable()) {
              <ion-icon src="{{ 'key' | svgIcon }}" (click)="dencrypt()" tabindex="-1" />
            }
          </div>
          <div class="message">
            <okr-error-note [errors]="errors()" [inline]="true" />
          </div>
          <div class="counter" [class.warn]="isNearLimit()" [class.over]="isAtLimit()">
            {{ charCount() }}/{{ maxLength() }}
          </div>
        </div>
      } @else {
        <ion-item lines="none">
          <ion-note>{{value()}}</ion-note>
       </ion-item>
      }
    </ion-card-content>
  </ion-card>
  `
})
export class NotesInput {
  private readonly alertController = inject(AlertController);
  private readonly i18nService = inject(I18nService);

  // inputs
  public value = model.required<string>();
  public i18n = input.required<NotesInputI18n>();
  public readOnly = input.required<boolean>();
  public maxLength = input(DESCRIPTION_LENGTH);
  public rows = input(5);
  public showTitle = input<boolean>(false);
  public title = input('');
  protected clearable = input(true);
  protected copyable = input(true);
  protected encryptable = input(true);
  public autoGrow = input(true);
  /** Vest errors of the bound field; rendered below the textarea, inside the card. */
  public errors = input<string[]>([]);

  // coerced boolean inputs
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected doShowTitle = computed(() => coerceBoolean(this.showTitle()));
  protected isClearable = computed(() => coerceBoolean(this.clearable()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected isEncryptable = computed(() => coerceBoolean(this.encryptable()));
  protected isAutoGrow = computed(() => coerceBoolean(this.autoGrow()));

  // character counter (replaces ion-textarea's built-in [counter] so it can share the footer row)
  protected charCount = computed(() => this.value()?.length ?? 0);
  protected isNearLimit = computed(() => this.charCount() >= this.maxLength() * 0.9);
  protected isAtLimit = computed(() => this.charCount() >= this.maxLength());

  // i18n for dencrypt alert
  private readonly alertI18n = this.i18nService.translateAll({
    pwd_header:      PFX + 'notes.pwd.header',
    pwd_message:     PFX + 'notes.pwd.message',
    pwd_placeholder: PFX + 'notes.pwd.placeholder',
    cancel:          '@cancel',
    ok:              '@ok',
    copy_conf:       '@copy.conf',
  });
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.alertI18n.copy_conf() } as ButtonCopyI18n));

  private password = '';

  public clearValue(): void {
    this.value.set('');
  }

  public async dencrypt(): Promise<void> {
    if (!this.password || this.password.length === 0) {
      const alert = await this.alertController.create({
        header: this.alertI18n.pwd_header(),
        message: this.alertI18n.pwd_message(),
        inputs: [{
          name: 'PasswordPrompt',
          type: 'text',
          placeholder: this.alertI18n.pwd_placeholder()
        }],
        buttons: [{
          text: this.alertI18n.cancel(),
          role: 'cancel'
        }, {
          text: this.alertI18n.ok(),
          handler: (data) => {
            this.password = data['PasswordPrompt'];
            this.dencryptWithPassword(this.password);
          }
        }]
      });
      await alert.present();
    } else { // we already have a password
      this.dencryptWithPassword(this.password);
    }
  }

  private async dencryptWithPassword(password: string) {
    let value = this.value();
    if (value.startsWith('**')) { // text is encrypted -> decrypt it
      value = await decrypt(value.substring(2), password);
    }  else {  // text is plain -> encrypt it
      value = '**' + await encrypt(value, password);
    } 
    this.value.set(value);
  }
}
