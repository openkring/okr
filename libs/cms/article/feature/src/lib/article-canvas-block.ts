import { CdkDragHandle, CdkDragPlaceholder, CdkDragPreview } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, Signal, ViewContainerRef, computed, inject, input, linkedSignal } from '@angular/core';
import { IonIcon, IonNote } from '@ionic/angular';

import {
  ARTICLE_BLOCK_ICONS, ARTICLE_BLOCKS_MAX, type ArticleBlockView, type ArticleEditorI18n, type ArticlePreviewDevice, blockTypeLabel,
  canAddBlock, duplicateBlock, type EditorProfile, eventsNote, isPictureMissing, mailEventsDrawn, moveBlockBy,
} from '@okr/cms-section-util';
import type { MailBlock } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { RichTextInline, type RichTextCaret, type RichTextFeature } from '@okr/shared-ui-editor';
import { fill, type MailEventLine } from '@okr/shared-util-core';

import { ArticleBlockComponent } from './article-block';
import type { CanvasItemKind } from './article-canvas.util';
import { MailEvents } from './mail-events';
import { MailGallery } from './mail-gallery';

/** A block as the canvas shows it. `view`: what readers see of it, undefined when they see nothing. */
export interface CanvasItem {
  kind: CanvasItemKind;
  block: MailBlock;
  view?: ArticleBlockView;
  /** malformed columns: there is nothing to draw a frame around */
  noColumns?: boolean;
}

export type FrameAction = 'up' | 'down' | 'duplicate' | 'delete' | 'add';

/** Where the cursor goes in the text with this id. */
export interface CanvasCaret { id: string; at: RichTextCaret }

/** What a block takes from the canvas around it (`article-canvas.ts`), and what it tells it. */
export abstract class ArticleCanvasContext {
  public abstract readonly profile: Signal<EditorProfile>;
  /** of a mail: the events of its calendars as of now */
  public abstract readonly eventLines: Signal<Record<string, MailEventLine[]>>;
  public abstract readonly i18n: Signal<ArticleEditorI18n>;
  public abstract readonly device: Signal<ArticlePreviewDevice>;
  public abstract readonly dragEnabled: Signal<boolean>;
  public abstract readonly toolbarHost: Signal<ViewContainerRef | undefined>;
  /** where the cursor goes in one text; the end in every other one */
  public abstract readonly textCaret: Signal<CanvasCaret | undefined>;
  public abstract readonly errorIds: Signal<string[]>;
  public abstract readonly blocks: Signal<MailBlock[]>;
  public abstract readonly selectedId: Signal<string | undefined>;
  public abstract readonly editingId: Signal<string | undefined>;
  public abstract readonly title: Signal<string>;
  public abstract readonly subTitle: Signal<string>;
  public abstract readonly captionFallbacks: Signal<string[]>;
  public abstract act(id: string, action: FrameAction): void;
  public abstract editText(id: string, html: string): void;
  public abstract splitText(id: string, html: string): void;
  public abstract joinText(id: string, html: string): void;
  public abstract textFailed(id: string): void;
}

/** What readers do not see anyway (Angular's sanitizer drops it), a picture (a block of its own), and the engine's own history. */
const HIDDEN_FEATURES: readonly RichTextFeature[] = ['history', 'colors', 'align', 'indent', 'image'];

/**
 * One block in the canvas of the article editor (spec 1.175 §7.4, §7.5), or of a mail (1.176 §8.2): its drawing, the frame and its buttons, and the editor of a text.
 * Columns are projected. The frame takes no room: outline, buttons and «+» lie over the drawing, so a block stands where readers see it.
 * The host element is the frame; the canvas puts `cdkDrag` on it.
 */
@Component({
  selector: 'okr-article-canvas-block',
  standalone: true,
  imports: [ArticleBlockComponent, CdkDragHandle, CdkDragPlaceholder, CdkDragPreview, IonIcon, IonNote, MailEvents, MailGallery, RichTextInline, SvgIconPipe],
  host: {
    role: 'group',
    tabindex: '0',
    '[attr.data-block-id]': 'item().block.id',
    '[attr.aria-label]': 'label()',
    '[attr.aria-current]': `selected() ? 'true' : null`,
    '[class.selected]': 'selected()',
    '[class.error]': 'hasError()',
    '[class.is-columns]': `item().kind === 'columns'`,
  },
  styles: [`
    /* scrolled into sight together with its buttons and its «+» */
    :host { display: block; position: relative; scroll-margin: 44px 0 24px; outline: 0 solid transparent; cursor: pointer; }
    :host(:hover:not(:has(okr-article-canvas-block:hover))) { outline: 1px solid var(--ion-color-primary); }
    :host(.error) { outline: 2px solid var(--ion-color-danger); outline-offset: -1px; }
    :host(.selected) { outline: 2px solid var(--ion-color-primary); outline-offset: 0; }
    :host(.selected.error) { outline-color: var(--ion-color-danger); }
    :host(:focus-visible) { outline: 3px solid var(--ion-color-primary); outline-offset: 0; }
    :host(.error:focus-visible) { outline-color: var(--ion-color-danger); }

    /* the buttons stay in sight when a long block is scrolled; the rail itself takes no room */
    .rail { position: sticky; top: 44px; z-index: 20; height: 0; }
    .tools { position: absolute; bottom: 3px; left: -2px; display: flex; border-radius: 6px; overflow: hidden; background: var(--ion-color-primary); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
    :host(.tools-end) .tools { left: auto; right: -2px; }
    .tools button { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; background: transparent; color: var(--ion-color-primary-contrast); cursor: pointer; }
    @media (pointer: coarse) { .tools button { width: 40px; height: 40px; } }
    .tools button:hover:not(:disabled) { background: var(--ion-color-primary-shade); }
    .tools button:focus-visible { outline: 2px solid var(--ion-color-primary-contrast); outline-offset: -4px; }
    .tools button:disabled { opacity: 0.4; cursor: not-allowed; }
    .tools .handle { cursor: grab; }
    .tools ion-icon { font-size: 1.1rem; }

    .mark { position: absolute; top: 0; right: 0; z-index: 5; font-size: 1.3rem; color: var(--ion-color-danger); background: var(--ion-background-color, #fff); border-radius: 50%; }
    .tab { display: none; position: absolute; top: 100%; left: -2px; z-index: 10; padding: 2px 8px; border-radius: 0 0 6px 6px; font-size: 0.75rem; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); }
    :host(.is-columns:hover) > .tab, :host(.is-columns.selected) > .tab, :host(.is-columns:has(.selected)) > .tab, :host(.is-columns:focus-visible) > .tab { display: block; }

    .plus { position: absolute; top: 100%; left: 50%; z-index: 15; transform: translate(-50%, -50%); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
            padding: 0; border: 2px solid var(--ion-color-primary-contrast); border-radius: 50%; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); cursor: pointer; }
    .plus:disabled { opacity: 0.4; cursor: not-allowed; }
    .plus:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .full { position: absolute; top: calc(100% + 18px); left: 50%; z-index: 15; transform: translateX(-50%); width: max-content; max-width: 100%; padding: 2px 8px; border-radius: 4px; background: var(--ion-background-color, #fff); font-size: 0.75rem; }

    .empty-text ::ng-deep .html { opacity: 0.6; }
    .place { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 64px; margin: 5px; padding: 8px 12px; border: 1px dashed currentColor; border-radius: 8px; font-size: 0.9rem; text-align: center; }
    .place ion-icon { flex: none; font-size: 1.4rem; }
    .failed { display: block; padding: 0 10px 8px; }

    .preview { padding: 10px 16px; border-radius: 8px; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); font-size: 0.85rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
    .drop-here { display: flex; align-items: center; justify-content: center; height: 40px; box-sizing: border-box; border: 2px dashed var(--ion-color-primary); border-radius: 8px; color: var(--ion-color-primary); font-size: 0.85rem; }
  `],
  template: `
    @let t = canvas.i18n();
    @let block = item().block;
    @if (selected()) {
      <div class="rail" data-canvas-tool>
        <div class="tools" role="toolbar" [attr.aria-label]="toolsLabel()">
          @if (canvas.dragEnabled()) {
            <button type="button" class="handle" cdkDragHandle tabindex="-1" [title]="t.article_editor_frame_drag()" [attr.aria-label]="t.article_editor_frame_drag()">
              <ion-icon src="{{ 'reorder-four' | svgIcon }}" aria-hidden="true" />
            </button>
          }
          <button type="button" data-action="up" [disabled]="!can().up" [title]="t.article_editor_frame_up()" [attr.aria-label]="t.article_editor_frame_up()" (click)="canvas.act(block.id, 'up')">
            <ion-icon src="{{ 'arrow-up' | svgIcon }}" aria-hidden="true" />
          </button>
          <button type="button" data-action="down" [disabled]="!can().down" [title]="t.article_editor_frame_down()" [attr.aria-label]="t.article_editor_frame_down()" (click)="canvas.act(block.id, 'down')">
            <ion-icon src="{{ 'arrow-down' | svgIcon }}" aria-hidden="true" />
          </button>
          <button type="button" data-action="duplicate" [disabled]="!can().duplicate" [title]="t.article_editor_frame_duplicate()" [attr.aria-label]="t.article_editor_frame_duplicate()" (click)="canvas.act(block.id, 'duplicate')">
            <ion-icon src="{{ 'copy' | svgIcon }}" aria-hidden="true" />
          </button>
          <button type="button" data-action="delete" [title]="t.article_editor_frame_delete()" [attr.aria-label]="t.article_editor_frame_delete()" (click)="canvas.act(block.id, 'delete')">
            <ion-icon src="{{ 'trash' | svgIcon }}" aria-hidden="true" />
          </button>
        </div>
      </div>
    }
    @if (hasError()) {
      <ion-icon class="mark" src="{{ 'alert-circle' | svgIcon }}" role="img" [title]="t.article_editor_error_mark()" [attr.aria-label]="t.article_editor_error_mark()" />
    }
    @switch (item().kind) {
      @case ('columns') {
        <ng-content />
        @if (item().noColumns) { <div class="place">{{ label() }}</div> }
        <span class="tab" aria-hidden="true">{{ label() }}</span>
      }
      @case ('unknown') {
        <div class="place">{{ label() }}</div>
      }
      @default {
        @if (mailGallery(); as gallery) {
          <okr-mail-gallery [block]="gallery" />
        } @else if (events(); as events) {
          <okr-mail-events [title]="events.title" [lines]="events.lines" />
        } @else if (drawn(); as view) {
          <okr-article-block [class.empty-text]="!item().view" [class.after-header]="afterHeader()" [class.classic-button]="classicButton()" [view]="view" [captionFallbacks]="canvas.captionFallbacks()"
            [title]="titled() ? canvas.title() : ''" [subTitle]="titled() ? canvas.subTitle() : ''" [previewDevice]="canvas.device()" [paused]="true" [inert]="true" [classicText]="classicText()" [textEditor]="editing() ? editor : undefined" />
        } @else {
          <div class="place">
            @if (icon(); as name) { <ion-icon src="{{ name | svgIcon }}" aria-hidden="true" /> }
            <span>{{ placeholder() }}</span>
          </div>
        }
      }
    }
    @if (failed() && selected()) {
      <ion-note class="failed" color="danger" role="alert">{{ t.article_editor_canvas_textFailed() }}</ion-note>
    }
    @if (selected() && addBelow()) {
      <button type="button" class="plus" data-canvas-tool data-action="add" [disabled]="full()" [title]="t.article_editor_add_below()" [attr.aria-label]="t.article_editor_add_below()" (click)="canvas.act(block.id, 'add')">
        <ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" />
      </button>
      @if (full()) { <span class="full" data-canvas-tool>{{ fullNote() }}</span> }
    }
    <div *cdkDragPreview class="preview">{{ label() }}</div>
    <div *cdkDragPlaceholder class="drop-here">{{ t.article_editor_canvas_dropHere() }}</div>

    <!-- stands inside the drawn text, so that it has its width, font and alignment -->
    <ng-template #editor>
      @if (!ready()) { <div [innerHTML]="drawnHtml()"></div> }
      <okr-rich-text-inline [value]="html()" [placeholder]="t.article_editor_canvas_textPlaceholder()" [hiddenFeatures]="hiddenFeatures" [blockEditing]="block.type === 'text'"
        [toolbarHost]="canvas.toolbarHost()" [caret]="caret()" (valueChange)="canvas.editText(block.id, $event)" (split)="canvas.splitText(block.id, $event)"
        (join)="canvas.joinText(block.id, $event)" (ready)="onReady()" (failed)="onFailed()" />
    </ng-template>
  `,
})
export class ArticleCanvasBlock {
  protected readonly canvas = inject(ArticleCanvasContext);
  private readonly changeDetector = inject(ChangeDetectorRef);

  // inputs
  public readonly item = input.required<CanvasItem>();
  public readonly inColumn = input(false);
  /** right below the header in its column */
  public readonly afterHeader = input(false);
  /** title and subtitle stand on the images (a slideshow) */
  public readonly titled = input(false);
  public readonly classicText = input(false);
  public readonly classicButton = input(false);
  /** a «+» below the selected block; not for the last one, which has the «+» of the article below it */
  public readonly addBelow = input(true);

  protected readonly hiddenFeatures = HIDDEN_FEATURES;
  // computed
  protected readonly selected = computed(() => this.canvas.selectedId() === this.item().block.id);
  protected readonly editing = computed(() => this.canvas.editingId() === this.item().block.id);
  /** the engine of the text being edited shows it; until then its drawing stays */
  protected readonly ready = linkedSignal({ source: this.editing, computation: () => false });
  /** it could not be loaded: until the next try */
  protected readonly failed = linkedSignal<boolean, boolean>({ source: this.editing, computation: (editing, before) => !editing && (before?.value ?? false) });
  protected readonly hasError = computed(() => this.canvas.errorIds().includes(this.item().block.id));
  protected readonly label = computed(() => blockTypeLabel(this.canvas.i18n(), this.item().kind === 'unknown' ? '' : this.item().block.type));
  protected readonly toolsLabel = computed(() => fill(this.canvas.i18n().article_editor_frame_toolbar(), { block: this.label() }));
  protected readonly icon = computed(() => ARTICLE_BLOCK_ICONS[this.item().block.type] as string | undefined);
  protected readonly full = computed(() => !this.inColumn() && !canAddBlock(this.canvas.blocks()));
  protected readonly fullNote = computed(() => fill(this.canvas.i18n().article_editor_library_full(), { max: ARTICLE_BLOCKS_MAX }));
  /** only asked for the selected block */
  protected readonly can = computed(() => {
    const blocks = this.canvas.blocks();
    const id = this.item().block.id;
    return {
      up: moveBlockBy(blocks, id, -1) !== blocks,
      down: moveBlockBy(blocks, id, 1) !== blocks,
      duplicate: this.item().kind !== 'unknown' && duplicateBlock(blocks, id, () => '', this.canvas.profile()) !== undefined,
    };
  });
  /** an empty text shows a placeholder where it will stand */
  protected readonly drawn = computed((): ArticleBlockView | undefined => {
    const { block, view } = this.item();
    if (view || this.item().kind !== 'block') return view;
    const html = `<p>${this.canvas.i18n().article_editor_canvas_textPlaceholder()}</p>`;
    if (block.type === 'text') return { key: block.id, type: 'text', html, align: block.align ?? 'left' };
    if (block.type === 'callout') return { key: block.id, type: 'callout', html, tone: block.tone ?? 'neutral' };
    return undefined;
  });
  /** of a mail, with a picture: not the gallery that readers of an article see */
  protected readonly mailGallery = computed(() => {
    const { block } = this.item();
    return this.canvas.profile().galleryPairs && block.type === 'gallery' && !isPictureMissing(block) ? block : undefined;
  });
  /** of a mail: the lines there are */
  protected readonly events = computed(() => {
    const { block } = this.item();
    const lines = mailEventsDrawn(block, this.canvas.eventLines());
    return block.type === 'events' && lines.length > 0 ? { title: typeof block.title === 'string' ? block.title : '', lines } : undefined;
  });
  protected readonly drawnHtml = computed(() => {
    const view = this.drawn();
    return view && 'html' in view ? view.html : '';
  });
  /** the stored text, with its placeholders */
  protected readonly html = computed(() => {
    const { block } = this.item();
    return 'html' in block && typeof block.html === 'string' ? block.html : '';
  });
  protected readonly placeholder = computed(() => {
    const i18n = this.canvas.i18n();
    const { block } = this.item();
    switch (block.type) {
      case 'image': return `${this.label()}: ${i18n.article_editor_canvas_imagePlaceholder()}`;
      case 'gallery': return `${this.label()}: ${i18n.article_editor_canvas_galleryPlaceholder()}`;
      case 'events': {
        const texts = { choose: i18n.article_editor_mail_events_choose, later: i18n.article_editor_mail_events_later, none: i18n.article_editor_mail_events_none };
        return `${this.label()}: ${texts[eventsNote(block, this.canvas.eventLines()) ?? 'later']()}`;
      }
      // the text names the button itself
      default: return i18n.article_editor_canvas_buttonPlaceholder();
    }
  });
  protected readonly caret = computed((): RichTextCaret => {
    const caret = this.canvas.textCaret();
    return caret?.id === this.item().block.id ? caret.at : 'end';
  });

  protected onReady(): void {
    this.ready.set(true);
    // at once, or drawing and engine stand there together for a frame
    this.changeDetector.detectChanges();
  }

  protected onFailed(): void {
    this.failed.set(true);
    this.canvas.textFailed(this.item().block.id);
  }
}
