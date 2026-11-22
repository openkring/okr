import { Component, computed, CUSTOM_ELEMENTS_SCHEMA, inject, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { AlertController, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonNote, IonTextarea } from '@ionic/angular';

import { COMMENT_LENGTH, DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { coerceBoolean, decrypt, encrypt } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';

import { ButtonCopy, ButtonCopyI18n } from './button-copy';
import { ErrorNote } from './error-note';
import { PFX } from './scope';

export interface TextareaInputI18n {
  name: string;
  label: string;
  placeholder: string;
  helper?: string;
}

/**
 * field: reads like okr-text-input — floating label, no box; for a free text among other fields.
 * card:  its own ion-card with an outlined box; for long notes and descriptions at the end of a form.
 */
export type TextareaVariant = 'field' | 'card';

/** Prefix of an encrypted value (see dencrypt). */
const ENCRYPTED_PREFIX = '**';

/**
 * The one plain-text multiline field (spec 1.170 §5; it absorbed okr-notes-input).
 *
 * Both variants share one footer row: actions (clear, copy, encrypt) · the Vest error · the counter.
 * The variant also picks the defaults: a card is the old notes field (5 rows, DESCRIPTION_LENGTH,
 * clear/copy/encrypt on), a field is the plain free text (3 rows, COMMENT_LENGTH, no actions).
 * An explicitly bound input always wins over the variant's default.
 */
@Component({
  selector: 'okr-textarea-input',
  standalone: true,
  imports: [
    SvgIconPipe, NgTemplateOutlet,
    FormsModule,
    IonIcon, IonTextarea, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonNote,
    ButtonCopy, ErrorNote
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [`
    ion-item.helper { --min-height: 0; }
    ion-card-content { padding: 0; }
    @media (width <= 600px) { ion-card { margin: 5px;} }

    /* read-only text keeps the line breaks the user typed */
    .read-only { display: block; white-space: pre-line; }

    /* single footer row: actions | validation message | character counter */
    .footer {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      padding: 0 16px 6px 12px;
    }
    .footer .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .footer .actions ion-icon,
    .footer .actions ::ng-deep ion-icon {
      font-size: 20px;
      padding: 6px;                       /* 32px touch target */
      color: var(--ion-color-medium);
      cursor: pointer;
      transition: color 120ms ease-in-out;
    }
    .footer .actions ion-icon:hover,
    .footer .actions ion-icon:focus-visible,
    .footer .actions ::ng-deep ion-icon:hover,
    .footer .actions ::ng-deep ion-icon:focus-visible {
      color: var(--ion-color-primary);
    }
    .footer .message {
      flex: 1 1 auto;
      min-width: 0;                       /* lets the ellipsis kick in */
    }
    .footer .message ::ng-deep ion-note {
      display: block;
      font-size: 12px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .footer .counter {
      flex: 0 0 auto;
      font-size: 12px;
      color: var(--ion-color-medium);
      font-variant-numeric: tabular-nums; /* no width jitter while typing */
    }
    .footer .counter.warn { color: var(--ion-color-warning); }
    .footer .counter.over { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
  @if(isCard()) {
    <ion-card>
      @if(title()) {
        <ion-card-header>
          <ion-card-title>{{ title() }}</ion-card-title>
        </ion-card-header>
      }
      <ion-card-content>
        <ng-container [ngTemplateOutlet]="body" />
      </ion-card-content>
    </ion-card>
  } @else {
    <ng-container [ngTemplateOutlet]="body" />
  }

  <ng-template #body>
    @if(!isReadOnly()) {
      <ion-item lines="none" [button]="false">
        <ion-textarea
          [name]="i18n().name"
          [ngModel]="value()"
          (ngModelChange)="value.set($event)"
          placeholder="{{ i18n().placeholder }}"
          aria-label="{{ i18n().label }}"
          [label]="isCard() ? undefined : i18n().label"
          [labelPlacement]="isCard() ? undefined : 'floating'"
          inputMode="text"
          [fill]="isCard() ? 'outline' : undefined"
          [autoGrow]="isAutoGrow()"
          [maxlength]="effectiveMaxLength()"
          [rows]="effectiveRows()"
        />
      </ion-item>
      <!-- Ionic's built-in [counter] is off so the count shares the footer row with actions and errors. -->
      <div class="footer">
        <div class="actions">
          @if (isClearable() && value()) {
            <ion-icon src="{{'cancel' | svgIcon }}" (click)="clearValue()" tabindex="-1" />
          }
          @if (isCopyable()) {
            <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
          }
          @if (showEncrypt()) {
            <ion-icon src="{{ 'key' | svgIcon }}" (click)="dencrypt()" tabindex="-1" />
          }
        </div>
        <div class="message">
          <okr-error-note [errors]="errors()" [inline]="true" />
        </div>
        <div class="counter" [class.warn]="isNearLimit()" [class.over]="isAtLimit()">
          {{ charCount() }}/{{ effectiveMaxLength() }}
        </div>
      </div>
      @if(shouldShowHelper()) {
        <ion-item lines="none" class="helper" [button]="false">
          <ion-note>{{ i18n().helper }}</ion-note>
        </ion-item>
      }
    } @else {
      @if(isCard()) {
        <ion-item lines="none" [button]="false">
          <ion-note class="read-only">{{ value() }}</ion-note>
        </ion-item>
      } @else {
        <ion-item lines="none" [button]="false">
          <ion-textarea
            [name]="i18n().name"
            [value]="value()"
            label="{{ i18n().label }}"
            labelPlacement="floating"
            [autoGrow]="true"
            [rows]="effectiveRows()"
            [readonly]="true"
          />
        </ion-item>
      }
    }
  </ng-template>
  `
})
export class TextareaInput {
  private readonly alertController = inject(AlertController);
  private readonly i18nService = inject(I18nService);
  private readonly helperVisibility = inject(HelperVisibility);

  // inputs
  public value = model.required<string>(); // mandatory view model, two-way bound
  public i18n = input.required<TextareaInputI18n>();
  public readOnly = input.required<boolean>();
  public variant = input<TextareaVariant>('field');
  public title = input(''); // card title, card variant only
  /** Vest errors of the bound field; rendered in the footer row. */
  public errors = input<string[]>([]);
  public showHelper = input(false);
  public autoGrow = input(true);
  // undefined = the variant's default (see class comment)
  public maxLength = input<number | undefined>(undefined);
  public rows = input<number | undefined>(undefined);
  public clearable = input<boolean | undefined>(undefined);
  public copyable = input<boolean | undefined>(undefined);
  public encryptable = input<boolean | undefined>(undefined);

  // coerced inputs and variant defaults
  protected isCard = computed(() => this.variant() === 'card');
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected isAutoGrow = computed(() => coerceBoolean(this.autoGrow()));
  protected isClearable = computed(() => coerceBoolean(this.clearable() ?? this.isCard()));
  protected isCopyable = computed(() => coerceBoolean(this.copyable() ?? this.isCard()));
  protected isEncryptable = computed(() => coerceBoolean(this.encryptable() ?? this.isCard()));
  protected effectiveMaxLength = computed(() => this.maxLength() ?? (this.isCard() ? DESCRIPTION_LENGTH : COMMENT_LENGTH));
  protected effectiveRows = computed(() => this.rows() ?? (this.isCard() ? 5 : 3));
  protected shouldShowHelper = computed(() =>
    this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()) && !!this.i18n().helper);
  /** An encrypted value can always be decrypted, even where encryption was not offered. */
  protected showEncrypt = computed(() => this.isEncryptable() || (this.value() ?? '').startsWith(ENCRYPTED_PREFIX));

  // character counter
  protected charCount = computed(() => this.value()?.length ?? 0);
  protected isNearLimit = computed(() => this.charCount() >= this.effectiveMaxLength() * 0.9);
  protected isAtLimit = computed(() => this.charCount() >= this.effectiveMaxLength());

  // i18n for the dencrypt alert and the copy toast
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

  /** set() on the model already emits `valueChange` — no manual emit, that would fire twice. */
  protected clearValue(): void {
    this.value.set('');
  }

  protected async dencrypt(): Promise<void> {
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

  private async dencryptWithPassword(password: string): Promise<void> {
    let value = this.value();
    if (value.startsWith(ENCRYPTED_PREFIX)) { // text is encrypted -> decrypt it
      value = await decrypt(value.substring(ENCRYPTED_PREFIX.length), password);
    } else {  // text is plain -> encrypt it
      value = ENCRYPTED_PREFIX + await encrypt(value, password);
    }
    this.value.set(value);
  }
}
