import {
  Component, ComponentRef, computed, DestroyRef, effect, ErrorHandler, inject, input, output, PLATFORM_ID, signal, Type, untracked, viewChild,
  ViewContainerRef, ViewEncapsulation,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { I18nService } from '@okr/shared-i18n';

import type { RichTextEngine } from './engine/rich-text-engine';
import type { RichTextToolbar } from './engine/rich-text-toolbar';
import { EMPTY_RICH_TEXT } from './rich-text-format';
import { RICH_TEXT_I18N_KEYS, RichTextI18n } from './rich-text-i18n';

/** A group of buttons that a host can leave out, together with the keys and, in a text edited in place, the look of what it makes. */
/** `fill`: the background colour alone, which `colors` hides too (a mail offers the text colour without it). */
export type RichTextFeature = 'history' | 'heading' | 'marks' | 'colors' | 'fill' | 'lists' | 'align' | 'quote' | 'indent' | 'link' | 'image';

/** Where the cursor goes; `afterHtml` = right after the content with this html (between two joined texts), 'end' if it is not there. */
export type RichTextCaret = 'start' | 'end' | { afterHtml: string };

/**
 * A text edited where it is drawn (spec 1.175 §7.5): no frame, no padding, with the font, colour and alignment of its place.
 * The toolbar is created in `toolbarHost`; without one there is none.
 *
 * Static imports of this component are safe: the engine (ProseMirror) is only reached through `import()`
 * (lazy-loading skill, Pattern A). It is empty until `ready`, so the host keeps its drawing until then, and after `failed`.
 * It takes the focus when it is ready.
 */
@Component({
  selector: 'okr-rich-text-inline',
  standalone: true,
  // the editable DOM is created by ProseMirror, not by this template: its rules cannot be encapsulated
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class.hides-colors]': `hiddenFeatures().includes('colors')`,
    '[class.hides-align]': `hiddenFeatures().includes('align')`,
    '[class.hides-indent]': `hiddenFeatures().includes('indent')`,
    '[class.hides-fill]': `hiddenFeatures().includes('fill')`,
  },
  styles: [`
    okr-rich-text-inline { display: block; }
    okr-rich-text-inline okr-rich-text-engine .ProseMirror {
      padding: 0; min-height: 0; color: inherit; overflow-wrap: inherit; font-variant-ligatures: inherit; font-feature-settings: inherit;
    }
    okr-rich-text-inline okr-rich-text-engine .ProseMirror.is-empty::before { left: 0; right: 0; }
    okr-rich-text-inline .ProseMirror .rte-empty-line > br { display: none; }
    /* readers never see these styles (Angular's sanitizer drops them), so a text must not change when it is edited; they stay stored */
    okr-rich-text-inline.hides-colors .ProseMirror span[style] { color: inherit !important; background-color: transparent !important; }
    okr-rich-text-inline.hides-align .ProseMirror :is(p, h1, h2, h3, h4, h5, h6)[style] { text-align: inherit !important; }
    okr-rich-text-inline.hides-indent .ProseMirror [data-indent] { margin-left: revert !important; }
    okr-rich-text-inline.hides-fill .ProseMirror span[style] { background-color: transparent !important; }
  `],
  template: `<ng-container #engineHost />`,
})
export class RichTextInline {
  private readonly errorHandler = inject(ErrorHandler);
  private readonly texts = inject(I18nService).translateAll(RICH_TEXT_I18N_KEYS) as RichTextI18n;

  // inputs
  /**
   * Stored html. A changed value other than the html last emitted is loaded, with the cursor at `caret`. For undo the host must set
   * it to what `valueChange` emits, at once: without that, going back to the value that is still set is no change and loads nothing.
   */
  public readonly value = input<string>(EMPTY_RICH_TEXT.html);
  /** default: the one of the rich-text field */
  public readonly placeholder = input('');
  /** Read once for the keys (when the engine is created), always for the toolbar. */
  public readonly hiddenFeatures = input<readonly RichTextFeature[]>([]);
  /** Backspace at the very start emits `join`; otherwise the keys are the field's (Enter is always a line break in the text). */
  public readonly blockEditing = input(false);
  /**
   * true: an empty line keeps its height, also without the cursor in it. For a text whose readers see empty lines (a mail: its
   * renderer writes them with a non-breaking space). Default: hidden, as a browser draws an empty paragraph. Read once.
   */
  public readonly showEmptyLines = input(false);
  public readonly toolbarHost = input<ViewContainerRef | undefined>(undefined);
  /** Where the cursor goes when the text is ready, when another html is loaded, and when this changes. */
  public readonly caret = input<RichTextCaret>('end');

  // outputs
  public readonly valueChange = output<string>();
  /** html */
  public readonly join = output<string>();
  public readonly ready = output<void>();
  /** The engine could not be loaded; nothing is shown. */
  public readonly failed = output<void>();

  /** an equal `{ afterHtml }` object of a later change detection is the same wish */
  private readonly caretWish = computed(() => this.caret(), {
    equal: (a, b) => a === b || (typeof a === 'object' && typeof b === 'object' && a.afterHtml === b.afterHtml),
  });

  // lazy engine (Pattern A): the refs must be signals — zoneless
  private readonly engineHost = viewChild.required('engineHost', { read: ViewContainerRef });
  private readonly engine = signal<ComponentRef<RichTextEngine> | undefined>(undefined);
  private toolbarType: Type<RichTextToolbar> | undefined;
  private destroyed = false;

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    let started = false;
    effect(() => {
      const host = this.engineHost();
      if (started || !isBrowser) return;
      started = true;
      void this.load(host);
    });
    // the toolbar follows its host, which a parent may know only later
    effect((onCleanup) => {
      const engine = this.engine();
      const host = this.toolbarHost();
      const type = this.toolbarType;
      if (!engine || !host || !type) return;
      const toolbar = untracked(() => {
        const ref = host.createComponent(type);
        ref.setInput('engine', engine.instance);
        ref.changeDetectorRef.detectChanges();
        // the select takes the focus back right after this event
        ref.location.nativeElement.addEventListener('ionDismiss', () => setTimeout(() => engine.instance.focus()));
        return ref;
      });
      onCleanup(() => toolbar.destroy());
    });
    // keep the engine's inputs current — read every signal before the early return
    effect(() => {
      const engine = this.engine();
      const value = this.value() || EMPTY_RICH_TEXT.html;
      const placeholder = this.placeholder() || this.texts.placeholder();
      const hiddenFeatures = this.hiddenFeatures();
      const blockEditing = this.blockEditing();
      if (!engine) return;
      engine.setInput('value', value);
      engine.setInput('placeholder', placeholder);
      engine.setInput('hiddenFeatures', hiddenFeatures);
      engine.setInput('blockEditing', blockEditing);
    });
    let placed: RichTextCaret | undefined;
    effect(() => {
      const engine = this.engine();
      const caret = this.caretWish();
      if (!engine || caret === placed) return;
      placed = caret;
      engine.setInput('caret', caret);
      engine.instance.focus();
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.engine()?.destroy();
    });
  }

  /** Puts the focus back into the text, where the cursor was. */
  public focus(): void {
    this.engine()?.instance.focus();
  }

  private async load(host: ViewContainerRef): Promise<void> {
    let engineType: Type<RichTextEngine>;
    try {
      const [engine, toolbar] = await Promise.all([import('./engine/rich-text-engine'), import('./engine/rich-text-toolbar')]);
      engineType = engine.RichTextEngine;
      this.toolbarType = toolbar.RichTextToolbar;
    } catch (error) {
      // not for the app's handler: it would reload the page for a missing chunk, and unsaved changes with it
      console.warn('RichTextInline: the editor could not be loaded', error);
      if (!this.destroyed) this.failed.emit();
      return;
    }
    if (this.destroyed) return;
    try {
      this.engine.set(this.createEngine(host, engineType));
    } catch (error) {
      // a bug, not a missing chunk; nothing else would hand it to the app's handler from here
      this.errorHandler.handleError(error);
      host.clear();
      this.failed.emit();
      return;
    }
    this.ready.emit();
  }

  private createEngine(host: ViewContainerRef, engineType: Type<RichTextEngine>): ComponentRef<RichTextEngine> {
    const ref = host.createComponent(engineType);
    ref.setInput('showToolbar', false);
    ref.setInput('inPlace', true);
    ref.setInput('i18n', this.texts);
    ref.setInput('value', this.value() || EMPTY_RICH_TEXT.html);
    ref.setInput('placeholder', this.placeholder() || this.texts.placeholder());
    ref.setInput('hiddenFeatures', this.hiddenFeatures());
    ref.setInput('blockEditing', this.blockEditing());
    ref.setInput('showEmptyLines', this.showEmptyLines());
    ref.setInput('caret', this.caretWish());
    ref.instance.valueChange.subscribe((html: string) => this.valueChange.emit(html));
    ref.instance.join.subscribe((html: string) => this.join.emit(html));
    ref.changeDetectorRef.detectChanges();
    return ref;
  }
}
