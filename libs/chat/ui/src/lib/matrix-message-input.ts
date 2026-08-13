import { Component, DestroyRef, afterNextRender, computed, effect, inject, input, output, signal, viewChild, ElementRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {  IonTextarea, IonButton, IonIcon, ActionSheetController, ActionSheetOptions, ModalController } from '@ionic/angular/standalone';

import { SvgIconPipe } from '@okr/shared-pipes';
import { createActionSheetButton, createActionSheetOptions, QuickEntryService } from '@okr/shared-util-angular';
import { AppStore, ModelSelectService } from '@okr/shared-feature';
import { ButtonCopy } from '@okr/shared-ui';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { PersonModel } from '@okr/shared-models';

import { isSupportedImageFile, MatrixChatI18n, MessageDraft, MentionRef, findMentionQuery, filterActiveMentions } from '@okr/chat-util';
import { MentionAutocomplete, MentionPick, MENTION_ROOM, mentionListboxId, mentionOptionId } from './mention-autocomplete';
import 'emoji-picker-element';

@Component({
  selector: 'okr-matrix-message-input',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [
    SvgIconPipe,
    FormsModule,
    ButtonCopy,
    IonTextarea,
    IonButton,
    IonIcon,
    MentionAutocomplete
],
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      background: var(--ion-background-color);
      border-top: 1px solid var(--ion-border-color, #dedede);
    }

    /* ── Reply preview strip (conditional) ───────────────────── */
    .reply-preview {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--ion-color-light-shade);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
      font-size: 0.875rem;
    }
    .reply-content { flex: 1; min-width: 0; }
    .reply-label {
      font-weight: 600;
      color: var(--ion-color-primary);
      font-size: 0.75rem;
    }
    .reply-text {
      color: var(--ion-color-medium);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Row 1: text input ───────────────────────────────────── */
    .input-row {
      /* Positioning context for the mention overlay. Deliberately NOT on .input-field:
         that element is the scroll container (max-height + overflow-y:auto) and would
         clip an overlay anchored at bottom:100%. Same pattern as .emoji-picker-wrapper. */
      position: relative;
      display: flex;
      align-items: flex-end;
      gap: 4px;
      padding: 8px 12px 2px;
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

    /* ── Row 2: action buttons ───────────────────────────────── */
    .buttons-row {
      display: flex;
      align-items: center;
      /* 12px side padding keeps the outer icons off the screen edge on phones */
      padding: 4px 12px 13px;
      gap: 4px;
      flex-shrink: 0;
    }
    .spacer { flex: 1; }
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

    /* ── Typing indicator ────────────────────────────────────── */
    .typing-indicator {
      padding: 0 12px 4px;
      font-size: 0.75rem;
      color: var(--ion-color-medium);
      font-style: italic;
    }

    .file-input { display: none; }

    .pending-images-strip {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 8px 12px;
      background: var(--ion-color-light-shade);
      border-bottom: 1px solid var(--ion-border-color, #dedede);
    }

    .pending-thumb-wrapper {
      position: relative;
      flex-shrink: 0;
    }

    .pending-thumb {
      width: 52px;
      height: 52px;
      object-fit: cover;
      border-radius: 6px;
      display: block;
    }

    .pending-thumb-fallback {
      width: 52px;
      height: 52px;
      border-radius: 6px;
      background: var(--ion-color-light);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ion-color-medium);
      font-size: 24px;
    }

    .pending-thumb-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      --padding-start: 0;
      --padding-end: 0;
      width: 20px;
      height: 20px;
      margin: 0;
    }

    .emoji-picker-wrapper { position: relative; }
    .emoji-picker-popover {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 0;
      z-index: 1000;
    }

    /* ── Recording bar ───────────────────────────────────────── */
    .recording-container {
      display: flex;
      align-items: center;
      padding: 8px;
      gap: 8px;
    }
    .recording-indicator {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--ion-color-danger-tint);
      border-radius: 20px;
      padding: 8px 16px;
    }
    .recording-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--ion-color-danger);
      animation: blink 1s step-start infinite;
      flex-shrink: 0;
    }
    @keyframes blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0; }
    }
    .recording-duration {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--ion-color-danger);
      min-width: 40px;
    }
    .recording-label {
      font-size: 0.875rem;
      color: var(--ion-color-medium);
    }
  `],
  template: `
    @if (!isRecording()) {
      @if (pendingImages().length > 0) {
        <div class="pending-images-strip">
          @for (file of pendingImages(); track file; let i = $index) {
            <div class="pending-thumb-wrapper">
              @if (_failedThumbs().has(file)) {
                <div class="pending-thumb pending-thumb-fallback">
                  <ion-icon src="{{'image' | svgIcon}}"></ion-icon>
                </div>
              } @else {
                <img [src]="getObjectUrl(file)" [alt]="file.name" class="pending-thumb"
                     (error)="onThumbError(file)" />
              }
              <ion-button
                fill="clear"
                size="small"
                color="danger"
                class="pending-thumb-remove"
                [attr.aria-label]="i18n().remove_image()"
                (click)="removeImage.emit(i)"
              >
                <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
              </ion-button>
            </div>
          }
        </div>
      }

      <!-- Reply preview strip — only shown while composing a reply -->
      @if (replyToMessage()) {
        <div class="reply-preview">
          <div class="reply-content">
            <div class="reply-label">{{ i18n().msg_reply_to()}} {{ replyToMessage()?.senderName }}</div>
            <div class="reply-text">{{ replyToMessage()?.body }}</div>
          </div>
          <ion-button fill="clear" size="small" [attr.aria-label]="i18n().cancel()" (click)="cancelReply()">
            <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
          </ion-button>
        </div>
      }

      <!-- Row 1: text input (grows), with cancel + copy pinned to the end when there is text -->
      <div class="input-row">
        @if (isMentionOpen()) {
          <okr-mention-autocomplete
            [query]="mentionQuery()!.query"
            [candidates]="mentionCandidates()"
            [activeIndex]="mentionActiveIndex()"
            [instanceId]="instanceId"
            [i18n]="i18n()"
            [currentUserName]="currentUserName()"
            (picked)="onMentionPicked($event)"
          />
        }
        <div class="input-field">
          <ion-textarea
            #textInput
            [(ngModel)]="messageText"
            placeholder="{{ i18n().thread_reply_placeholder() }}"
            [rows]="1"
            [autoGrow]="true"
            (ionInput)="onInput()"
            (keydown.enter)="onEnterKey($event)"
            (keydown.tab)="onMentionNavigation($event, 'pick')"
            (keydown.escape)="onMentionNavigation($event, 'close')"
            (keydown.arrowUp)="onMentionNavigation($event, 'up')"
            (keydown.arrowDown)="onMentionNavigation($event, 'down')"
          ></ion-textarea>
        </div>
        @if (messageText().trim().length > 0) {
          <div class="input-end-actions">
            <ion-button fill="clear" size="small" [attr.aria-label]="i18n().clear_input()" (click)="clearValue()">
              <ion-icon slot="icon-only" src="{{'cancel-circle' | svgIcon }}" />
            </ion-button>
            <okr-button-copy [value]="messageText()" [i18n]="buttonCopyI18n()" />
          </div>
        }
      </div>

      @if (typingUsers().length > 0) {
        <div class="typing-indicator" aria-live="polite">{{ getTypingText() }}</div>
      }

      <!-- Row 2: action buttons, always at the bottom -->
      <div class="buttons-row">
        <ion-button fill="clear" class="action-button" [attr.aria-label]="i18n().add_attachment()" (click)="showActions()">
          <ion-icon slot="icon-only" src="{{'add-circle' | svgIcon}}"></ion-icon>
        </ion-button>

        <div class="emoji-picker-wrapper">
          <ion-button fill="clear" class="action-button" [attr.aria-label]="i18n().emoji_picker()" (click)="toggleEmojiPicker($event)">
            <ion-icon slot="icon-only" src="{{'smiley' | svgIcon}}"></ion-icon>
          </ion-button>
          @if (showEmojiPicker()) {
            <div class="emoji-picker-popover" (click)="$event.stopPropagation()">
              <emoji-picker (emoji-click)="onEmojiClick($event)"></emoji-picker>
            </div>
          }
        </div>

        <span class="spacer"></span>

        <ion-button fill="clear" class="action-button" (click)="startRecording()"
          title="{{ i18n().record_audio() }}"
          [attr.aria-label]="i18n().record_audio()">
          <ion-icon slot="icon-only" src="{{'mic' | svgIcon}}"></ion-icon>
        </ion-button>

        <ion-button fill="clear" class="action-button" (click)="videoCallStarted.emit()"
          title="{{ i18n().video_call() }}"
          [attr.aria-label]="i18n().video_call()">
          <ion-icon slot="icon-only" src="{{'video' | svgIcon}}"></ion-icon>
        </ion-button>

        <ion-button class="send-button" [disabled]="!canSend()" [attr.aria-label]="i18n().send()" (click)="sendMessage()">
          <ion-icon slot="icon-only" src="{{'send' | svgIcon}}"></ion-icon>
        </ion-button>
      </div>
    }

    <!-- Recording bar — replaces both rows while recording -->
    @if (isRecording()) {
      <div class="recording-container">
        <ion-button fill="clear" class="action-button" color="medium" [attr.aria-label]="i18n().cancel()" (click)="cancelRecording()">
          <ion-icon slot="icon-only" src="{{'cancel' | svgIcon}}"></ion-icon>
        </ion-button>
        <div class="recording-indicator">
          <span class="recording-dot"></span>
          <span class="recording-duration">{{ formatRecordingDuration(recordingSeconds()) }}</span>
          <span class="recording-label">{{ i18n().recording() }}</span>
        </div>
        <ion-button class="send-button" color="danger" [attr.aria-label]="i18n().send()" (click)="stopRecording()">
          <ion-icon slot="icon-only" src="{{'send' | svgIcon}}"></ion-icon>
        </ion-button>
      </div>
    }

    <input #fileInput type="file" class="file-input" (change)="onFileSelected($event)" [accept]="fileAccept()" />
  `
})
export class MatrixMessageInput {
  private actionSheetController = inject(ActionSheetController);
  private appStore = inject(AppStore);
  private modalController = inject(ModalController);
  private quickEntryService = inject(QuickEntryService);
  private modelSelectService = inject(ModelSelectService);
  private isSettingQuickEntryValue = false;
  private mentions = signal<MentionRef[]>([]);

  protected mentionQuery = signal<{ start: number; query: string } | null>(null);
  /** The token Escape dismissed, so a caret-move recompute doesn't immediately reopen it. */
  private mentionDismissed: { start: number; query: string } | null = null;
  protected mentionActiveIndex = signal(0);
  protected mentionOverlay = viewChild(MentionAutocomplete);
  protected isMentionOpen = computed(() => this.mentionQuery() !== null);

  /**
   * Per-instance suffix for the listbox/option DOM ids. `matrix-chat` renders two composers
   * (main + thread panel); global ids would be duplicated across both textareas.
   * A monotonic counter (never Math.random) keeps the ids stable and reproducible.
   */
  private static instanceCounter = 0;
  protected readonly instanceId = ++MatrixMessageInput.instanceCounter;

  /** id of the overlay listbox — must match MentionAutocomplete's host id (aria-controls). */
  private readonly listboxId = mentionListboxId(this.instanceId);

  /** The native <textarea> inside ion-textarea's shadow DOM, once it has rendered. */
  private nativeTextarea = signal<HTMLTextAreaElement | null>(null);

  /**
   * Read-side clamp for the highlighted index — must agree with what the overlay highlights,
   * so it simply delegates to the child's own clamp (`effectiveIndex`). Deliberately a METHOD,
   * not a template-bound computed: it reads a signal owned by the child view, and a parent
   * BINDING that depends on child state dirties the parent view after it was checked (NG0100).
   * It is only called from event handlers and from an `effect()`, never during CD.
   */
  private clampedMentionIndex(): number {
    return this.mentionOverlay()?.effectiveIndex() ?? 0;
  }

  // inputs
  public i18n = input.required<MatrixChatI18n>();
  public disabled = input<boolean>(false);
  public roomId = input<string | undefined>(undefined);
  public typingUsers = input<string[]>([]);
  public replyToMessage = input<any>();
  public fileAccept = input<string>('*/*');
  public pendingImages = input<File[]>([]);
  public mentionCandidates = input<PersonModel[]>([]);
  /**
   * True when the current room is a direct chat. The mention overlay (persons AND @room)
   * must never open there — @ stays plain text in a DM. Gated inside updateMentionQuery()
   * rather than at each call site, since that method is invoked from several places
   * (ionInput, and the keyup/mouseup/touchend caret listeners).
   */
  public isDirectRoom = input<boolean>(false);

  // outputs
  messageSent = output<MessageDraft>();
  fileSent = output<File>();
  locationSent = output<void>();
  surveyRequested = output<void>();
  videoCallStarted = output<void>();
  typing = output<boolean>();
  cancelReplyClicked = output<void>();
  fileQueued = output<File>();
  removeImage = output<number>();
  filesSent = output<File[]>();

  // signals
  protected messageText = signal<string>('');
  showEmojiPicker = signal<boolean>(false);
  private typingTimeout: any;

  // derived
  private draftKey = computed(() => this.roomId() ? `chat-draft:${this.roomId()}` : undefined);
  protected buttonCopyI18n = computed(() => { return { copy_conf: this.i18n().copy_conf() } });
  /**
   * Current user's display name, for the `@me` mention entry.
   * Read from the `AppStore` injection this component already has (rather than threading a
   * new input down from the feature layer) — `currentPerson()` is the same source every other
   * consumer (profile edit, address forms, tenant switcher, …) uses for the logged-in person's
   * name.
   */
  protected currentUserName = computed(() => {
    const person = this.appStore.currentPerson();
    return person ? `${person.firstName} ${person.lastName}`.trim() : '';
  });

  constructor() {
    // Restore draft when roomId changes
    effect(() => {
      const key = this.draftKey();
      const draft = key ? (localStorage.getItem(key) ?? '') : '';
      this.messageText.set(draft);
      // Mention refs belong to the draft that was being typed, not to the restored text.
      // Without this, stale refs survive a reload or a room switch and would be sent as
      // `m.mentions` for a message that no longer contains them. (Restored drafts do not
      // re-resolve their mentions — out of scope; the point is only that refs never leak.)
      this.resetMentionState();
    });

    // Revoke object URLs and clean up failed-thumb state for removed files
    effect(() => {
      const current = new Set(this.pendingImages());
      for (const [file, url] of this._objectUrlCache) {
        if (!current.has(file)) {
          URL.revokeObjectURL(url);
          this._objectUrlCache.delete(file);
        }
      }
      this._failedThumbs.update(s => {
        const pruned = new Set([...s].filter(f => current.has(f)));
        return pruned.size === s.size ? s : pruned;
      });
    });

    // Close the mention overlay if it would render with zero options (e.g. the @-query
    // narrows to no matches, or mentionCandidates changes out from under an open overlay).
    // An empty floating box has nothing to pick — closing lets Enter fall through to send.
    effect(() => {
      if (this.isMentionOpen() && this.mentionOverlay() && this.mentionOverlay()!.options().length === 0) {
        // Record the token as dismissed BEFORE closing. Without this, the `keyup` of the very
        // same keystroke re-runs updateMentionQuery(), sees mentionQuery() === null, recomputes
        // the identical token and reopens the overlay — which this effect closes again, so the
        // bordered box flashes on every keystroke. Typing a further character changes the token,
        // the lapse logic in updateMentionQuery() clears the dismissal and the overlay reopens.
        this.mentionDismissed = this.mentionQuery();
        this.mentionQuery.set(null);
      }
    });

    // Combobox ARIA must live on the NATIVE <textarea>, not on the <ion-textarea> host:
    // DOM focus goes to the inner textarea, and `aria-activedescendant`/`aria-expanded` are
    // only honoured on the focused element. Ionic's `inheritAriaAttributes` snapshots host
    // aria-* ONCE in componentWillLoad and never recomputes (and does not forward `role` at
    // all), so host bindings would leave a permanently stale `aria-expanded="false"` behind —
    // worse than no ARIA. Setting them imperatively from an effect keeps them live.
    effect(() => {
      const ta = this.nativeTextarea();
      if (!ta) return;
      const open = this.isMentionOpen();
      // Read the CHILD's clamp so the announced option is the one actually highlighted.
      const activeId = open ? mentionOptionId(this.instanceId, this.clampedMentionIndex()) : null;
      ta.setAttribute('role', 'combobox');
      ta.setAttribute('aria-expanded', String(open));
      // Only reference the listbox while it exists — otherwise it is a dangling IDREF.
      if (open) ta.setAttribute('aria-controls', this.listboxId);
      else ta.removeAttribute('aria-controls');
      if (activeId) ta.setAttribute('aria-activedescendant', activeId);
      else ta.removeAttribute('aria-activedescendant');
    });

    // Revoke all remaining object URLs on destroy
    this._destroyRef.onDestroy(() => {
      this.revokeObjectUrls();
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }
    });

    // Attach cursor tracking directly to the native textarea inside ion-textarea's shadow DOM
    afterNextRender(() => {
      const getNative = () => this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
      const save = () => {
        const ta = getNative();
        if (ta) this.savedCursorPos = ta.selectionStart;
        // The caret can move without any `input` event (arrow keys, Home/End, a mouse click
        // or a touch drag inside the textarea). Re-deriving the @-token here keeps
        // `mentionQuery.start` in sync with the caret, so `onMentionPicked` never splices
        // against a stale offset and duplicates text.
        this.updateMentionQuery();
      };
      // Clicking away must not leave the overlay floating over the composer. Delay the close
      // so a mousedown → blur → click sequence on an overlay option still reaches its handler
      // (same trick as the emoji popover's outside-click listener), and skip it if focus came
      // back in the meantime — picking an option refocuses the textarea on its own timeout.
      const closeOnBlur = () => {
        setTimeout(() => {
          const ta = getNative();
          const root = ta?.getRootNode() as Document | ShadowRoot | undefined;
          if (ta && root?.activeElement === ta) return;
          this.mentionQuery.set(null);
        }, 200);
      };
      // ion-textarea renders async; poll briefly until the native element appears,
      // but give up after 5 s (cursor tracking is a nice-to-have, not worth an
      // immortal interval if the element never renders)
      let attempts = 0;
      const interval = setInterval(() => {
        const ta = getNative();
        if (ta) {
          clearInterval(interval);
          // Publish the handle so the combobox-ARIA effect can drive attributes on it.
          this.nativeTextarea.set(ta);
          ta.addEventListener('keyup', save);
          ta.addEventListener('mouseup', save);
          ta.addEventListener('touchend', save);
          ta.addEventListener('blur', closeOnBlur);
          this._destroyRef.onDestroy(() => {
            ta.removeEventListener('keyup', save);
            ta.removeEventListener('mouseup', save);
            ta.removeEventListener('touchend', save);
            ta.removeEventListener('blur', closeOnBlur);
          });
        } else if (++attempts >= 100) {
          clearInterval(interval);
        }
      }, 50);
      this._destroyRef.onDestroy(() => clearInterval(interval));
    });
  }

  textInput = viewChild<ElementRef>('textInput');
  fileInputRef = viewChild<ElementRef>('fileInput');

  private imgixBaseUrl = this.appStore.env.services.imgixBaseUrl;

  // ─── recording state ──────────────────────────────────────────────────────
  isRecording = signal(false);
  recordingSeconds = signal(0);

  private savedCursorPos: number | null = null;

  private readonly _destroyRef = inject(DestroyRef);
  private readonly _objectUrlCache = new Map<File, string>();
  protected readonly _failedThumbs = signal<Set<File>>(new Set());

  protected onThumbError(file: File): void {
    this._failedThumbs.update(s => new Set(s).add(file));
  }

  protected getObjectUrl(file: File): string {
    if (!this._objectUrlCache.has(file)) {
      this._objectUrlCache.set(file, URL.createObjectURL(file));
    }
    return this._objectUrlCache.get(file)!;
  }

  private revokeObjectUrls(): void {
    for (const url of this._objectUrlCache.values()) {
      URL.revokeObjectURL(url);
    }
    this._objectUrlCache.clear();
  }

  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: ReturnType<typeof setInterval> | null = null;

  canSend = computed(() => {
    return (this.messageText().trim().length > 0 || this.pendingImages().length > 0) && !this.disabled();
  });

  sendMessage(): void {
    const files = this.pendingImages();
    if (files.length > 0) {
      this.filesSent.emit([...files]);
      this.revokeObjectUrls();
    }
    const text = this.messageText().trim();
    if (text) {
      const activeMentions = filterActiveMentions(text, this.mentions());
      const mentionRoom = /(^|\s)@room(\s|$)/.test(text);
      this.messageSent.emit({ text, mentions: activeMentions, mentionRoom });
      this.messageText.set('');
      this.mentions.set([]);
      this.resetMentionState();
      this.typing.emit(false);
      const key = this.draftKey();
      if (key) localStorage.removeItem(key);
    }
  }

  onEnterKey(event: Event) {
    const keyboardEvent = event as KeyboardEvent;
    // While the mention overlay is open, Enter picks the highlighted entry instead of sending.
    if (this.isMentionOpen() && (this.mentionOverlay()?.options().length ?? 0) > 0) {
      event.preventDefault();
      this.pickActiveMention();
      return;
    }
    // Send on Enter, new line on Shift+Enter
    if (!keyboardEvent.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /** Arrow/Tab/Escape handling — only active while the mention overlay is open. */
  protected onMentionNavigation(event: Event, action: 'up' | 'down' | 'pick' | 'close'): void {
    if (!this.isMentionOpen()) return;
    const count = this.mentionOverlay()?.options().length ?? 0;
    if (action === 'close') {
      event.preventDefault();
      this.mentionDismissed = this.mentionQuery();
      this.mentionQuery.set(null);
      return;
    }
    if (count === 0) return;
    event.preventDefault();
    const current = this.clampedMentionIndex();
    if (action === 'up') this.mentionActiveIndex.set((current - 1 + count) % count);
    else if (action === 'down') this.mentionActiveIndex.set((current + 1) % count);
    else this.pickActiveMention();
  }

  private pickActiveMention(): void {
    const options = this.mentionOverlay()?.options() ?? [];
    if (options.length === 0) return;
    const option = options[this.clampedMentionIndex()];
    if (option) this.onMentionPicked(option);
  }

  /** Replace the @-token under the caret with the chosen mention. */
  protected onMentionPicked(option: MentionPick): void {
    const query = this.mentionQuery();
    if (!query) return;
    const text = this.messageText();
    const textarea = this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
    const caret = textarea?.selectionStart ?? text.length;

    let insert: string;
    if (option.kind === 'room') {
      insert = MENTION_ROOM;
    } else if (option.kind === 'me') {
      // Plain text only — self-notification is deliberately not wanted, so no MentionRef
      // is pushed and the Matrix send path (m.mentions) never sees this insertion.
      insert = `@${this.currentUserName()}`;
    } else {
      // Trim: an empty lastName would otherwise yield "@Anna " + " " → a double space in the
      // message and a trailing space in the stored MentionRef.display.
      const display = `${option.person.firstName} ${option.person.lastName}`.trim();
      insert = `@${display}`;
      this.mentions.update((list) => [...list, { personKey: option.person.okey, display }]);
    }

    const next = `${text.slice(0, query.start)}${insert} ${text.slice(caret)}`;
    this.messageText.set(next);
    this.persistDraft(next);
    this.mentionQuery.set(null);
    this.mentionActiveIndex.set(0);

    // Caret goes right after the inserted mention and its trailing space.
    this.restoreCaret(query.start + insert.length + 1);
  }

  /**
   * Refocus the textarea and place the caret at `pos`.
   *
   * `ion-textarea` is a Stencil component that writes the new value into the native textarea on
   * its OWN render tick (a `requestAnimationFrame`), so restoring the caret synchronously — or on
   * a plain `setTimeout(0)` that races that write — sets the selection against the OLD value; the
   * subsequent Stencil write then resets the caret to the end. A `//`/`!!` modal's async delay
   * happens to outlast the write, but a synchronous mention pick does not, so the caret jumped.
   *
   * So poll across animation frames until the native textarea's value matches the text we just
   * set, and only THEN focus + set the caret — nothing overwrites it afterwards. The node is
   * re-queried each frame because Stencil may replace it while re-rendering.
   */
  private restoreCaret(pos: number): void {
    const target = this.messageText();
    let frames = 0;
    const apply = () => {
      const ta = this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
      if (ta && ta.value === target) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
        return;
      }
      // Give up after ~20 frames (~1/3 s) rather than poll forever if the value never lands.
      if (++frames < 20) requestAnimationFrame(apply);
    };
    requestAnimationFrame(apply);
  }

  /**
   * Recompute the @-token under the caret; opens or closes the autocomplete overlay.
   *
   * Runs on every input AND every caret move (see the keyup/mouseup/touchend listeners), so it
   * must be idempotent: when the recomputed token is identical to the current one it changes
   * nothing — otherwise the keyup that follows an ArrowUp/ArrowDown would reset the highlighted
   * option back to 0 and make the overlay unnavigable.
   */
  private updateMentionQuery(): void {
    // A direct chat never opens the overlay — neither persons nor @room. '@' stays plain text.
    if (this.isDirectRoom()) {
      this.mentionQuery.set(null);
      return;
    }
    const textarea = this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
    const text = this.messageText();
    const caret = textarea?.selectionStart ?? text.length;
    const query = findMentionQuery(text, caret);

    // Escape closed this exact token on purpose — don't let the trailing keyup reopen it.
    // The dismissal lapses as soon as the caret lands on a different token.
    const dismissed = this.mentionDismissed;
    if (query && dismissed && dismissed.start === query.start && dismissed.query === query.query) return;
    this.mentionDismissed = null;

    const current = this.mentionQuery();
    if (query && current && current.start === query.start && current.query === query.query) return;

    this.mentionQuery.set(query);
    this.mentionActiveIndex.set(0);
  }

  async onInput(): Promise<void> {
    this.onTyping();
    this.updateMentionQuery();
    if (this.isSettingQuickEntryValue) return;
    const value = this.messageText();
    const trigger = this.quickEntryService.detectTrigger(value);
    if (!trigger) return;
    // '@' is handled by the inline mention overlay (updateMentionQuery above), not by a
    // quick-entry modal. Bail out before the guard so a '@' keystroke does not pointlessly
    // flip `isSettingQuickEntryValue`. detectTrigger still returns 'person' for other
    // consumers (task-list, calevent-list) — leave the service alone.
    if (trigger === 'person') return;
    this.isSettingQuickEntryValue = true;
    try {
      if (trigger === 'date') {
        const { DateTimeSelectModal } = await import('@okr/shared-ui');
        const modal = await this.modalController.create({ component: DateTimeSelectModal });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<string>();
        if (role === 'confirm' && data) {
          const datePart = data.substring(0, 10);
          const viewDate = convertDateFormatToString(datePart, DateFormat.IsoDate, DateFormat.ViewDate);
          const timePart = data.length >= 16 ? data.substring(11, 16) : '00:00';
          const token = timePart === '00:00' ? viewDate : `${viewDate},${timePart.replace(':', '')}`;
          this.setTextAndDraft(this.quickEntryService.replaceToken(value, '//', token));
        } else {
          this.setTextAndDraft(value.slice(0, -2));
        }
      } else if (trigger === 'location') {
        const result = await this.modelSelectService.selectLocation('', true, false);
        if (result?.kind === 'predefined') {
          // Write the location NAME into the message text (like '//' writes the date), rather
          // than sending it as a separate position message.
          this.setTextAndDraft(this.quickEntryService.replaceToken(value, '!!', result.location.name));
        } else {
          this.setTextAndDraft(value.slice(0, -2));
        }
      }
    } finally {
      this.isSettingQuickEntryValue = false;
      this.restoreCaretToEnd();
    }
  }

  /**
   * After a quick-entry modal (`//` date, `!!` location) resolves, the textarea has lost focus
   * and the caret is stale, so the user cannot keep typing where they left off. The token is only
   * ever detected at the END of the text (`detectTrigger` uses `endsWith`), so the resolved value
   * — or the stripped token on cancel — always lands at the end; returning the caret there places
   * it right after the inserted text.
   */
  private restoreCaretToEnd(): void {
    this.restoreCaret(this.messageText().length);
  }

  /**
   * Keep the per-room draft (`localStorage['chat-draft:<roomId>']`) in sync with the text.
   * Must run for EVERY programmatic change to `messageText` (quick-entry resolution, clear,
   * emoji, mention pick) — none of those fire `ionInput`, so `onTyping()` never runs for them.
   * Without this, the bare '//'/'!!' token that the opening keystroke persisted stays in the
   * draft and reappears on every room switch. Empty text removes the key, so a cleared field
   * restores as empty rather than as the stale token.
   */
  private persistDraft(text: string): void {
    const key = this.draftKey();
    if (!key) return;
    if (text.length > 0) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  }

  /** Set the text programmatically and keep the room draft in sync (see persistDraft). */
  private setTextAndDraft(text: string): void {
    this.messageText.set(text);
    this.persistDraft(text);
  }

  onTyping() {
    // Persist draft
    this.persistDraft(this.messageText());

    // Emit typing notification
    this.typing.emit(true);

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Stop typing after 3 seconds of no input
    this.typingTimeout = setTimeout(() => {
      this.typing.emit(false);
    }, 3000);
  }

  // ─── audio recording ───────────────────────────────────────────────────────

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer opus in webm (best compression), fall back to whatever the browser supports
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', '']
        .find(t => !t || MediaRecorder.isTypeSupported(t)) ?? '';

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop()); // release mic
        const blob = new Blob(this.audioChunks, { type: this.mediaRecorder?.mimeType ?? 'audio/webm' });
        const ext = (this.mediaRecorder?.mimeType ?? '').includes('ogg') ? 'ogg' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type });
        this.fileSent.emit(file);
        this.isRecording.set(false);
        this.recordingSeconds.set(0);
        if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
      };

      this.mediaRecorder.start(250); // collect chunks every 250ms
      this.isRecording.set(true);
      this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => this.recordingSeconds.update(s => s + 1), 1000);

    } catch (err) {
      console.error('MatrixMessageInput: microphone access denied or unavailable', err);
    }
  }

  stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop(); // triggers onstop → emits file
    }
  }

  cancelRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      // Override onstop so we don't emit the file
      this.mediaRecorder.onstop = () => {
        this.mediaRecorder?.stream?.getTracks().forEach(t => t.stop());
      };
      this.mediaRecorder.stop();
    }
    if (this.recordingTimer) { clearInterval(this.recordingTimer); this.recordingTimer = null; }
    this.isRecording.set(false);
    this.recordingSeconds.set(0);
    this.audioChunks = [];
  }

  formatRecordingDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /******************************* actions *************************************** */
  /**
   * Displays an ActionSheet with all possible actions on a chat message. Only actions are shown, that the user has permission for.
   * After user selected an action this action is executed.
   * @param attendee
   */
  protected async showActions(): Promise<void> {
    const actionSheetOptions = createActionSheetOptions(this.i18n().add_attachment());
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions);
  }

  /**
   * Fills the ActionSheet with all possible actions, considering the user permissions.
   *
   * The actions are dispatched via each button's `handler` rather than a post-dismiss
   * `switch (data.action)`. The handler runs synchronously inside the tap event, so the
   * user-activation context is still live — this is mandatory for the native browser APIs
   * (file picker `input.click()` and geolocation `getCurrentPosition`) which are silently
   * blocked when invoked after `await actionSheet.onDidDismiss()`.
   */
  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    const imageBtn = createActionSheetButton('chat.attachment.image', this.i18n().attach_image(), this.imgixBaseUrl, 'image');
    imageBtn.handler = () => this.selectFile('image/*,video/*');
    actionSheetOptions.buttons.push(imageBtn);

    const fileBtn = createActionSheetButton('chat.attachment.file', this.i18n().attach_file(), this.imgixBaseUrl, 'document');
    fileBtn.handler = () => this.selectFile('*/*');
    actionSheetOptions.buttons.push(fileBtn);

    const positionBtn = createActionSheetButton('chat.attachment.position', this.i18n().attach_position(), this.imgixBaseUrl, 'location');
    positionBtn.handler = () => this.locationSent.emit();
    actionSheetOptions.buttons.push(positionBtn);

    const surveyBtn = createActionSheetButton('chat.attachment.survey', this.i18n().attach_survey(), this.imgixBaseUrl, 'help-circle');
    surveyBtn.handler = () => this.surveyRequested.emit();
    actionSheetOptions.buttons.push(surveyBtn);

    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.i18n().cancel(), this.imgixBaseUrl, 'cancel'));
  }

  /**
   * Displays the ActionSheet. The selected action is executed by the button's own `handler`
   * (see addActionSheetButtons) to preserve the user-activation context for native APIs.
   * @param actionSheetOptions
   */
  private async executeActions(actionSheetOptions: ActionSheetOptions): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
    }
  }

  selectFile(accept: string) {
    const input = this.fileInputRef()?.nativeElement as HTMLInputElement;
    if (input) {
      input.accept = accept;
      input.click();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      if (isSupportedImageFile(file)) {
        this.fileQueued.emit(file);
      } else {
        this.fileSent.emit(file);
      }
      input.value = '';
    }
  }

  cancelReply() {
    this.cancelReplyClicked.emit();
  }

  getTypingText(): string {
    const users = this.typingUsers();
    const t = this.i18n();
    if (users.length === 0) return '';
    if (users.length === 1) return `${users[0]} ${t.isTyping()}`;
    if (users.length === 2) return `${users[0]} ${t.and()} ${users[1]} ${t.areTyping()}`;
    return `${users[0]} ${t.and()} ${users.length - 1} ${t.othersTyping()}`;
  }

  focus() {
    const textarea = this.textInput()?.nativeElement?.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  }

  toggleEmojiPicker(event: Event): void {
    event.stopPropagation();
    this.showEmojiPicker.update(v => !v);
    if (this.showEmojiPicker()) {
      // Close picker when clicking outside
      const close = () => {
        this.showEmojiPicker.set(false);
        document.removeEventListener('click', close);
      };
      setTimeout(() => document.addEventListener('click', close), 0);
    }
  }


  onEmojiClick(event: Event): void {
    const detail = (event as CustomEvent).detail;
    const emoji: string = detail?.unicode ?? detail?.emoji?.unicode ?? '';
    if (!emoji) return;

    const textarea = this.textInput()?.nativeElement?.querySelector('textarea') as HTMLTextAreaElement | null;
    if (textarea) {
      const start = this.savedCursorPos ?? this.messageText().length;
      const end = start;
      const current = this.messageText();
      this.messageText.set(current.slice(0, start) + emoji + current.slice(end));
      // Restore cursor position after Angular updates the DOM
      setTimeout(() => {
        const pos = start + emoji.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
        this.savedCursorPos = null;
      }, 0);
    } else {
      this.messageText.update(t => t + emoji);
    }
    this.persistDraft(this.messageText());
    this.showEmojiPicker.set(false);
  }

  clearValue(): void {
    // setTextAndDraft removes the draft key too, so the cleared field does not restore
    // as a stale value (e.g. a leftover '//'/'!!') on the next room switch.
    this.setTextAndDraft('');
    // The text is gone, so any @-token — and any Escape-dismissal of one — is stale; a
    // surviving `mentionQuery` would hold an offset into text that no longer exists.
    this.resetMentionState();
  }

  /**
   * Drop all @-token state. Called wherever the text is replaced wholesale (send, clear).
   *
   * Clearing `mentionDismissed` matters: it is keyed on {start, query}, so after
   * Escape-dismissing "@an" and sending, PASTING the identical text in one operation would
   * recompute a byte-identical token and the overlay would silently refuse to reopen.
   */
  private resetMentionState(): void {
    this.mentionQuery.set(null);
    this.mentionDismissed = null;
    this.mentionActiveIndex.set(0);
  }
}
