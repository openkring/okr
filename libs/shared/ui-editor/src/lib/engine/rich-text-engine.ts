import { AfterViewInit, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { Command, EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';

import { RichTextFormat } from '../rich-text-format';
import { RichTextI18n } from '../rich-text-i18n';
import type { RichTextCaret, RichTextFeature } from '../rich-text-inline';
import { caretSelection, isAtVeryStart, redo, removeEmptyLastParagraph, splitItem, toggleChecked, undo } from './rich-text.commands';
import { docToHtml, EMPTY_HTML, htmlToDoc } from './rich-text.html';
import { docToMarkdown, EMPTY_MARKDOWN, markdownToDoc } from './rich-text.markdown';
import { richTextSchema as schema } from './rich-text.schema';
import { RichTextToolbar, RichTextToolbarEngine } from './rich-text-toolbar';

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

/** Marks empty lines without the cursor: readers see no height for them, so a text edited in place must not show any either. */
function emptyLinesPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => {
        const { from, to } = state.selection;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (!node.isTextblock) return true;
          const hasCursor = from <= pos + 1 && to >= pos + 1;
          if (node.content.size === 0 && !hasCursor) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'rte-empty-line' }));
          return false;
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

/** Without a history of its own the browser's must not act either: it would undo what it knows of the DOM, past the host's steps. */
function noNativeHistoryPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        beforeinput: (_view, event) => {
          if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return false;
          event.preventDefault();
          return true;
        },
      },
    },
  });
}

/**
 * The heavy half of the rich-text editor (spec 1.170 §6): the ProseMirror view and its toolbar.
 * Never import this statically — `okr-rich-text-input` and `okr-rich-text-inline` load it with `import()` so ProseMirror
 * stays out of every eager bundle (lazy-loading skill, Pattern A).
 */
@Component({
  selector: 'okr-rich-text-engine',
  standalone: true,
  imports: [RichTextToolbar],
  // the editable DOM is created by ProseMirror, not by this template: its rules cannot be encapsulated
  encapsulation: ViewEncapsulation.None,
  styles: [`
    okr-rich-text-engine { display: block; }
    okr-rich-text-engine .ProseMirror {
      position: relative; min-height: 120px; padding: 10px 12px; outline: none;
      white-space: pre-wrap; word-wrap: break-word; font-variant-ligatures: none; font-feature-settings: "liga" 0;
      color: var(--ion-text-color, #000);
    }
    okr-rich-text-engine .ProseMirror pre { white-space: pre-wrap; }
    okr-rich-text-engine .ProseMirror li { position: relative; }
    okr-rich-text-engine .ProseMirror img { max-width: 100%; }
    /* a text edited in place (okr-rich-text-inline) has the quotes of the drawn text */
    :where(:not(okr-rich-text-inline)) > okr-rich-text-engine .ProseMirror blockquote { margin-left: 0; padding-left: 12px; border-left: 3px solid var(--ion-color-step-300, #b3b3b3); }
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
  `],
  template: `
    @if (!readOnly() && showToolbar()) {
      <okr-rich-text-toolbar [engine]="this" />
    }
    <div #pm></div>
  `,
})
export class RichTextEngine implements AfterViewInit, RichTextToolbarEngine {
  // inputs / outputs
  public readonly value = input<string>(EMPTY_HTML);
  /** Read when the view is created; a field never changes its format. */
  public readonly format = input<RichTextFormat>('html');
  public readonly readOnly = input(false);
  public readonly placeholder = input('');
  public readonly i18n = input.required<RichTextI18n>();
  /** Groups the toolbar does not offer. Read once for the keys: without 'history' there is no undo, its keys are left to the host. */
  public readonly hiddenFeatures = input<readonly RichTextFeature[]>([]);
  /** false = the host draws `okr-rich-text-toolbar` elsewhere */
  public readonly showToolbar = input(true);
  /** The text stands where readers see it and must look the same (okr-rich-text-inline). Read once. */
  public readonly inPlace = input(false);
  /** Enter in an empty last paragraph and Backspace at the very start ask the host (`split`, `join`). */
  public readonly blockEditing = input(false);
  /** Where the cursor goes when a text is loaded or this changes; undefined = it is left alone (start of the text). */
  public readonly caret = input<RichTextCaret | undefined>(undefined);
  /** The stored text after every change the author makes; never echoes a value pushed in through `value`. */
  public readonly valueChange = output<string>();
  /** blockEditing: a new text is wanted below; the text without its empty last paragraph (also emitted by `valueChange`) */
  public readonly split = output<string>();
  /** blockEditing: this text is to be joined with the one above; the text */
  public readonly join = output<string>();

  private readonly mount = viewChild.required<ElementRef<HTMLDivElement>>('pm');
  private view: EditorView | undefined;
  /** The HTML this editor last emitted or loaded — an incoming value equal to it is not reloaded. */
  private currentHtml: string | undefined;

  /** The editor state as a signal, so the toolbar re-renders on every transaction (zoneless). */
  public readonly state = signal<EditorState | undefined>(undefined);

  constructor() {
    // a value set from outside (load, revert, clear) replaces the document; the author's own edits do not
    let placed: RichTextCaret | undefined;
    effect(() => {
      const html = this.value() || this.empty();
      const caret = this.caret();
      const isNewCaret = caret !== placed;
      placed = caret;
      if (!this.view) return;
      if (html !== untracked(() => this.currentHtml)) this.loadDocument(html, caret);
      else if (caret && isNewCaret) this.placeCaret(caret);
    });
    effect(() => {
      const editable = !this.readOnly();
      this.view?.setProps({ editable: () => editable });
    });
    inject(DestroyRef).onDestroy(() => {
      this.view?.destroy();
      // a prompt of the toolbar may come back after this
      this.view = undefined;
    });
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

  public blur(): void {
    this.view?.dom.blur();
  }

  /** Runs a command of the toolbar; the cursor stays in the text. */
  public run(command: Command): void {
    const view = this.view;
    if (!view) return;
    command(view.state, view.dispatch, view);
    view.focus();
  }

  private plugins(): Plugin[] {
    const hidden = untracked(() => this.hiddenFeatures());
    const off = (feature: RichTextFeature) => hidden.includes(feature);
    const item = schema.nodes['list_item'];
    // a hidden mark's key is taken, not left to the browser, which would format the DOM by itself
    const mark = (name: string): Command => (off('marks') ? () => true : toggleMark(schema.marks[name]));
    return [
      ...(off('history') ? [noNativeHistoryPlugin()] : [history(), keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo })]),
      keymap({
        'Enter': this.requestSplit(),
        'Backspace': this.requestJoin(), 'Shift-Backspace': this.requestJoin(), 'Mod-Backspace': this.requestJoin(),
      }),
      keymap({
        'Mod-b': mark('strong'), 'Mod-i': mark('em'), 'Mod-u': mark('u'),
        'Enter': splitItem(), ...(off('lists') ? {} : { 'Mod-[': liftListItem(item), 'Mod-]': sinkListItem(item) }),
        'Shift-Enter': (state, dispatch) => {
          if (dispatch) dispatch(state.tr.replaceSelectionWith(schema.nodes['hard_break'].create()).scrollIntoView());
          return true;
        },
      }),
      keymap(baseKeymap),
      placeholderPlugin(() => this.placeholder()),
      ...(untracked(() => this.inPlace()) ? [emptyLinesPlugin()] : []),
      taskCheckboxPlugin(),
    ];
  }

  /** Enter in an empty last paragraph of a text block: that paragraph becomes the next block. */
  private requestSplit(): Command {
    return (state, dispatch) => {
      if (!untracked(() => this.blockEditing()) || !removeEmptyLastParagraph()(state, dispatch)) return false;
      if (dispatch && this.view) this.split.emit(this.fromDoc(this.view.state.doc));
      return true;
    };
  }

  /** Backspace at the very start of a text block: the host joins it with the text above. */
  private requestJoin(): Command {
    return (state, dispatch) => {
      if (!untracked(() => this.blockEditing()) || !isAtVeryStart(state)) return false;
      if (dispatch) this.join.emit(this.fromDoc(state.doc));
      return true;
    };
  }

  private isMarkdownNow(): boolean { return untracked(() => this.format()) === 'markdown'; }
  private empty(): string { return this.isMarkdownNow() ? EMPTY_MARKDOWN : EMPTY_HTML; }
  private toDoc(text: string): EditorState['doc'] { return this.isMarkdownNow() ? markdownToDoc(text) : htmlToDoc(text); }
  private fromDoc(doc: EditorState['doc']): string { return this.isMarkdownNow() ? docToMarkdown(doc) : docToHtml(doc); }

  private createView(): void {
    const html = untracked(() => this.value()) || this.empty();
    this.currentHtml = html;
    const state = this.stateOf(html, untracked(() => this.caret()), this.plugins());
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

  private stateOf(html: string, caret: RichTextCaret | undefined, plugins: readonly Plugin[]): EditorState {
    const doc = this.toDoc(html);
    return EditorState.create({ schema, doc, selection: caret && caretSelection(doc, caret), plugins });
  }

  /** Replaces the document (and its undo history) with `html`, without emitting. */
  private loadDocument(html: string, caret: RichTextCaret | undefined): void {
    if (!this.view) return;
    this.currentHtml = html;
    const state = this.stateOf(html, caret, this.view.state.plugins);
    this.view.updateState(state);
    this.state.set(state);
  }

  private placeCaret(caret: RichTextCaret): void {
    if (!this.view) return;
    const { tr, doc } = this.view.state;
    this.view.dispatch(tr.setSelection(caretSelection(doc, caret)));
  }
}
