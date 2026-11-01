import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import {
  IonButton, IonButtons, IonCard, IonCardContent, IonContent, IonHeader, IonIcon, IonMenuButton, IonNote, IonSelect,
  IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar, ToastController, ViewWillLeave,
} from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { copyToClipboard, showToast } from '@okr/shared-util-angular';
import { AUTO_DETECT, TRANSLATOR_I18N_KEYS, TRANSLATOR_MAX_TEXT, TranslatorLanguage } from '@okr/instruments-translator-util';

import { Dictation, ReadAloud } from './translator-speech';
import { TranslatorStore } from './translator.store';

/** Name of a code in the UI language, for a language list that has not arrived (yet). */
function displayName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The Übersetzer (idea 2.126), text view: language pair with swap, a growing text field with dictation,
 * and the translation below with copy and read-aloud. Phase 1 — the live camera view and the flashlight
 * toggle follow with on-device text recognition.
 */
@Component({
  selector: 'okr-translator-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [TranslatorStore],
  imports: [
    SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonContent, IonButton, IonIcon, IonCard, IonCardContent,
    IonSelect, IonSelectOption, IonTextarea, IonNote, IonSpinner,
  ],
  styles: [`
    .layout { max-width: 720px; margin: 0 auto; padding: 0.5rem 0; }
    .pair { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 0.25rem; align-items: center; padding: 0 1rem; }
    .input-row { display: flex; align-items: flex-start; gap: 0.25rem; }
    .input-row ion-textarea { flex: 1 1 auto; font-size: 1.25rem; }
    .actions { display: flex; justify-content: flex-end; align-items: center; gap: 0.25rem; min-height: 2.5rem; }
    .actions .grow { flex: 1 1 auto; }
    .translation { font-size: 1.25rem; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--ion-text-color); min-height: 2rem; }
    .listening { --background: var(--ion-color-danger); --color: var(--ion-color-danger-contrast); --border-radius: 50%; }
    .hint { display: block; padding: 0 1rem; }
    .error { color: var(--ion-color-danger); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ store.i18n.title() }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="layout">
        <div class="pair">
          <ion-select [aria-label]="store.i18n.source()" interface="popover" [value]="store.source()"
            (ionChange)="store.setSource($event.detail.value)">
            <ion-select-option [value]="auto">{{ store.i18n.auto() }}</ion-select-option>
            @for (l of options(); track l.code) {
              <ion-select-option [value]="l.code">{{ l.name }}</ion-select-option>
            }
          </ion-select>
          <ion-button fill="clear" [title]="store.i18n.swap()" [disabled]="!canSwap()" (click)="swap()">
            <ion-icon slot="icon-only" src="{{ 'swap-horizontal' | svgIcon }}" />
          </ion-button>
          <ion-select [aria-label]="store.i18n.target()" interface="popover" [value]="store.target()"
            (ionChange)="store.setTarget($event.detail.value)">
            @for (l of options(); track l.code) {
              <ion-select-option [value]="l.code">{{ l.name }}</ion-select-option>
            }
          </ion-select>
        </div>
        @if (store.languagesFailed()) {
          <ion-note class="hint error">{{ store.i18n.error_languages() }}</ion-note>
        }

        <ion-card>
          <ion-card-content>
            <div class="input-row">
              <ion-textarea [autoGrow]="true" [rows]="3" [autofocus]="true" [placeholder]="store.i18n.input()"
                [aria-label]="store.i18n.input()" [value]="store.text()" [maxlength]="maxText"
                (ionInput)="store.setText($event.detail.value ?? '')" />
              @if (store.text()) {
                <ion-button fill="clear" [title]="store.i18n.clear()" (click)="clear()">
                  <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                </ion-button>
              }
            </div>
            <div class="actions">
              <ion-note class="grow">
                @if (store.tooLong()) {
                  <span class="error">{{ store.i18n.tooLong() }}</span>
                } @else if (store.detectedName()) {
                  {{ store.i18n.detected() }}: {{ store.detectedName() }}
                }
              </ion-note>
              @if (dictation.supported) {
                <ion-button fill="clear" [class.listening]="listening()" [attr.aria-pressed]="listening()"
                  [title]="listening() ? store.i18n.mic_stop() : store.i18n.mic_start()" (click)="toggleDictation()">
                  <ion-icon slot="icon-only" src="{{ 'mic' | svgIcon }}" />
                </ion-button>
              }
            </div>
          </ion-card-content>
        </ion-card>

        @if (store.status() !== 'idle') {
          <ion-card>
            <ion-card-content>
              @switch (store.status()) {
                @case ('loading') {
                  @if (store.translatedText()) {
                    <div class="translation">{{ store.translatedText() }}</div>
                  } @else {
                    <ion-spinner name="dots" />
                  }
                }
                @case ('done') {
                  <div class="translation" [attr.lang]="store.target()">{{ store.translatedText() }}</div>
                }
                @default {
                  <p class="error">{{ store.status() === 'busy' ? store.i18n.error_busy() : store.i18n.error_failed() }}</p>
                }
              }
              <div class="actions">
                @if (store.status() === 'done' && store.attribution()) {
                  <ion-note class="grow">{{ store.i18n.attribution() }} {{ store.attribution() }}</ion-note>
                }
                @if (store.status() === 'error' || store.status() === 'busy') {
                  <ion-button fill="clear" (click)="store.retry()">{{ store.i18n.retry() }}</ion-button>
                } @else {
                  <ion-button fill="clear" [title]="store.i18n.copy()" [disabled]="store.status() !== 'done'" (click)="copy()">
                    <ion-icon slot="icon-only" src="{{ 'copy' | svgIcon }}" />
                  </ion-button>
                  @if (readAloud.supported) {
                    <ion-button fill="clear" [attr.aria-pressed]="speaking()" [disabled]="store.status() !== 'done'"
                      [title]="speaking() ? store.i18n.speak_stop() : store.i18n.speak()" (click)="toggleSpeak()">
                      <ion-icon slot="icon-only" src="{{ (speaking() ? 'stop' : 'play') | svgIcon }}" />
                    </ion-button>
                  }
                }
              </div>
            </ion-card-content>
          </ion-card>
        }

        <ion-note class="hint">{{ store.i18n.privacy() }}</ion-note>
      </div>
    </ion-content>
  `,
})
export class TranslatorPage implements ViewWillLeave {
  protected readonly store = inject(TranslatorStore);
  private readonly toastController = inject(ToastController);

  protected readonly auto = AUTO_DETECT;
  protected readonly maxText = TRANSLATOR_MAX_TEXT;
  protected readonly dictation = new Dictation();
  protected readonly readAloud = new ReadAloud();
  protected readonly listening = signal(false);
  protected readonly speaking = signal(false);

  private readonly locale = this.store.i18nService.getActiveLang();

  /** The provider's list once loaded; until then (or when it failed) just the chosen codes. */
  protected readonly options = computed<TranslatorLanguage[]>(() => {
    const list = this.store.languages();
    if (list.length > 0) return list;
    const codes = [this.store.source(), this.store.target()].filter(c => c !== AUTO_DETECT);
    return [...new Set(codes)].map(code => ({ code, name: displayName(code, this.locale) }));
  });
  protected readonly canSwap = computed(() =>
    this.store.source() !== AUTO_DETECT || (!!this.store.detectedSource() && this.store.detectedSource() !== this.store.target()));

  /** Text in the field when dictation started; the transcript is appended to it. */
  private dictationBase = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopSpeech());
  }

  public ionViewWillLeave(): void {
    this.stopSpeech();
  }

  protected clear(): void {
    this.stopSpeech();
    this.store.setText('');
  }

  protected swap(): void {
    this.stopSpeech();
    this.store.swap();
  }

  protected toggleDictation(): void {
    if (this.listening()) {
      this.dictation.stop();
      return;
    }
    this.readAloud.stop();
    this.speaking.set(false);
    const base = this.store.text().trim();
    this.dictationBase = base ? base + ' ' : '';
    const lang = this.store.source() === AUTO_DETECT ? this.locale : this.store.source();
    this.listening.set(true);
    this.dictation.start(lang,
      text => this.store.setText(this.dictationBase + text),
      () => this.listening.set(false));
  }

  protected toggleSpeak(): void {
    if (this.speaking()) {
      this.readAloud.stop();
      this.speaking.set(false);
      return;
    }
    this.speaking.set(true);
    this.readAloud.speak(this.store.translatedText(), this.store.target(), () => this.speaking.set(false));
  }

  /** Straight from the click: the text is already shown, so no await precedes the clipboard write. */
  protected async copy(): Promise<void> {
    try {
      await copyToClipboard(this.store.translatedText());
      await showToast(this.toastController, TRANSLATOR_I18N_KEYS.copied);
    } catch {
      await showToast(this.toastController, TRANSLATOR_I18N_KEYS.copyFailed);
    }
  }

  private stopSpeech(): void {
    this.dictation.stop();
    this.readAloud.stop();
    this.listening.set(false);
    this.speaking.set(false);
  }
}
