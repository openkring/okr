import { Component, CUSTOM_ELEMENTS_SCHEMA, computed, effect, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonIcon, IonTextarea } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { ButtonCopy, ButtonCopyI18n } from '@okr/shared-ui';

import { CommentListI18n, isImageFile } from '@okr/comment-util';

/**
 * The comment input, built with the same anatomy as the chat composer
 * (`okr-matrix-message-input`): attachment strip, text row, action row. Microphone, video call
 * and mentions are deliberately left out — none of them mean anything on a comment.
 *
 * Dumb by design: the pending files live in the feature store (which owns picking and uploading)
 * and flow back down as an input, exactly as `pendingImages` does in the chat composer.
 */
@Component({
  selector: 'okr-comment-composer',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    SvgIconPipe, FormsModule,
    ButtonCopy,
    IonTextarea, IonButton, IonIcon
  ],
  styles: [`
    :host { display: block; }

    .composer {
      border: 1px solid var(--ion-border-color, #dedede);
      border-radius: 14px;
      background: var(--ion-background-color, #fff);
      overflow: hidden;
      transition: border-color 120ms ease, box-shadow 120ms ease;
    }
    .composer.focused {
      border-color: var(--ion-color-primary);
      box-shadow: 0 0 0 3px rgba(var(--ion-color-primary-rgb), 0.12);
    }

    /* ── Attachment strip ────────────────────────────────────── */
    .attachments {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 10px;
      background: var(--ion-color-light-shade);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
    }
    .thumb-wrapper { position: relative; flex-shrink: 0; }
    .thumb {
      width: 52px;
      height: 52px;
      object-fit: cover;
      border-radius: 6px;
      display: block;
    }
    .thumb-fallback {
      width: 52px;
      height: 52px;
      border-radius: 6px;
      background: var(--ion-background-color, #fff);
      border: 1px solid var(--ion-border-color, #dedede);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: var(--ion-color-medium);
      box-sizing: border-box;
    }
    .thumb-fallback ion-icon { font-size: 22px; }
    .thumb-ext {
      font-size: 0.5625rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      max-width: 46px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .thumb-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      --padding-start: 0;
      --padding-end: 0;
      width: 20px;
      height: 20px;
      margin: 0;
    }

    /* ── Text row ────────────────────────────────────────────── */
    .input-row {
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding: 8px 8px 2px 12px;
    }
    .input-field {
      flex: 1;
      min-width: 0;
      max-height: 160px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }
    .input-end-actions {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }
    ion-textarea {
      --padding-start: 0;
      --padding-end: 0;
      --padding-top: 0;
      --padding-bottom: 0;
      --background: transparent;
      font-size: 1rem;
      line-height: 1.4;
    }

    /* ── Action row ──────────────────────────────────────────── */
    .buttons-row {
      display: flex;
      align-items: center;
      padding: 2px 8px 8px;
      gap: 2px;
    }
    .spacer { flex: 1; }
    .hint {
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      padding-right: 10px;
    }
    .action-button {
      --padding-start: 6px;
      --padding-end: 6px;
      margin: 0;
      flex-shrink: 0;
      width: 44px;
      height: 44px;
    }
    .action-button ion-icon { font-size: 26px; }
    .send-button {
      --background: var(--ion-color-primary);
      --border-radius: 50%;
      width: 44px;
      height: 44px;
      margin: 0;
      flex-shrink: 0;
    }
    .send-button ion-icon { font-size: 22px; }

    .emoji-picker-wrapper { position: relative; }
    .emoji-picker-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      z-index: 1000;
    }
  `],
  template: `
    <div class="composer" [class.focused]="isFocused()">

      @if (pendingFiles().length > 0) {
        <div class="attachments">
          @for (file of pendingFiles(); track file; let i = $index) {
            <div class="thumb-wrapper">
              @if (isImage(file) && !failedThumbs().has(file)) {
                <img [src]="getObjectUrl(file)" [alt]="file.name" class="thumb" (error)="onThumbError(file)" />
              } @else {
                <div class="thumb thumb-fallback">
                  <ion-icon src="{{ 'document' | svgIcon }}" />
                  <span class="thumb-ext">{{ extensionOf(file) }}</span>
                </div>
              }
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                class="thumb-remove"
                [attr.aria-label]="i18n().remove_attachment()"
                (click)="attachmentRemoved.emit(i)">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
              </ion-button>
            </div>
          }
        </div>
      }

      <div class="input-row">
        <div class="input-field">
          <ion-textarea
            #textInput
            [(ngModel)]="text"
            placeholder="{{ i18n().input_placeholder() }}"
            [rows]="1"
            [autoGrow]="true"
            [maxlength]="1000"
            [disabled]="isBusy()"
            (ionFocus)="isFocused.set(true)"
            (ionBlur)="isFocused.set(false)"
            (keydown.enter)="onEnterKey($event)" />
        </div>
        @if (text().trim().length > 0) {
          <div class="input-end-actions">
            <ion-button fill="clear" size="small" [attr.aria-label]="i18n().clear()" (click)="clearText()">
              <ion-icon slot="icon-only" src="{{ 'cancel-circle' | svgIcon }}" />
            </ion-button>
            <okr-button-copy [value]="text()" [i18n]="buttonCopyI18n()" />
          </div>
        }
      </div>

      <div class="buttons-row">
        <ion-button fill="clear" class="action-button" color="secondary"
          [disabled]="isBusy()"
          [attr.aria-label]="i18n().attach()"
          (click)="attachRequested.emit()">
          <ion-icon slot="icon-only" src="{{ 'add-circle' | svgIcon }}" />
        </ion-button>

        <div class="emoji-picker-wrapper">
          <ion-button fill="clear" class="action-button" color="medium"
            [attr.aria-label]="i18n().emoji()"
            (click)="toggleEmojiPicker($event)">
            <ion-icon slot="icon-only" src="{{ 'smiley' | svgIcon }}" />
          </ion-button>
          @if (showEmojiPicker()) {
            <div class="emoji-picker-popover" (click)="$event.stopPropagation()">
              <emoji-picker (emoji-click)="onEmojiClick($event)"></emoji-picker>
            </div>
          }
        </div>

        <span class="spacer"></span>

        @if (isBusy()) {
          <span class="hint">{{ i18n().uploading() }}</span>
        }

        <ion-button class="send-button" [disabled]="!canSend()" [attr.aria-label]="i18n().send()" (click)="send()">
          <ion-icon slot="icon-only" src="{{ 'send' | svgIcon }}" />
        </ion-button>
      </div>
    </div>
  `
})
export class CommentComposer {
  private readonly hostElement = inject(ElementRef);

  // inputs
  public readonly i18n = input.required<CommentListI18n>();
  /** files the user picked but has not sent yet — owned by the feature store */
  public readonly pendingFiles = input<File[]>([]);
  /** true while the store uploads the attachments; blocks a second send */
  public readonly isBusy = input<boolean>(false);

  // outputs
  public readonly sent = output<string>();
  public readonly attachRequested = output<void>();
  public readonly attachmentRemoved = output<number>();

  protected readonly text = signal<string>('');
  protected readonly isFocused = signal<boolean>(false);
  protected readonly showEmojiPicker = signal<boolean>(false);
  protected readonly failedThumbs = signal<Set<File>>(new Set());
  private readonly textInput = viewChild<IonTextarea>('textInput');

  /** ButtonCopy resolves its own generic confirmation when none is supplied. */
  protected readonly buttonCopyI18n = computed<ButtonCopyI18n>(() => ({}));

  protected readonly canSend = computed(() =>
    (this.text().trim().length > 0 || this.pendingFiles().length > 0) && !this.isBusy());

  private readonly objectUrlCache = new Map<File, string>();

  constructor() {
    // Revoke object URLs of files that are no longer pending, and forget their failed-thumb state.
    effect(() => {
      const current = new Set(this.pendingFiles());
      for (const [file, url] of this.objectUrlCache) {
        if (!current.has(file)) {
          URL.revokeObjectURL(url);
          this.objectUrlCache.delete(file);
        }
      }
      this.failedThumbs.update(s => {
        const pruned = new Set([...s].filter(f => current.has(f)));
        return pruned.size === s.size ? s : pruned;
      });
    });
  }

  /* ---------------------- attachments -------------------------------*/
  protected isImage(file: File): boolean {
    return isImageFile(file);
  }

  protected extensionOf(file: File): string {
    const dot = file.name.lastIndexOf('.');
    return dot > 0 ? file.name.substring(dot + 1).slice(0, 4) : '';
  }

  protected onThumbError(file: File): void {
    this.failedThumbs.update(s => new Set(s).add(file));
  }

  protected getObjectUrl(file: File): string {
    if (!this.objectUrlCache.has(file)) {
      this.objectUrlCache.set(file, URL.createObjectURL(file));
    }
    return this.objectUrlCache.get(file) as string;
  }

  /* ---------------------- text -------------------------------*/
  /** Enter sends, Shift+Enter inserts a newline — same contract as the chat composer. */
  protected onEnterKey(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.shiftKey) return;
    keyboardEvent.preventDefault();
    this.send();
  }

  protected clearText(): void {
    this.text.set('');
  }

  protected send(): void {
    if (!this.canSend()) return;
    this.sent.emit(this.text().trim());
    this.text.set('');
    this.showEmojiPicker.set(false);
  }

  /* ---------------------- emoji -------------------------------*/
  /**
   * `emoji-picker-element` is ~150 KB and is only needed once somebody actually opens the picker.
   * Comments sit in a dozen edit modals, so it is imported on first use rather than pulled into
   * every one of those bundles up front.
   */
  protected async toggleEmojiPicker(event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.showEmojiPicker()) {
      await import('emoji-picker-element');
    }
    this.showEmojiPicker.update(v => !v);
    if (this.showEmojiPicker()) {
      const close = (ev: Event) => {
        if (this.hostElement.nativeElement.contains(ev.target as Node)) return;
        this.showEmojiPicker.set(false);
        document.removeEventListener('click', close);
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  }

  protected onEmojiClick(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const emoji: string = detail?.unicode ?? detail?.emoji?.unicode ?? '';
    if (!emoji) return;
    this.text.update(t => t + emoji);
    this.showEmojiPicker.set(false);
    void this.textInput()?.setFocus();
  }
}
