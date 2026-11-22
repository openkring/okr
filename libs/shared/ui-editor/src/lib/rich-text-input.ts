import {
  Component, ComponentRef, computed, DestroyRef, effect, inject, input, model, PLATFORM_ID, signal, untracked, viewChild,
  ViewContainerRef,
} from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonItem, IonNote, IonSpinner, IonTextarea } from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ButtonCopy, ButtonCopyI18n, ErrorNote, TextareaInputI18n, TextareaVariant } from '@okr/shared-ui';
import { coerceBoolean, htmlTextLength } from '@okr/shared-util-core';
import { HelperVisibility } from '@okr/shared-util-angular';

import type { RichTextEngine } from './engine/rich-text-engine';
import { EMPTY_RICH_TEXT, RichTextFormat } from './rich-text-format';
import { RICH_TEXT_I18N_KEYS, RichTextI18n } from './rich-text-i18n';
import { RichTextView } from './rich-text-view';

/**
 * The rich-text field (spec 1.170 §6): our frame, label and footer around a ProseMirror engine that is
 * loaded on demand. Static imports of this component are safe — the engine (and ProseMirror) is only
 * reached through `import()` below (lazy-loading skill, Pattern A).
 *
 * Same frame and footer as okr-textarea-input: `variant="field"` (label above, no card) or `"card"`;
 * footer = clear · copy · the Vest error · a counter of visible characters (D3).
 *
 * `format="markdown"` (§4.4) stores markdown and adds a «Quelltext» toggle. A text the editor cannot show
 * without changing it (`editsFaithfully`) opens as source and stays there, so opening it never rewrites it.
 * Its counter counts the stored markdown, which is what the Vest suites of markdown fields cap.
 */
@Component({
  selector: 'okr-rich-text-input',
  standalone: true,
  imports: [
    NgTemplateOutlet, SvgIconPipe,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonNote, IonIcon, IonSpinner, IonTextarea,
    ButtonCopy, ErrorNote, RichTextView,
  ],
  styles: [`
    :host { display: block; }
    @media (width <= 600px) { ion-card { margin: 5px; } }
    ion-card-content { padding: 0; }
    .label { display: block; padding: 10px 16px 4px; font-size: 12px; color: var(--ion-color-medium); }
    .frame {
      margin: 0 16px; border: 1px solid var(--ion-color-step-250, #c4c4c4); border-radius: 8px;
      overflow: hidden; background: var(--ion-item-background, var(--ion-background-color, #fff));
    }
    .frame:focus-within { border-color: var(--ion-color-primary); }
    .loading { display: flex; align-items: center; gap: 8px; min-height: 120px; padding: 12px; color: var(--ion-color-medium); }
    .read-only { padding: 4px 16px 8px; }
    .source { --padding-start: 12px; --padding-end: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 14px; }
    .source-only { display: block; padding: 4px 16px 6px; font-size: 12px; color: var(--ion-color-medium); }
    ion-item.helper { --min-height: 0; }

    .footer { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 2px 16px 6px 12px; }
    .footer .actions { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }
    .footer .actions ion-icon, .footer .actions ::ng-deep ion-icon {
      font-size: 20px; padding: 6px; color: var(--ion-color-medium); cursor: pointer; transition: color 120ms ease-in-out;
    }
    .footer .actions ion-icon:hover, .footer .actions ::ng-deep ion-icon:hover { color: var(--ion-color-primary); }
    .footer .message { flex: 1 1 auto; min-width: 0; }
    .footer .message ::ng-deep ion-note { display: block; font-size: 12px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .footer .counter { flex: 0 0 auto; font-size: 12px; color: var(--ion-color-medium); font-variant-numeric: tabular-nums; }
    .footer .counter.warn { color: var(--ion-color-warning); }
    .footer .counter.over { color: var(--ion-color-danger); font-weight: 600; }
  `],
  template: `
    @if (isCard()) {
      <ion-card>
        @if (title()) {
          <ion-card-header><ion-card-title>{{ title() }}</ion-card-title></ion-card-header>
        }
        <ion-card-content><ng-container [ngTemplateOutlet]="body" /></ion-card-content>
      </ion-card>
    } @else {
      <ng-container [ngTemplateOutlet]="body" />
    }

    <ng-template #body>
      @if (!isCard() && i18n().label) {
        <span class="label">{{ i18n().label }}</span>
      }
      @if (isReadOnly()) {
        <div class="read-only"><okr-rich-text-view [value]="value()" [format]="format()" /></div>
      } @else {
        @if (sourceOnly()) {
          <ion-note class="source-only">{{ texts.sourceOnly() }}</ion-note>
        }
        <div class="frame" [attr.aria-label]="i18n().label">
          @if (sourceMode()) {
            <ion-textarea class="source" [value]="value()" (ionInput)="value.set($event.detail.value ?? '')"
              [autoGrow]="true" [rows]="8" [placeholder]="i18n().placeholder || texts.placeholder()" [attr.aria-label]="i18n().label" />
          } @else {
            @if (!engine()) {
              <div class="loading"><ion-spinner name="dots" /> {{ texts.loading() }}</div>
            }
            <ng-container #engineHost />
          }
        </div>
        <div class="footer">
          <div class="actions">
            @if (isClearable() && charCount() > 0) {
              <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="clear()" [attr.aria-label]="texts.clear()" tabindex="-1" />
            }
            @if (isCopyable()) {
              <okr-button-copy [i18n]="buttonCopyI18n()" [value]="value()" tabindex="-1" />
            }
            @if (isMarkdown() && !sourceOnly()) {
              <ion-icon src="{{ (sourceMode() ? 'format-bold' : 'code') | svgIcon }}" (click)="sourceMode.set(!sourceMode())"
                [attr.aria-label]="sourceMode() ? texts.richMode() : texts.sourceMode()" [title]="sourceMode() ? texts.richMode() : texts.sourceMode()"
                tabindex="-1" />
            }
          </div>
          <div class="message"><okr-error-note [errors]="errors()" [inline]="true" /></div>
          <div class="counter" [class.warn]="isNearLimit()" [class.over]="isAtLimit()">{{ charCount() }}@if (maxLength(); as max) {/{{ max }}}</div>
        </div>
        @if (shouldShowHelper()) {
          <ion-item lines="none" class="helper" [button]="false"><ion-note>{{ i18n().helper }}</ion-note></ion-item>
        }
      }
    </ng-template>
  `,
})
export class RichTextInput {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly helperVisibility = inject(HelperVisibility);

  // inputs
  /** Stored text (HTML or markdown, see `format`), two-way bound. */
  public readonly value = model.required<string>();
  public readonly i18n = input.required<TextareaInputI18n>();
  public readonly readOnly = input.required<boolean>();
  /** How the field stores its text (spec 1.170 §4.1) — fixed per field. */
  public readonly format = input<RichTextFormat>('html');
  public readonly variant = input<TextareaVariant>('field');
  public readonly title = input('');
  public readonly errors = input<string[]>([]);
  /** Cap in visible characters (D3) — bind the constant the Vest suite enforces; unset = no cap, count only. */
  public readonly maxLength = input<number | undefined>(undefined);
  public readonly clearable = input(true);
  public readonly copyable = input(false);
  public readonly showHelper = input(false);

  protected readonly texts = inject(I18nService).translateAll(RICH_TEXT_I18N_KEYS) as RichTextI18n;
  protected readonly buttonCopyI18n = computed(() => ({} as ButtonCopyI18n));

  // derived
  protected readonly isCard = computed(() => this.variant() === 'card');
  protected readonly isMarkdown = computed(() => this.format() === 'markdown');
  private readonly emptyValue = computed(() => EMPTY_RICH_TEXT[this.format()]);
  /** markdown only: the author edits the raw text */
  protected readonly sourceMode = signal(false);
  /** markdown only: the text cannot be shown formatted without changing it — source mode is forced */
  protected readonly sourceOnly = signal(false);
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly isClearable = computed(() => coerceBoolean(this.clearable()));
  protected readonly isCopyable = computed(() => coerceBoolean(this.copyable()));
  protected readonly shouldShowHelper = computed(() =>
    this.helperVisibility.showHelpers() && coerceBoolean(this.showHelper()) && !!this.i18n().helper);
  protected readonly charCount = computed(() => (this.isMarkdown() ? (this.value() ?? '').length : htmlTextLength(this.value())));
  protected readonly isNearLimit = computed(() => { const max = this.maxLength(); return max !== undefined && this.charCount() >= max * 0.9; });
  protected readonly isAtLimit = computed(() => { const max = this.maxLength(); return max !== undefined && this.charCount() > max; });

  // lazy engine (Pattern A): the ref must be a signal — zoneless, a plain field never re-renders
  private readonly engineHost = viewChild('engineHost', { read: ViewContainerRef });
  protected readonly engine = signal<ComponentRef<RichTextEngine> | undefined>(undefined);
  private creating = false;

  constructor() {
    effect(() => {
      const host = this.engineHost();
      if (!host) {
        // read-only hides the host: the engine went with it, so drop the stale ref and recreate later
        if (untracked(() => this.engine())) this.engine.set(undefined);
        return;
      }
      if (untracked(() => this.engine()) || this.creating || !isPlatformBrowser(this.platformId)) return;
      this.creating = true;
      void (async () => {
        try {
          const format = untracked(() => this.format());
          if (format === 'markdown') {
            const { editsFaithfully } = await import('./engine/rich-text.markdown');
            if (!editsFaithfully(untracked(() => this.value()))) {
              this.sourceOnly.set(true);
              this.sourceMode.set(true);
              return;
            }
          }
          const { RichTextEngine } = await import('./engine/rich-text-engine');
          const ref = host.createComponent(RichTextEngine);
          ref.setInput('format', format);
          ref.setInput('value', untracked(() => this.value()) || EMPTY_RICH_TEXT[format]);
          ref.setInput('placeholder', untracked(() => this.i18n().placeholder) || this.texts.placeholder());
          ref.setInput('i18n', this.texts);
          ref.instance.valueChange.subscribe((html: string) => this.value.set(html));
          ref.changeDetectorRef.detectChanges();
          this.engine.set(ref);
        } finally {
          this.creating = false;
        }
      })();
    });
    // keep the engine's inputs current — read every signal before the early return
    effect(() => {
      const ref = this.engine();
      const value = this.value() || this.emptyValue();
      const placeholder = this.i18n().placeholder || this.texts.placeholder();
      if (!ref) return;
      ref.setInput('value', value);
      ref.setInput('placeholder', placeholder);
    });
    inject(DestroyRef).onDestroy(() => this.engine()?.destroy());
  }

  protected clear(): void {
    this.value.set(this.emptyValue());
  }
}
