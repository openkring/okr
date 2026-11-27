import { Component, computed, inject, input, Signal, signal, viewChild, ViewEncapsulation } from '@angular/core';
import { AlertController, IonButton, IonIcon, IonInput, IonPopover, IonSelect, IonSelectOption, IonToggle, ToastController } from '@ionic/angular';
import { Command, EditorState } from 'prosemirror-state';

import { SvgIconPipe } from '@okr/shared-pipes';
import { EDITOR_LINK_PATTERN } from '@okr/shared-util-core';
import { showToast } from '@okr/shared-util-angular';

import type { RichTextFormat } from '../rich-text-format';
import type { RichTextI18n } from '../rich-text-i18n';
import type { RichTextFeature } from '../rich-text-inline';
import {
  activeAlign, activeBlockLevel, activeColor, activeLinkInfo, Align, BlockLevel, ColorMarkName, indent, insertImage, inTaskItem, isInside,
  isMarkActive, MarkName, redo, setAlign, setBlockLevel, setColor, setLink, toggleBlockquote, toggleList, toggleMarkCommand,
  toggleTaskItem, undo,
} from './rich-text.commands';
import { richTextSchema as schema } from './rich-text.schema';

/** Colour swatches of the colour popovers. */
const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#b71c1c', '#e53935', '#f57c00', '#fbc02d', '#388e3c', '#00897b',
  '#0288d1', '#1565c0', '#25265e', '#6a1b9a', '#c2185b', '#795548',
];

const LINK_REGEX = new RegExp(`^${EDITOR_LINK_PATTERN}$`, 'i');

/** The fields of the link popover. */
interface LinkDraft {
  /** an existing link is edited (it can be removed) */
  editing: boolean;
  href: string;
  text: string;
  /** the text when the popover opened: only a changed text replaces the linked one */
  originalText: string;
  newWindow: boolean;
}

interface MarkButton { mark: MarkName; icon: string; label: keyof RichTextI18n; }
/** The marks markdown can express (spec 1.170 §4.4). */
const MARKDOWN_MARKS: MarkName[] = ['strong', 'em', 's', 'code'];
type PopoverKind = 'text_color' | 'text_background_color' | 'align';

/** What the toolbar needs of the engine it belongs to. */
export interface RichTextToolbarEngine {
  readonly state: Signal<EditorState | undefined>;
  readonly format: Signal<RichTextFormat>;
  readonly hiddenFeatures: Signal<readonly RichTextFeature[]>;
  readonly i18n: Signal<RichTextI18n>;
  run(command: Command): void;
  focus(): void;
  blur(): void;
}

/**
 * The buttons above a rich text. The engine draws them above its text; `okr-rich-text-inline` creates them in a place of the
 * editor window instead (spec 1.175 §7.2). ProseMirror comes with it: only reachable through the same `import()` as the engine.
 */
@Component({
  selector: 'okr-rich-text-toolbar',
  standalone: true,
  imports: [SvgIconPipe, IonButton, IonIcon, IonInput, IonPopover, IonSelect, IonSelectOption, IonToggle],
  // the contents of the popover are drawn outside this element
  encapsulation: ViewEncapsulation.None,
  styles: [`
    okr-rich-text-toolbar { display: block; min-width: 0; }
    okr-rich-text-toolbar .rte-toolbar {
      display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; overflow-x: auto;
      padding: 2px 4px; border-bottom: 1px solid var(--ion-color-step-150, #e0e0e0);
      scrollbar-width: thin;
    }
    okr-rich-text-toolbar .rte-toolbar ion-button { --color: var(--ion-color-step-650, #595959); --padding-start: 6px; --padding-end: 6px; margin: 0; min-height: 32px; flex: 0 0 auto; }
    okr-rich-text-toolbar .rte-toolbar ion-button.active { --color: var(--ion-color-primary); --background: var(--ion-color-step-100, rgba(0,0,0,.06)); }
    okr-rich-text-toolbar .rte-toolbar ion-icon { font-size: 20px; }
    /* ion-select is width:100% by default and would swallow the whole row */
    okr-rich-text-toolbar .rte-toolbar ion-select { flex: 0 0 auto; width: 128px; min-height: 32px; font-size: 14px; --padding-start: 6px; }
    okr-rich-text-toolbar .rte-sep { flex: 0 0 1px; align-self: stretch; margin: 6px 2px; background: var(--ion-color-step-200, #ccc); }
    /* the last group is hidden */
    okr-rich-text-toolbar .rte-sep:last-child { display: none; }
    .rte-swatches { display: grid; grid-template-columns: repeat(6, 28px); gap: 6px; padding: 10px; }
    .rte-swatch { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--ion-color-step-300, #b3b3b3); cursor: pointer; padding: 0; }
    .rte-swatch.selected { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .rte-popover-actions { display: flex; justify-content: center; padding: 0 8px 8px; }
    .rte-align { display: flex; gap: 2px; padding: 6px; }
    .rte-link-popover { --width: min(360px, calc(100vw - 32px)); }
    .rte-link { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 8px; }
    .rte-link h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; }
    .rte-link ion-toggle { padding: 4px 0; }
    .rte-link-actions { display: flex; align-items: center; gap: 4px; padding-top: 4px; }
    .rte-link-actions .rte-grow { flex: 1 1 auto; }
  `],
  template: `
    <!-- mousedown is cancelled so a click never moves the focus (and the selection) out of the text -->
    <div class="rte-toolbar" role="toolbar" (mousedown)="keepFocus($event)">
      @if (shows().history) {
        <ion-button type="button" fill="clear" size="small" [disabled]="!can().undo" (click)="engine().run(undoCmd)" [attr.aria-label]="i18n().undo()" [title]="i18n().undo()">
          <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" />
        </ion-button>
        <ion-button type="button" fill="clear" size="small" [disabled]="!can().redo" (click)="engine().run(redoCmd)" [attr.aria-label]="i18n().redo()" [title]="i18n().redo()">
          <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" />
        </ion-button>
        <span class="rte-sep"></span>
      }
      @if (shows().heading) {
        <ion-select interface="popover" [value]="blockLevel()" (ionChange)="onBlockLevel($event.detail.value)"
          [attr.aria-label]="i18n().block()" [title]="i18n().block()">
          <ion-select-option [value]="0">{{ i18n().paragraph() }}</ion-select-option>
          @for (level of headingLevels; track level) {
            <ion-select-option [value]="level">{{ i18n().heading() }} {{ level }}</ion-select-option>
          }
        </ion-select>
        <span class="rte-sep"></span>
      }
      @if (shows().marks) {
        @for (b of visibleMarkButtons(); track b.mark) {
          <ion-button type="button" fill="clear" size="small" [class.active]="activeMarks()[b.mark]" (click)="engine().run(toggle(b.mark))"
            [attr.aria-label]="i18n()[b.label]()" [attr.aria-pressed]="activeMarks()[b.mark]" [title]="i18n()[b.label]()">
            <ion-icon slot="icon-only" src="{{ b.icon | svgIcon }}" />
          </ion-button>
        }
        <span class="rte-sep"></span>
      }
      @if (shows().colors) {
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

      @if (shows().lists) {
        <ion-button type="button" fill="clear" size="small" [class.active]="inBulletList()" (click)="engine().run(bulletList)"
          [attr.aria-label]="i18n().bulletList()" [title]="i18n().bulletList()">
          <ion-icon slot="icon-only" src="{{ 'list-bullet' | svgIcon }}" />
        </ion-button>
        <ion-button type="button" fill="clear" size="small" [class.active]="inOrderedList()" (click)="engine().run(orderedList)"
          [attr.aria-label]="i18n().orderedList()" [title]="i18n().orderedList()">
          <ion-icon slot="icon-only" src="{{ 'list-numbered' | svgIcon }}" />
        </ion-button>
        @if (isMarkdown()) {
          <ion-button type="button" fill="clear" size="small" [class.active]="inTask()" (click)="engine().run(taskItem)"
            [attr.aria-label]="i18n().taskList()" [title]="i18n().taskList()">
            <ion-icon slot="icon-only" src="{{ 'checkbox' | svgIcon }}" />
          </ion-button>
        }
      }
      @if (shows().align) {
        <ion-button type="button" fill="clear" size="small" (click)="openPopover($event, 'align')"
          [attr.aria-label]="i18n().align()" [title]="i18n().align()">
          <ion-icon slot="icon-only" src="{{ alignIcon() | svgIcon }}" />
        </ion-button>
      }
      @if (shows().quote) {
        <ion-button type="button" fill="clear" size="small" [class.active]="inBlockquote()" (click)="engine().run(blockquote)"
          [attr.aria-label]="i18n().blockquote()" [title]="i18n().blockquote()">
          <ion-icon slot="icon-only" src="{{ 'format-quote' | svgIcon }}" />
        </ion-button>
      }
      <!-- markdown cannot indent a paragraph; a list item still nests with Mod-] / Mod-[ -->
      @if (shows().indent) {
        <ion-button type="button" fill="clear" size="small" (click)="engine().run(outdentCmd)" [attr.aria-label]="i18n().outdent()" [title]="i18n().outdent()">
          <ion-icon slot="icon-only" src="{{ 'indent-decrease' | svgIcon }}" />
        </ion-button>
        <ion-button type="button" fill="clear" size="small" (click)="engine().run(indentCmd)" [attr.aria-label]="i18n().indent()" [title]="i18n().indent()">
          <ion-icon slot="icon-only" src="{{ 'indent-increase' | svgIcon }}" />
        </ion-button>
      }
      @if (shows().lists || shows().align || shows().quote || shows().indent) {
        <span class="rte-sep"></span>
      }

      @if (shows().link) {
        <ion-button type="button" fill="clear" size="small" [class.active]="!!link()" (click)="openLink($event)"
          [attr.aria-label]="i18n().link()" [title]="i18n().link()">
          <ion-icon slot="icon-only" src="{{ 'link' | svgIcon }}" />
        </ion-button>
      }
      @if (shows().image) {
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
              <ion-button type="button" fill="clear" size="small" [class.active]="align() === a.align" (click)="engine().run(alignCmd(a.align))"
                [attr.aria-label]="i18n()[a.label]()" [title]="i18n()[a.label]()">
                <ion-icon slot="icon-only" src="{{ a.icon | svgIcon }}" />
              </ion-button>
            }
          </div>
        } @else if (colorKind(); as kind) {
          <div class="rte-swatches" (mousedown)="keepFocus($event)">
            @for (color of palette; track color) {
              <button type="button" class="rte-swatch" [class.selected]="currentColor(kind) === color" [style.background]="color"
                [attr.aria-label]="color" (click)="engine().run(colorCmd(kind, color))"></button>
            }
          </div>
          <div class="rte-popover-actions">
            <ion-button type="button" fill="clear" size="small" (click)="engine().run(colorCmd(kind, null))">{{ i18n().noColor() }}</ion-button>
          </div>
        }
      </ng-template>
    </ion-popover>

    <!-- its own popover: a click into the fields must not close it -->
    <ion-popover class="rte-link-popover" [isOpen]="linkDraft() !== null" [event]="linkEvent()" [dismissOnSelect]="false"
      (didPresent)="focusLinkUrl()" (didDismiss)="closeLink()">
      <ng-template>
        @if (linkDraft(); as draft) {
          <form class="rte-link" (submit)="$event.preventDefault(); confirmLink()">
            <h3>{{ draft.editing ? i18n().linkEditHeader() : i18n().linkHeader() }}</h3>
            <ion-input #linkUrl type="url" inputmode="url" fill="outline" labelPlacement="stacked" [label]="i18n().linkUrl()"
              [placeholder]="i18n().linkPlaceholder()" [value]="draft.href" (ionInput)="patchLink({ href: $event.detail.value ?? '' })"
              (keydown.enter)="$event.preventDefault(); confirmLink()" />
            <ion-input type="text" fill="outline" labelPlacement="stacked" [label]="i18n().linkText()"
              [placeholder]="i18n().linkTextPlaceholder()" [value]="draft.text" (ionInput)="patchLink({ text: $event.detail.value ?? '' })"
              (keydown.enter)="$event.preventDefault(); confirmLink()" />
            <!-- markdown cannot say where a link opens -->
            @if (!isMarkdown()) {
              <ion-toggle labelPlacement="end" justify="start" [checked]="draft.newWindow" (ionChange)="patchLink({ newWindow: $event.detail.checked })">
                {{ i18n().linkNewWindow() }}
              </ion-toggle>
            }
            <div class="rte-link-actions">
              @if (draft.editing) {
                <ion-button type="button" fill="clear" size="small" color="danger" (click)="removeLink()">{{ i18n().linkRemove() }}</ion-button>
              }
              <span class="rte-grow"></span>
              <ion-button type="button" fill="clear" size="small" (click)="linkDraft.set(null)">{{ i18n().cancel() }}</ion-button>
              <ion-button type="submit" fill="solid" size="small">{{ i18n().ok() }}</ion-button>
            </div>
          </form>
        }
      </ng-template>
    </ion-popover>
  `,
})
export class RichTextToolbar {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  // inputs
  public readonly engine = input.required<RichTextToolbarEngine>();

  protected readonly i18n = computed(() => this.engine().i18n());
  private readonly state = computed(() => this.engine().state());

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

  protected readonly isMarkdown = computed(() => this.engine().format() === 'markdown');
  protected readonly visibleMarkButtons = computed(() =>
    this.isMarkdown() ? this.markButtons.filter((b) => MARKDOWN_MARKS.includes(b.mark)) : this.markButtons);

  /** The groups of buttons; markdown cannot express colours, alignment, indents and pictures. */
  protected readonly shows = computed(() => {
    const hidden = this.engine().hiddenFeatures();
    const html = !this.isMarkdown();
    const has = (feature: RichTextFeature) => !hidden.includes(feature);
    return {
      history: has('history'), heading: has('heading'), marks: has('marks'), colors: html && has('colors'), lists: has('lists'),
      align: html && has('align'), quote: has('quote'), indent: html && has('indent'), link: has('link'), image: html && has('image'),
    } satisfies Record<RichTextFeature, boolean>;
  });

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
  protected readonly link = computed(() => { const s = this.state(); return s ? activeLinkInfo(s) : null; });
  protected readonly inBulletList = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['bullet_list']); });
  protected readonly inOrderedList = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['ordered_list']); });
  protected readonly inBlockquote = computed(() => { const s = this.state(); return !!s && isInside(s, schema.nodes['blockquote']); });
  protected readonly inTask = computed(() => { const s = this.state(); return !!s && inTaskItem(s); });

  protected readonly popover = signal<PopoverKind | null>(null);
  /** the link being inserted or edited, while its popover is open */
  protected readonly linkDraft = signal<LinkDraft | null>(null);
  protected readonly linkEvent = signal<Event | undefined>(undefined);
  /** set by confirm/remove: closing the popover then does not hand the focus back (the command does) */
  private linkApplied = false;
  private readonly linkUrl = viewChild<IonInput>('linkUrl');
  protected readonly popoverEvent = signal<Event | undefined>(undefined);
  /** the colour popover that is open, if any */
  protected readonly colorKind = computed<ColorMarkName | null>(() => {
    const kind = this.popover();
    return kind === 'text_color' || kind === 'text_background_color' ? kind : null;
  });

  /******************************* actions *************************************** */
  protected keepFocus(event: Event): void {
    // a select or popover needs its own focus; buttons must leave the selection in the text
    if (!(event.target as HTMLElement).closest('ion-select')) event.preventDefault();
  }

  protected toggle(mark: MarkName): Command { return toggleMarkCommand(mark); }
  protected alignCmd(align: Align): Command { return setAlign(align); }
  protected colorCmd(kind: ColorMarkName, color: string | null): Command { return setColor(kind, color); }

  protected currentColor(kind: ColorMarkName): string | null {
    return kind === 'text_color' ? this.textColor() : this.backgroundColor();
  }

  protected onBlockLevel(level: unknown): void {
    const value = Number(level) as BlockLevel;
    if (value !== this.blockLevel()) this.engine().run(setBlockLevel(value));
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
    this.engine().blur();
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

  /**
   * Opens the link popover: for the link at the cursor (or the selection within one), or for a new link on the selection.
   * The focus leaves the text first, otherwise the contenteditable keeps the keyboard and typing lands in the text;
   * ProseMirror keeps the selection in its state, so the command still applies to it afterwards.
   */
  protected openLink(event: Event): void {
    const state = this.state();
    if (!state) return;
    const current = this.link();
    const { from, to } = state.selection;
    this.engine().blur();
    globalThis.getSelection?.()?.removeAllRanges();
    this.linkApplied = false;
    this.linkEvent.set(event);
    this.linkDraft.set(current
      ? { editing: true, href: current.href, text: current.text, originalText: current.text, newWindow: current.target === '_blank' }
      : { editing: false, href: '', text: state.doc.textBetween(from, to), originalText: state.doc.textBetween(from, to), newWindow: true });
  }

  protected patchLink(patch: Partial<LinkDraft>): void {
    this.linkDraft.update((draft) => (draft ? { ...draft, ...patch } : draft));
  }

  protected focusLinkUrl(): void {
    // Ionic settles the popover's focus just after presenting; focusing earlier is undone
    setTimeout(() => void this.linkUrl()?.setFocus(), 50);
  }

  protected async confirmLink(): Promise<void> {
    const draft = this.linkDraft();
    if (!draft) return;
    const href = draft.href.trim();
    if (!href) {                                                    // an empty address removes the link
      if (draft.editing) this.removeLink(); else this.linkDraft.set(null);
      return;
    }
    if (!LINK_REGEX.test(href)) {
      await showToast(this.toastController, this.i18n().linkInvalid());
      return;
    }
    const text = draft.text.trim();
    this.linkApplied = true;
    this.linkDraft.set(null);
    this.engine().run(setLink(href, {
      target: draft.newWindow || this.isMarkdown() ? '_blank' : null,
      // unchanged text keeps its formatting (a partly bold link stays so)
      text: text && text !== draft.originalText.trim() ? text : undefined,
    }));
  }

  protected removeLink(): void {
    this.linkApplied = true;
    this.linkDraft.set(null);
    this.engine().run(setLink(null));
  }

  protected closeLink(): void {
    this.linkDraft.set(null);
    if (!this.linkApplied) this.engine().focus();                  // cancelled
    this.linkApplied = false;
  }

  protected async addImage(): Promise<void> {
    const i18n = this.i18n();
    const src = (await this.prompt(i18n.imageHeader(), i18n.imagePlaceholder(), ''))?.trim();
    if (!src) { this.engine().focus(); return; }
    if (!/^https?:\/\//i.test(src)) {
      await showToast(this.toastController, i18n.linkInvalid());
      return;
    }
    this.engine().run(insertImage(src));
  }
}
