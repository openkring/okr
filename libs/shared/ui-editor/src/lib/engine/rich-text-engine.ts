import {
  AfterViewInit, Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { AlertController, IonButton, IonIcon, IonPopover, IonSelect, IonSelectOption, ToastController } from '@ionic/angular';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { Command, EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EDITOR_LINK_PATTERN } from '@okr/shared-util-core';
import { showToast } from '@okr/shared-util-angular';

import { RichTextFormat } from '../rich-text-format';
import { RichTextI18n } from '../rich-text-i18n';
import {
  activeAlign, activeBlockLevel, activeColor, activeLink, Align, BlockLevel, ColorMarkName, indent, insertImage, inTaskItem, isInside,
  isMarkActive, MarkName, redo, setAlign, setBlockLevel, setColor, setLink, splitItem, toggleBlockquote, toggleChecked, toggleList,
  toggleMarkCommand, toggleTaskItem, undo,
} from './rich-text.commands';
import { docToHtml, EMPTY_HTML, htmlToDoc } from './rich-text.html';
import { docToMarkdown, EMPTY_MARKDOWN, markdownToDoc } from './rich-text.markdown';
import { richTextSchema as schema } from './rich-text.schema';

/** Colour swatches of the colour popovers. */
const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#b71c1c', '#e53935', '#f57c00', '#fbc02d', '#388e3c', '#00897b',
  '#0288d1', '#1565c0', '#25265e', '#6a1b9a', '#c2185b', '#795548',
];

const LINK_REGEX = new RegExp(`^${EDITOR_LINK_PATTERN}$`, 'i');

interface MarkButton { mark: MarkName; icon: string; label: keyof RichTextI18n; }
/** The marks markdown can express (spec 1.170 §4.4). */
const MARKDOWN_MARKS: MarkName[] = ['strong', 'em', 's', 'code'];
type PopoverKind = 'text_color' | 'text_background_color' | 'align';

function placeholderPlugin(text: () => string): Plugin {
  return new Plugin({
    props: {
      attributes: (state): Record<string, string> => {
        const doc = state.doc;
        const empty = doc.childCount === 1 && doc.firstChild?.isTextblock === true && doc.firstChild.content.size === 0;
        return empty ? { class: 'is-empty', 'data-placeholder': text() } : {};
      },
    },
  });
}

/** A click on a task item's box (drawn left of the item's text) ticks or unticks it. */
function taskCheckboxPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          const li = (event.target as HTMLElement | null)?.closest?.('li[data-checked]');
          if (!li || !view.editable || event.clientX >= li.getBoundingClientRect().left) return false;
          const $pos = view.state.doc.resolve(view.posAtDOM(li, 0));
          for (let depth = $pos.depth; depth > 0; depth--) {
            if ($pos.node(depth).type === schema.nodes['list_item']) {
              event.preventDefault();
              return toggleChecked($pos.before(depth))(view.state, view.dispatch);
            }
          }
          return false;
        },
      },
    },
  });
}

/**
 * The heavy half of the rich-text editor (spec 1.170 §6): the ProseMirror view and its toolbar.
 * Never import this statically — `okr-rich-text-input` loads it with `import()` so ProseMirror stays out
 * of every eager bundle (lazy-loading skill, Pattern A).
 */
@Component({
  selector: 'okr-rich-text-engine',
  standalone: true,
  imports: [SvgIconPipe, IonButton, IonIcon, IonPopover, IonSelect, IonSelectOption],
  // the editable DOM is created by ProseMirror, not by this template: its rules cannot be encapsulated
  encapsulation: ViewEncapsulation.None,
  styles: [`
    okr-rich-text-engine { display: block; }
    okr-rich-text-engine .rte-toolbar {
      display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; overflow-x: auto;
      padding: 2px 4px; border-bottom: 1px solid var(--ion-color-step-150, #e0e0e0);
      scrollbar-width: thin;
    }
    okr-rich-text-engine .rte-toolbar ion-button { --color: var(--ion-color-step-650, #595959); --padding-start: 6px; --padding-end: 6px; margin: 0; min-height: 32px; flex: 0 0 auto; }
    okr-rich-text-engine .rte-toolbar ion-button.active { --color: var(--ion-color-primary); --background: var(--ion-color-step-100, rgba(0,0,0,.06)); }
    okr-rich-text-engine .rte-toolbar ion-icon { font-size: 20px; }
    /* ion-select is width:100% by default and would swallow the whole row */
    okr-rich-text-engine .rte-toolbar ion-select { flex: 0 0 auto; width: 128px; min-height: 32px; font-size: 14px; --padding-start: 6px; }
    okr-rich-text-engine .rte-sep { flex: 0 0 1px; align-self: stretch; margin: 6px 2px; background: var(--ion-color-step-200, #ccc); }
    okr-rich-text-engine .ProseMirror {
      position: relative; min-height: 120px; padding: 10px 12px; outline: none;
      white-space: pre-wrap; word-wrap: break-word; font-variant-ligatures: none; font-feature-settings: "liga" 0;
      color: var(--ion-text-color, #000);
    }
    okr-rich-text-engine .ProseMirror pre { white-space: pre-wrap; }
    okr-rich-text-engine .ProseMirror li { position: relative; }
    okr-rich-text-engine .ProseMirror img { max-width: 100%; }
    okr-rich-text-engine .ProseMirror blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid var(--ion-color-step-300, #b3b3b3); }
    okr-rich-text-engine .ProseMirror-hideselection *::selection { background: transparent; }
    okr-rich-text-engine .ProseMirror li.rte-task { list-style: none; }
    okr-rich-text-engine .ProseMirror li.rte-task::before {
      content: '☐'; position: absolute; left: -1.4em; top: 0; width: 1.2em; text-align: center; cursor: pointer; color: var(--ion-color-medium);
    }
    okr-rich-text-engine .ProseMirror li.rte-task[data-checked="true"]::before { content: '☑'; color: var(--ion-color-primary); }
    okr-rich-text-engine .ProseMirror li.rte-task[data-checked="true"] > p { color: var(--ion-color-medium); }
    okr-rich-text-engine .ProseMirror .rte-raw {
      font-size: 12px; color: var(--ion-color-medium); background: var(--ion-color-step-100, #f0f0f0); border-radius: 4px; padding: 1px 4px;
      white-space: pre-wrap;
    }
    okr-rich-text-engine .ProseMirror pre.rte-raw { margin: 4px 0; padding: 4px 8px; }
    okr-rich-text-engine .ProseMirror .rte-raw.ProseMirror-selectednode { outline: 2px solid var(--ion-color-primary); }
    okr-rich-text-engine .ProseMirror.is-empty::before {
      content: attr(data-placeholder); position: absolute; pointer-events: none; color: var(--ion-color-medium);
    }
    .rte-swatches { display: grid; grid-template-columns: repeat(6, 28px); gap: 6px; padding: 10px; }
    .rte-swatch { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--ion-color-step-300, #b3b3b3); cursor: pointer; padding: 0; }
    .rte-swatch.selected { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .rte-popover-actions { display: flex; justify-content: center; padding: 0 8px 8px; }
    .rte-align { display: flex; gap: 2px; padding: 6px; }
  `],
  template: `
    @if (!readOnly()) {
      <!-- mousedown is cancelled so a click never moves the focus (and the selection) out of the text -->
      <div class="rte-toolbar" role="toolbar" (mousedown)="keepFocus($event)">
        <ion-button type="button" fill="clear" size="small" [disabled]="!can().undo" (click)="run(undoCmd)" [attr.aria-label]="i18n().undo()" [title]="i18n().undo()">
          <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" />
        </ion-button>
        <ion-button type="button" fill="clear" size="small" [disabled]="!can().redo" (click)="run(redoCmd)" [attr.aria-label]="i18n().redo()" [title]="i18n().redo()">
          <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" />
        </ion-button>
        <span class="rte-sep"></span>

        <ion-select interface="popover" [value]="blockLevel()" (ionChange)="onBlockLevel($event.detail.value)"
          [attr.aria-label]="i18n().block()" [title]="i18n().block()">
          <ion-select-option [value]="0">{{ i18n().paragraph() }}</ion-select-option>
          @for (level of headingLevels; track level) {
            <ion-select-option [value]="level">{{ i18n().heading() }} {{ level }}</ion-select-option>
          }
        </ion-select>
        <span class="rte-sep"></span>

        @for (b of visibleMarkButtons(); track b.mark) {
          <ion-button type="button" fill="clear" size="small" [class.active]="activeMarks()[b.mark]" (click)="run(toggle(b.mark))"
            [attr.aria-label]="i18n()[b.label]()" [attr.aria-pressed]="activeMarks()[b.mark]" [title]="i18n()[b.label]()">
            <ion-icon slot="icon-only" src="{{ b.icon | svgIcon }}" />
          </ion-button>
        }
        <span class="rte-sep"></span>

        @if (!isMarkdown()) {
          <ion-button type="button" fill="clear" size="small" [class.active]="!!textColor()" (click)="openPopover($event, 'text_color')"
            [attr.aria-label]="i18n().textColor()" [title]="i18n().textColor()">
            <ion-icon slot="icon-only" src="{{ 'format-text-color' | svgIcon }}" />
          </ion-button>
          <ion-button type="button" fill="clear" size="small" [class.active]="!!backgroundColor()" (click)="openPopover($event, 'text_background_color')"
            [attr.aria-label]="i18n().backgroundColor()" [title]="i18n().backgroundColor()">
            <ion-icon slot="icon-only" src="{{ 'format-fill-color' | svgIcon }}" />
          </ion-button>
          <span class="rte-sep"></span>
        }

        <ion-button type="button" fill="clear" size="small" [class.active]="inBulletList()" (click)="run(bulletList)"
          [attr.aria-label]="i18n().bulletList()" [title]="i18n().bulletList()">
          <ion-icon slot="icon-only" src="{{ 'list-bullet' | svgIcon }}" />
        </ion-button>
        <ion-button type="button" fill="clear" size="small" [class.active]="inOrderedList()" (click)="run(orderedList)"
          [attr.aria-label]="i18n().orderedList()" [title]="i18n().orderedList()">
          <ion-icon slot="icon-only" src="{{ 'list-numbered' | svgIcon }}" />
        </ion-button>
        @if (isMarkdown()) {
          <ion-button type="button" fill="clear" size="small" [class.active]="inTask()" (click)="run(taskItem)"
            [attr.aria-label]="i18n().taskList()" [title]="i18n().taskList()">
            <ion-icon slot="icon-only" src="{{ 'checkbox' | svgIcon }}" />
          </ion-button>
        } @else {
          <ion-button type="button" fill="clear" size="small" (click)="openPopover($event, 'align')"
            [attr.aria-label]="i18n().align()" [title]="i18n().align()">
            <ion-icon slot="icon-only" src="{{ alignIcon() | svgIcon }}" />
          </ion-button>
        }
        <ion-button type="button" fill="clear" size="small" [class.active]="inBlockquote()" (click)="run(blockquote)"
          [attr.aria-label]="i18n().blockquote()" [title]="i18n().blockquote()">
          <ion-icon slot="icon-only" src="{{ 'format-quote' | svgIcon }}" />
        </ion-button>
        <!-- markdown cannot indent a paragraph; a list item still nests with Mod-] / Mod-[ -->
        @if (!isMarkdown()) {
          <ion-button type="button" fill="clear" size="small" (click)="run(outdentCmd)" [attr.aria-label]="i18n().outdent()" [title]="i18n().outdent()">
            <ion-icon slot="icon-only" src="{{ 'indent-decrease' | svgIcon }}" />
          </ion-button>
          <ion-button type="button" fill="clear" size="small" (click)="run(indentCmd)" [attr.aria-label]="i18n().indent()" [title]="i18n().indent()">
            <ion-icon slot="icon-only" src="{{ 'indent-increase' | svgIcon }}" />
          </ion-button>
        }
        <span class="rte-sep"></span>

        <ion-button type="button" fill="clear" size="small" [class.active]="!!linkHref()" (click)="editLink()"
          [attr.aria-label]="i18n().link()" [title]="i18n().link()">
          <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
        </ion-button>
        @if (!isMarkdown()) {
          <ion-button type="button" fill="clear" size="small" (click)="addImage()" [attr.aria-label]="i18n().image()" [title]="i18n().image()">
            <ion-icon slot="icon-only" src="{{ 'image' | svgIcon }}" />
          </ion-button>
        }
      </div>

      <ion-popover [isOpen]="popover() !== null" [event]="popoverEvent()" (didDismiss)="popover.set(null)" [dismissOnSelect]="true">
        <ng-template>
          @if (popover() === 'align') {
            <div class="rte-align" (mousedown)="keepFocus($event)">
              @for (a of aligns; track a.align) {
                <ion-button type="button" fill="clear" size="small" [class.active]="align() === a.align" (click)="run(alignCmd(a.align))"
                  [attr.aria-label]="i18n()[a.label]()" [title]="i18n()[a.label]()">
                  <ion-icon slot="icon-only" src="{{ a.icon | svgIcon }}" />
                </ion-button>
              }
            </div>
          } @else if (colorKind(); as kind) {
            <div class="rte-swatches" (mousedown)="keepFocus($event)">
              @for (color of palette; track color) {
                <button type="button" class="rte-swatch" [class.selected]="currentColor(kind) === color" [style.background]="color"
                  [attr.aria-label]="color" (click)="run(colorCmd(kind, color))"></button>
              }
            </div>
            <div class="rte-popover-actions">
              <ion-button type="button" fill="clear" size="small" (click)="run(colorCmd(kind, null))">{{ i18n().noColor() }}</ion-button>
            </div>
          }
        </ng-template>
      </ion-popover>
    }
    <div #pm></div>
  `,
})
export class RichTextEngine implements AfterViewInit {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  // inputs / outputs
  public readonly value = input<string>(EMPTY_HTML);
  /** Read when the view is created; a field never changes its format. */
  public readonly format = input<RichTextFormat>('html');
  public readonly readOnly = input(false);
  public readonly placeholder = input('');
  public readonly i18n = input.required<RichTextI18n>();
  /** The stored text after every change the author makes; never echoes a value pushed in through `value`. */
  public readonly valueChange = output<string>();

  private readonly mount = viewChild.required<ElementRef<HTMLDivElement>>('pm');
  private view: EditorView | undefined;
  /** The HTML this editor last emitted or loaded — an incoming value equal to it is not reloaded. */
  private currentHtml: string | undefined;

  /** The editor state as a signal, so the toolbar re-renders on every transaction (zoneless). */
  protected readonly state = signal<EditorState | undefined>(undefined);

  // constants for the template
  protected readonly palette = PALETTE;
  protected readonly headingLevels: BlockLevel[] = [1, 2, 3, 4, 5, 6];
  protected readonly markButtons: MarkButton[] = [
    { mark: 'strong', icon: 'format-bold', label: 'bold' },
    { mark: 'em', icon: 'format-italic', label: 'italic' },
    { mark: 'u', icon: 'format-underline', label: 'underline' },
    { mark: 's', icon: 'format-strike', label: 'strike' },
    { mark: 'sup', icon: 'format-superscript', label: 'superscript' },
    { mark: 'sub', icon: 'format-subscript', label: 'subscript' },
    { mark: 'code', icon: 'code', label: 'code' },
  ];
  protected readonly aligns: { align: Align; icon: string; label: keyof RichTextI18n }[] = [
    { align: 'left', icon: 'align-left', label: 'alignLeft' },
    { align: 'center', icon: 'align-center', label: 'alignCenter' },
    { align: 'right', icon: 'align-right', label: 'alignRight' },
    { align: 'justify', icon: 'align-justify', label: 'alignJustify' },
  ];
  protected readonly undoCmd = undo;
  protected readonly redoCmd = redo;
  protected readonly bulletList = toggleList('bullet_list');
  protected readonly orderedList = toggleList('ordered_list');
  protected readonly blockquote = toggleBlockquote();
  protected readonly indentCmd = indent(1);
  protected readonly outdentCmd = indent(-1);
  protected readonly taskItem = toggleTaskItem();

  protected readonly isMarkdown = computed(() => this.format() === 'markdown');
  protected readonly visibleMarkButtons = computed(() =>
    this.isMarkdown() ? this.markButtons.filter((b) => MARKDOWN_MARKS.includes(b.mark)) : this.markButtons);

  // toolbar state
  protected readonly can = computed(() => {
    const state = this.state();
    return { undo: !!state && undo(state), redo: !!state && redo(state) };
  });
  protected readonly activeMarks = computed(() => {
    const state = this.state();
    const active = {} as Record<MarkName, boolean>;
    for (const b of this.markButtons) active[b.mark] = !!state && isMarkActive(state, schema.marks[b.mark]);
    return active;
  });
  protected readonly blockLevel = computed(() => { const s = this.state(); return s ? activeBlockLevel(s) : 0; });
  protected readonly align = computed(() => { const s = this.state(); return s ? activeAlign(s) : 'left'; });
  protected readonly alignIcon = computed(() => `align-${this.align()}`);
  protected readonly textColor = computed(() => { const s = this.state(); return s ? activeColor(s, 'text_color') : null; });
  protected readonly backgroundColor = computed(() => { const s = this.state(); return s ? activeColor(s, 'text_background_color') : null; });
  protected readonly linkHref = computed(() => { const s = this.state(); return s ? activeLink(s) : null; });
  protected readonly inBulletList = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['bullet_list']); });
  protected readonly inOrderedList = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['ordered_list']); });
  protected readonly inBlockquote = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['blockquote']); });
  protected readonly inTask = computed(() => { const s = this.state(); return !!s && inTaskItem(s); });

  protected readonly popover = signal<PopoverKind | null>(null);
  protected readonly popoverEvent = signal<Event | undefined>(undefined);
  /** the colour popover that is open, if any */
  protected readonly colorKind = computed<ColorMarkName | null>(() => {
    const kind = this.popover();
    return kind === 'text_color' || kind === 'text_background_color' ? kind : null;
  });

  constructor() {
    // a value set from outside (load, revert, clear) replaces the document; the author's own edits do not
    effect(() => {
      const html = this.value() || this.empty();
      if (!this.view || html === untracked(() => this.currentHtml)) return;
      this.loadDocument(html);
    });
    effect(() => {
      const editable = !this.readOnly();
      this.view?.setProps({ editable: () => editable });
    });
    inject(DestroyRef).onDestroy(() => this.view?.destroy());
  }

  /**
   * Not afterNextRender: this component is created with createComponent() and checked by the host's
   * detectChanges(), and nothing else may trigger the app render that afterNextRender waits for.
   */
  public ngAfterViewInit(): void {
    this.createView();
  }

  /** Puts the cursor into the text (the host's `autofocus`). */
  public focus(): void {
    this.view?.focus();
  }

  private plugins(): Plugin[] {
    const item = schema.nodes['list_item'];
    return [
      history(),
      keymap({
        'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
        'Mod-b': toggleMark(schema.marks['strong']), 'Mod-i': toggleMark(schema.marks['em']), 'Mod-u': toggleMark(schema.marks['u']),
        'Enter': splitItem(), 'Mod-[': liftListItem(item), 'Mod-]': sinkListItem(item),
        'Shift-Enter': (state, dispatch) => {
          if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes['hard_break'].create()).scrollIntoView());
          return true;
        },
      }),
      keymap(baseKeymap),
      placeholderPlugin(() => this.placeholder()),
      taskCheckboxPlugin(),
    ];
  }

  private isMarkdownNow(): boolean { return untracked(() => this.format()) === 'markdown'; }
  private empty(): string { return this.isMarkdownNow() ? EMPTY_MARKDOWN : EMPTY_HTML; }
  private toDoc(text: string): EditorState['doc'] { return this.isMarkdownNow() ? markdownToDoc(text) : htmlToDoc(text); }
  private fromDoc(doc: EditorState['doc']): string { return this.isMarkdownNow() ? docToMarkdown(doc) : docToHtml(doc); }

  private createView(): void {
    const html = untracked(() => this.value()) || this.empty();
    this.currentHtml = html;
    const state = EditorState.create({ schema, doc: this.toDoc(html), plugins: this.plugins() });
    this.view = new EditorView(this.mount().nativeElement, {
      state,
      editable: () => !untracked(() => this.readOnly()),
      dispatchTransaction: (tr) => {
        if (!this.view) return;
        const next = this.view.state.apply(tr);
        this.view.updateState(next);
        this.state.set(next);
        if (tr.docChanged) {
          const out = this.fromDoc(next.doc);
          this.currentHtml = out;
          this.valueChange.emit(out);
        }
      },
    });
    this.state.set(state);
  }

  /** Replaces the document (and its undo history) with `html`, without emitting. */
  private loadDocument(html: string): void {
    if (!this.view) return;
    this.currentHtml = html;
    const state = EditorState.create({ schema, doc: this.toDoc(html), plugins: this.view.state.plugins });
    this.view.updateState(state);
    this.state.set(state);
  }

  /******************************* actions *************************************** */
  protected keepFocus(event: Event): void {
    // a select or popover needs its own focus; buttons must leave the selection in the text
    if (!(event.target as HTMLElement).closest('ion-select')) event.preventDefault();
  }

  protected run(command: Command): void {
    const view = this.view;
    if (!view) return;
    command(view.state, view.dispatch, view);
    view.focus();
  }

  protected toggle(mark: MarkName): Command { return toggleMarkCommand(mark); }
  protected alignCmd(align: Align): Command { return setAlign(align); }
  protected colorCmd(kind: ColorMarkName, color: string | null): Command { return setColor(kind, color); }

  protected currentColor(kind: ColorMarkName): string | null {
    return kind === 'text_color' ? this.textColor() : this.backgroundColor();
  }

  protected onBlockLevel(level: unknown): void {
    const value = Number(level) as BlockLevel;
    if (value !== this.blockLevel()) this.run(setBlockLevel(value));
  }

  protected openPopover(event: Event, kind: PopoverKind): void {
    this.popoverEvent.set(event);
    this.popover.set(kind);
  }

  /**
   * One-value prompt (okrPrompt's shape). It moves the focus out of the text first and into its own field
   * after presenting: otherwise the contenteditable keeps the keyboard and the URL lands in the text.
   * ProseMirror keeps the selection in its state, so the command still applies to it afterwards.
   * Returns undefined when cancelled.
   */
  private async prompt(header: string, placeholder: string, value: string): Promise<string | undefined> {
    this.view?.dom.blur();
    // the DOM selection would still sit in the text (and receive inserted text); ProseMirror keeps its own copy
    globalThis.getSelection?.()?.removeAllRanges();
    const i18n = this.i18n();
    const alert = await this.alertController.create({
      header,
      cssClass: 'okr-prompt-alert',
      inputs: [{ type: 'url', placeholder, value }],
      buttons: [{ text: i18n.cancel(), role: 'cancel' }, { text: i18n.ok(), role: 'confirm' }],
    });
    await alert.present();
    // Ionic settles the alert's focus just after present() resolves; focusing earlier is undone
    setTimeout(() => alert.querySelector<HTMLInputElement>('input')?.focus(), 50);
    const { data, role } = await alert.onWillDismiss();
    return role === 'confirm' ? ((data?.values?.[0] as string | undefined) ?? '') : undefined;
  }

  protected async editLink(): Promise<void> {
    const i18n = this.i18n();
    const href = await this.prompt(i18n.linkHeader(), i18n.linkPlaceholder(), this.linkHref() ?? '');
    if (href === undefined) { this.view?.focus(); return; }           // cancelled
    const value = href.trim();
    if (value && !LINK_REGEX.test(value)) {
      await showToast(this.toastController, i18n.linkInvalid());
      return;
    }
    this.run(setLink(value || null));
  }

  protected async addImage(): Promise<void> {
    const i18n = this.i18n();
    const src = (await this.prompt(i18n.imageHeader(), i18n.imagePlaceholder(), ''))?.trim();
    if (!src) { this.view?.focus(); return; }
    if (!/^https?:\/\//i.test(src)) {
      await showToast(this.toastController, i18n.linkInvalid());
      return;
    }
    this.run(insertImage(src));
  }
}
