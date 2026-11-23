import { CdkDrag, CdkDragDrop, CdkDropList, type DragRef, type Point } from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  Component, DestroyRef, ElementRef, Injector, ViewContainerRef, afterNextRender, computed, effect, forwardRef, inject, input, linkedSignal, output, signal, untracked,
} from '@angular/core';
import { ActionSheetController, IonIcon, IonNote } from '@ionic/angular';

import {
  ARTICLE_BLOCK_ICONS, ARTICLE_BLOCKS_MAX, type ArticleEditorI18n, type ArticlePreviewDevice, BlockViewCache, type BlockPlace, allowedTypesAt,
  articleBackground, articleColumnsForm, articleHeaderPlace, blockTypeLabel, blocksInOrder, canAddBlock, columnsTemplate, createBlock, duplicateBlock, findBlock,
  getSectionIntro, insertBlock, joinWithAbove, moveBlockBy, removeBlock, replaceBlock,
} from '@okr/cms-section-util';
import { ENV } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { ARTICLE_BLOCK_TYPES, type ArticleBlock, type ArticleBlockType, type ArticleSection, articleBlocksOf, isFreeArticle } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { OptionalCardHeader } from '@okr/shared-ui';
import type { RichTextCaret } from '@okr/shared-ui-editor';
import { createActionSheetButton, createActionSheetOptions } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';

import { ARTICLE_COLUMNS_STYLES, ARTICLE_LIST_PADDING } from './article-block';
import { ArticleCanvasBlock, ArticleCanvasContext, type CanvasCaret, type CanvasItem, type FrameAction } from './article-canvas-block';
import { canDropAt, dropChange, parentId, type CanvasChange } from './article-canvas.util';
import { ARTICLE_FRAME_STYLES, ArticleFrame } from './article-frame';

export type { CanvasCaret } from './article-canvas-block';
export type { CanvasChange } from './article-canvas.util';

/** What a dragged block of the canvas carries (`cdkDragData`); an entry of the library carries `NewBlockDrag`. */
export interface BlockDrag { id: string; type: ArticleBlockType; isColumnsChild: boolean }
type DragData = Partial<BlockDrag> & { newType?: ArticleBlockType };
/** Where a drop list stands (`cdkDropListData`). */
type ListPlace = Omit<BlockPlace, 'index'>;
interface CanvasColumn { index: number; place: ListPlace; items: CanvasItem[] }
/** An item of the top level; columns with what their grid needs. */
type TopItem = CanvasItem & { columns: CanvasColumn[]; template: string; stackReverse: boolean; headerColumn?: number };

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const objects = <T>(value: unknown): T[] => (Array.isArray(value) ? value.filter(isObject) as T[] : []);
const EDITED_TEXT = 'okr-rich-text-inline [contenteditable="true"]';
let canvases = 0;

/**
 * The canvas of the article editor (spec 1.175 §7.2, §7.4, §7.5): the article as readers see it, with a frame around every block, texts
 * edited in place, and dragging. It holds no state of the article.
 *
 * The contract of the host:
 * - It applies every `change` (blocks and selection) and every `selectBlock` at once, in the handler: the canvas goes on from what it
 *   emitted, and a text being typed must get its own html back with the next rendering.
 * - `caret`: `{ id: change.selectedId, at: change.caret }` for a change that has one; it stays while typing. Undefined on undo, redo and `selectBlock`.
 * - After undo or redo it calls `focusSelected()`.
 *
 * Only reachable through the lazily loaded editor: not exported from the lib, never imported by what readers load.
 */
@Component({
  selector: 'okr-article-canvas',
  standalone: true,
  imports: [ArticleCanvasBlock, ArticleFrame, CdkDrag, CdkDropList, CdkScrollable, IonIcon, IonNote, OptionalCardHeader, SvgIconPipe],
  providers: [{ provide: ArticleCanvasContext, useExisting: forwardRef(() => ArticleCanvas) }],
  host: {
    '(keydown)': 'onKeydown($event)',
    '(auxclick)': 'onAuxClick($event)',
    '(dragstart)': 'onNativeDrag($event)',
  },
  styles: [ARTICLE_FRAME_STYLES, ARTICLE_COLUMNS_STYLES, `
    :host { display: block; height: 100%; min-height: 0; }
    .scroller { height: 100%; overflow: auto; background: var(--ion-color-light); }
    /* the buttons of the first block stand in the padding. Not on the scroller: it would shift what is sticky */
    .room { padding: 48px 16px 64px; }
    .scroller.auto .room { padding-inline: 0; }
    /* as wide as the device; a canvas with less room scrolls sideways */
    .page { margin-inline: auto; background: var(--ion-background-color, #fff); color: var(--ion-text-color, #000); }
    .page.mobile { width: 390px; }
    .page.tablet { width: 768px; }
    .page.desktop { max-width: 1100px; }
    /* buttons and frames reach over the edge of the card */
    .page ::ng-deep okr-article-frame > ion-card { overflow: visible; contain: layout style; }

    .list { padding: ${ARTICLE_LIST_PADDING}; }
    .list.classic-text { padding: 0; }
    /* the button of a classic article stands under its grid, not in it, and with nothing below it */
    .list:not(.classic-text) ::ng-deep okr-article-block.classic-button { margin: 5px -5px -5px; }
    .list ::ng-deep okr-article-block.classic-button .block { padding-bottom: 0; }
    .empty { padding: 16px; text-align: center; }
    .column.empty-column { display: flex; flex-direction: column; justify-content: center; min-height: 64px; margin: 5px; border: 1px dashed currentColor; border-radius: 8px; }
    .add { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px; }
    .add button { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 50%; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); cursor: pointer; }
    .add button:disabled { opacity: 0.4; cursor: not-allowed; }
    .add button:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
  `],
  template: `
    @let t = i18n();
    <div class="scroller" cdkScrollable role="region" [class]="device()" [attr.aria-label]="t.article_editor_canvas_label()">
      <div class="room">
        <div class="page" [class]="device()">
          <okr-article-frame [section]="section()" [headerPlace]="headerPlace()">
            <div class="list" cdkDropList [id]="topListId" [class.classic-text]="classicText()" [cdkDropListData]="topPlace" [cdkDropListConnectedTo]="dropLists()"
              [cdkDropListEnterPredicate]="mayEnter" [cdkDropListDisabled]="!dragEnabled()" [cdkDropListAutoScrollStep]="8" (cdkDropListDropped)="onDrop($event)" (cdkDropListExited)="switching = true" (cdkDropListEntered)="switching = false">
              @for (item of items(); track item.block.id; let last = $last) {
                @let first = item.block.id === firstDrawnId();
                <okr-article-canvas-block cdkDrag [item]="item" [addBelow]="!last" [titled]="first && headerPlace() === 'slideshow'" [classicText]="classicText()" [classicButton]="item.block.id === classicButtonId()"
                  [cdkDragData]="dragData(item, false)" [cdkDragDisabled]="!mayDrag(item)" [cdkDragConstrainPosition]="dragPoint" (cdkDragStarted)="onDragStart()">
                  @if (item.kind === 'columns') {
                    <div class="columns" [class]="columnsForm()" [style.--columns]="item.template">
                      @for (column of item.columns; track column.index) {
                        @let withHeader = first && headerPlace() === 'column' && item.headerColumn === column.index;
                        <div class="column" role="group" [attr.aria-label]="columnLabel(column.index)" [class.empty-column]="column.items.length === 0" [style.--stack-order]="item.stackReverse ? -$index : null"
                          cdkDropList [id]="listId(item.block.id, column.index)" [cdkDropListData]="column.place" [cdkDropListConnectedTo]="dropLists()"
                          [cdkDropListEnterPredicate]="mayEnter" [cdkDropListDisabled]="!dragEnabled()" [cdkDropListAutoScrollStep]="8" (cdkDropListDropped)="onDrop($event)" (cdkDropListExited)="switching = true" (cdkDropListEntered)="switching = false">
                          @if (withHeader) {
                            <div class="header">
                              <okr-optional-card-header [intro]="intro().text" [introPosition]="intro().position" [title]="title()" [subTitle]="subTitle()" />
                            </div>
                          }
                          @for (inner of column.items; track inner.block.id; let firstInner = $first) {
                            <okr-article-canvas-block cdkDrag [class.tools-end]="column.index > 0" [item]="inner" [inColumn]="true" [afterHeader]="withHeader && firstInner"
                              [cdkDragData]="dragData(inner, true)" [cdkDragDisabled]="!mayDrag(inner)" [cdkDragConstrainPosition]="dragPoint" (cdkDragStarted)="onDragStart()" />
                          } @empty {
                            <div class="add" data-canvas-tool>
                              <button type="button" [title]="t.article_editor_add_inColumn()" [attr.aria-label]="t.article_editor_add_inColumn()" (click)="addToColumn(column.place)">
                                <ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" />
                              </button>
                            </div>
                          }
                        </div>
                      }
                    </div>
                  }
                </okr-article-canvas-block>
              } @empty {
                <div class="empty">{{ t.article_editor_canvas_empty() }}</div>
              }
            </div>
          </okr-article-frame>
        </div>
        <div class="add" data-canvas-tool>
          <button type="button" data-add-end [disabled]="full()" [title]="t.article_editor_add_atEnd()" [attr.aria-label]="t.article_editor_add_atEnd()" (click)="add({ index: blocks().length })">
            <ion-icon src="{{ 'add' | svgIcon }}" aria-hidden="true" />
          </button>
          @if (full()) { <ion-note>{{ fullNote() }}</ion-note> }
        </div>
      </div>
    </div>
  `,
})
export class ArticleCanvas extends ArticleCanvasContext {
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly appStore = inject(AppStore);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly imgixBaseUrl = inject(ENV).services.imgixBaseUrl;
  private readonly injector = inject(Injector);
  private readonly viewCache = new BlockViewCache((html) => this.appStore.replacePlaceholders(html));

  // inputs
  public readonly section = input.required<ArticleSection>();
  public readonly selectedId = input<string>();
  /** blocks with a red mark */
  public readonly errorIds = input<string[]>([]);
  /** 'auto' = the real viewport and all the room there is (a phone) */
  public readonly device = input<ArticlePreviewDevice>('desktop');
  public readonly dragEnabled = input(true);
  /** where the toolbar of the text being edited is created */
  public readonly toolbarHost = input<ViewContainerRef>();
  /** where the cursor goes in a text; the end for every other one, or where it was clicked */
  public readonly caret = input<CanvasCaret>();
  public readonly i18n = input.required<ArticleEditorI18n>();

  // outputs
  public readonly selectBlock = output<string | undefined>();
  // eslint-disable-next-line @angular-eslint/no-output-native -- no native change event bubbles out of the canvas
  public readonly change = output<CanvasChange>();

  // computed
  public readonly blocks = computed((): ArticleBlock[] => articleBlocksOf(this.section()) ?? []);
  public readonly title = computed(() => this.appStore.replacePlaceholders(this.section().title ?? ''));
  public readonly subTitle = computed(() => this.appStore.replacePlaceholders(this.section().subTitle ?? ''));
  public readonly captionFallbacks = computed(() => [this.subTitle(), this.title()]);
  protected readonly intro = computed(() => {
    const intro = getSectionIntro(this.section());
    return { ...intro, text: this.appStore.replacePlaceholders(intro.text) };
  });
  protected readonly items = computed(() => objects<ArticleBlock>(this.blocks()).map((block) => this.topItem(block)));
  protected readonly headerPlace = computed(() => articleHeaderPlace(this.blocks(), !!articleBackground(this.section().properties)));
  /** the first block that readers see; it may carry the header */
  protected readonly firstDrawnId = computed(() => this.items().find((item) => item.view)?.block.id);
  protected readonly columnsForm = computed(() => articleColumnsForm(this.device()));
  protected readonly full = computed(() => !canAddBlock(this.blocks()));
  protected readonly fullNote = computed(() => fill(this.i18n().article_editor_library_full(), { max: ARTICLE_BLOCKS_MAX }));
  /** drawn by readers as a classic article of only a text, also with a button under it (design §8) */
  protected readonly classicText = computed(() => {
    const [first, second, third] = this.blocks();
    if (first?.type !== 'text' || (first.align ?? 'left') !== 'left') return false;
    return second === undefined || (second.type === 'button' && third === undefined && !isFreeArticle(this.section()));
  });
  /** the button of a classic article */
  protected readonly classicButtonId = computed(() => {
    const last = this.blocks().at(-1);
    return last?.type === 'button' && !isFreeArticle(this.section()) ? last.id : undefined;
  });
  /** the drop lists, the inner ones first: the CDK takes the first one under the pointer. For the library of the host */
  public readonly dropLists = computed(() => [
    ...this.items().flatMap((item) => item.columns.map((column) => this.listId(item.block.id, column.index))), this.topListId,
  ]);

  private readonly clickCaret = signal<CanvasCaret | undefined>(undefined);
  public readonly textCaret = computed(() => this.clickCaret() ?? this.caret());
  /** a text whose frame is selected, not its content (Esc) */
  private readonly framed = linkedSignal<string | undefined, boolean>({
    source: this.selectedId, computation: (id) => id !== undefined && id === this.frameOnly,
  });
  /** the text being edited */
  public readonly editingId = computed(() => {
    const id = this.selectedId();
    if (id === undefined || this.framed()) return undefined;
    const found = findBlock(this.blocks(), id);
    return found && kindOf(found.block, found.place.columnsId !== undefined) === 'block' && isTextual(found.block) ? id : undefined;
  });

  protected readonly topListId = `article-canvas-${++canvases}`;
  protected readonly topPlace: ListPlace = {};
  /** between leaving one list and entering the next, lists are asked whether they can receive, not whether the pointer is over them */
  protected switching = false;

  /** what was emitted since the last rendering: the next action goes on from it */
  private pending: { blocks: ArticleBlock[]; selectedId?: string } | undefined;
  /** the block whose frame is to be selected next, without editing its text */
  private frameOnly: string | undefined;
  /** the selection as this canvas knows it; another one came from the host */
  private knownSelection: string | undefined;
  /** where the mouse went down */
  private downId: string | undefined;
  /** of a drag: where it began, and the point that counts now */
  private pickedUp: Point | undefined;
  private pointer: Point | undefined;
  private destroyed = false;

  constructor() {
    super();
    // capture: the block is selected whatever is clicked in it
    const onClick = (event: MouseEvent): void => this.onClick(event);
    const onDown = (event: MouseEvent): void => { this.downId = this.idOf(event.target as Element); };
    this.element.addEventListener('click', onClick, { capture: true });
    this.element.addEventListener('mousedown', onDown, { capture: true });
    // a block selected by the host (panel, undo) comes into sight
    effect(() => {
      const id = this.selectedId();
      untracked(() => this.framed());
      this.frameOnly = undefined;
      if (id === this.knownSelection) return;
      this.knownSelection = id;
      if (id !== undefined) afterNextRender(() => this.frameOf(id)?.scrollIntoView({ block: 'nearest' }), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.element.removeEventListener('click', onClick, { capture: true });
      this.element.removeEventListener('mousedown', onDown, { capture: true });
    });
  }

  /** Puts the focus into the selected text, or onto the frame of the selected block (after undo, redo and buttons outside). */
  public focusSelected(): void {
    this.clickCaret.set(undefined);
    afterNextRender(() => {
      const id = this.selectedId();
      if (id !== undefined) this.focusNow(id);
    }, { injector: this.injector });
  }

  // ------------------------------------------------- what the blocks tell ------------------------------------------------

  public act(id: string, action: FrameAction): void {
    const blocks = this.blocksNow();
    switch (action) {
      case 'up': case 'down': return this.move(id, action === 'up' ? -1 : 1, action);
      case 'duplicate': {
        const copy = duplicateBlock(blocks, id, newId);
        if (!copy) return;
        this.emit({ blocks: copy.blocks, selectedId: copy.id, copies: copy.copies });
        return this.focusFrame(copy.id);
      }
      case 'delete': return this.remove(id);
      case 'add': {
        const found = findBlock(blocks, id);
        if (found) void this.add({ ...found.place, index: found.place.index + 1 });
      }
    }
  }

  public editText(id: string, html: string): void {
    const blocks = this.withHtml(this.blocksNow(), id, html);
    // the selection as it is: a text may hand over its last words when another block was already clicked
    if (blocks !== this.blocksNow()) this.emit({ blocks, selectedId: this.selectedNow(), tag: `text:${id}` });
  }

  public splitText(id: string, html: string): void {
    const blocks = this.withHtml(this.blocksNow(), id, html);
    const found = findBlock(blocks, id);
    if (!found) return;
    const block = createBlock('text', newId);
    const next = insertBlock(blocks, block, { ...found.place, index: found.place.index + 1 });
    if (next !== blocks) this.emit({ blocks: next, selectedId: block.id, caret: 'start' });
  }

  public joinText(id: string, html: string): void {
    const joined = joinWithAbove(this.withHtml(this.blocksNow(), id, html), id);
    if (!joined) return;
    this.emit({
      blocks: joined.blocks, selectedId: joined.id, caret: joined.joined ? { afterHtml: joined.upperHtml } : 'end',
      ...(joined.joined ? { copies: { [id]: joined.id } } : {}),
    });
  }

  public textFailed(id: string): void {
    if (this.selectedNow() !== id) return;
    this.framed.set(true);
    this.focusFrame(id);
  }

  // ------------------------------------------------- mouse and keyboard --------------------------------------------------

  private onClick(event: MouseEvent): void {
    const target = event.target as Element;
    if (target.closest('[data-canvas-tool]')) return;
    if (target.closest('a')) event.preventDefault();
    const id = this.idOf(target);
    // text selected with the mouse beyond its block: the click belongs to what is around both
    if (event.detail > 0 && id !== this.downId) return;
    if (id === undefined) return this.select(undefined);
    if (target.closest('okr-rich-text-inline')) return;
    if (target.closest('button, ion-button')) event.preventDefault();
    this.open(id, clickedCaret(event));
  }

  protected onAuxClick(event: MouseEvent): void {
    if ((event.target as Element).closest('a')) event.preventDefault();
  }

  /** pictures and links of the article are not dragged by the browser */
  protected onNativeDrag(event: DragEvent): void {
    if (!(event.target instanceof Element) || !event.target.closest('okr-rich-text-inline')) event.preventDefault();
  }

  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as Element;
    const id = this.idOf(target);
    if (event.isComposing) return;
    const inText = !!target.closest('okr-rich-text-inline');
    if (event.key === 'Escape') return this.onEscape(event, inText);
    if (id === undefined) return;
    // the keys of a text and of the buttons are theirs
    if (inText || target.closest('[data-canvas-tool]')) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      return this.open(id);
    }
    if (target !== this.frameOf(id)) return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.move(id, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove(id);
    }
  }

  /** Text → its frame → the block around it → nothing. With nothing selected the key is the host's. */
  private onEscape(event: KeyboardEvent, inText: boolean): void {
    const selected = this.selectedNow();
    if (selected === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (inText) {
      this.framed.set(true);
      return this.focusFrame(selected);
    }
    const parent = parentId(this.blocksNow(), selected);
    this.select(parent);
    this.focusFrame(parent ?? selected);
  }

  /** Selects the block; a text is edited, with the cursor where it was clicked. */
  private open(id: string, at?: RichTextCaret): void {
    if (id === this.selectedNow()) this.framed.set(false);
    else this.select(id);
    this.clickCaret.set(at && { id, at });
    const found = findBlock(this.blocksNow(), id);
    // what was clicked is in sight
    if (found && !isTextual(found.block)) afterNextRender(() => this.frameOf(id)?.focus({ preventScroll: true }), { injector: this.injector });
  }

  // ------------------------------------------------------- actions -------------------------------------------------------

  /** Asks for the type and adds a block. */
  protected async add(place: BlockPlace): Promise<void> {
    const i18n = this.i18n();
    const options = createActionSheetOptions(i18n.article_editor_add_title());
    for (const type of allowedTypesAt(place)) {
      options.buttons.push(createActionSheetButton(type, blockTypeLabel(i18n, type), this.imgixBaseUrl, ARTICLE_BLOCK_ICONS[type]));
    }
    options.buttons.push(createActionSheetButton('cancel', i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    // not before: Ionic gives the focus back to the button, and the new text takes it
    const { data } = await sheet.onDidDismiss<{ action?: string }>();
    const type = ARTICLE_BLOCK_TYPES.find((known) => known === data?.action);
    if (!type || this.destroyed) return;
    const change = dropChange(this.blocksNow(), { newType: type }, place, newId);
    if (!change?.selectedId) return;
    this.emit(change);
    this.focusFrame(change.selectedId);
  }

  protected addToColumn(place: ListPlace): void { void this.add({ ...place, index: 0 }); }

  private move(id: string, delta: -1 | 1, button?: 'up' | 'down'): void {
    const blocks = this.blocksNow();
    const next = moveBlockBy(blocks, id, delta);
    if (next === blocks) return;
    const editing = this.editingId() === id;
    this.emit({ blocks: next, selectedId: id }, !editing);
    // moving the element takes the focus from it
    this.focusFrame(id, button);
  }

  private remove(id: string): void {
    const blocks = this.blocksNow();
    const next = removeBlock(blocks, id);
    if (next === blocks) return;
    const neighbour = this.neighbourOf(blocks, id);
    this.emit({ blocks: next });
    if (neighbour !== undefined) this.focusFrame(neighbour);
    else afterNextRender(() => this.element.querySelector<HTMLElement>('[data-add-end]')?.focus(), { injector: this.injector });
  }

  /** the block that gets the focus when this one is gone */
  private neighbourOf(blocks: ArticleBlock[], id: string): string | undefined {
    const place = findBlock(blocks, id)?.place;
    const list = blocksInOrder(blocks).filter((b) => parentId(blocks, b.id) === place?.columnsId && findBlock(blocks, b.id)?.place.column === place?.column);
    const at = list.findIndex((b) => b.id === id);
    return (list[at + 1] ?? list[at - 1])?.id ?? place?.columnsId;
  }

  // ------------------------------------------------------- dragging ------------------------------------------------------

  protected listId(columnsId: string, column: number): string { return `${this.topListId}-${columnsId}-${column}`; }
  protected dragData(item: CanvasItem, isColumnsChild: boolean): BlockDrag { return { id: item.block.id, type: item.block.type, isColumnsChild }; }
  /** without a handle the whole block could be dragged */
  protected mayDrag(item: CanvasItem): boolean { return this.dragEnabled() && this.selectedId() === item.block.id; }

  protected readonly mayEnter = (drag: CdkDrag<DragData>, list: CdkDropList<ListPlace>): boolean => {
    const { newType, type, isColumnsChild } = drag.data;
    const dragged = newType ?? type;
    if (!dragged || !canDropAt({ type: dragged, isNew: newType !== undefined, isColumnsChild }, list.data, this.full())) return false;
    return list.data.columnsId !== undefined || !this.isOverOwnColumn(drag);
  };

  /**
   * The CDK does not count the list a block comes from among its candidates, so the top level around it would take the block while
   * it is still over its own column.
   */
  private isOverOwnColumn(drag: CdkDrag<DragData>): boolean {
    if (!drag.data.isColumnsChild || this.switching || !this.pointer) return false;
    const over = document.elementFromPoint(this.pointer.x, this.pointer.y);
    return !!over && drag.dropContainer.element.nativeElement.contains(over);
  }

  protected onDragStart(): void {
    this.switching = false;
    this.pickedUp = undefined;
    this.pointer = undefined;
  }

  /**
   * The handle stands above its block, over the one before: without this, a block that is hardly moved would already change places
   * with that one. So the point that counts starts inside the block and comes to the pointer while that moves away.
   */
  protected readonly dragPoint = (point: Point, _drag: DragRef, block: DOMRect): Point => {
    this.pickedUp ??= point;
    const above = Math.max(0, block.top + Math.min(block.height / 2, 30) - this.pickedUp.y);
    const moved = Math.hypot(point.x - this.pickedUp.x, point.y - this.pickedUp.y);
    this.pointer = { x: point.x, y: point.y + above * Math.min(1, Math.max(0, 1 - (moved - 24) / 72)) };
    return this.pointer;
  };

  protected onDrop(event: CdkDragDrop<ListPlace, unknown, DragData>): void {
    // let go outside the canvas: nothing
    const { left, right, top, bottom } = this.element.getBoundingClientRect();
    const { x, y } = event.dropPoint;
    if (x < left || x > right || y < top || y > bottom) return this.focusDragged(event.item.data);
    const editing = this.editingId();
    const change = dropChange(this.blocksNow(), event.item.data, { ...event.container.data, index: event.currentIndex }, newId);
    if (!change?.selectedId) return this.focusDragged(event.item.data);
    this.emit(change, event.item.data.id !== undefined && editing !== event.item.data.id);
    this.focusFrame(change.selectedId);
  }

  /** dragging takes the focus from a block also when it stays where it was */
  private focusDragged({ id }: DragData): void {
    if (id !== undefined) this.focusFrame(id);
  }

  // -------------------------------------------------------- inside -------------------------------------------------------

  protected columnLabel(index: number): string { return fill(this.i18n().article_editor_canvas_column(), { n: index + 1 }); }

  private topItem(block: ArticleBlock): TopItem {
    const item = this.item(block, false);
    const none = { ...item, columns: [], template: '', stackReverse: false };
    if (block.type !== 'columns') return none;
    const stored = Array.isArray(block.columns) ? block.columns : [];
    const columns = stored.map((column, index) => ({ column, index })).filter(({ column }) => isObject(column));
    return {
      ...item, noColumns: columns.length === 0,
      columns: columns.map(({ column, index }) => ({ index, place: { columnsId: block.id, column: index }, items: objects<ArticleBlock>(column.blocks).map((inner) => this.item(inner, true)) })),
      template: columnsTemplate(columns.map(({ column }) => column.size)), stackReverse: block.stackReverse === true,
      headerColumn: item.view?.type === 'columns' ? item.view.headerColumn : undefined,
    };
  }

  private item(block: ArticleBlock, inColumn: boolean): CanvasItem {
    return { kind: kindOf(block, inColumn), block, view: this.viewCache.view(block) };
  }

  private blocksNow(): ArticleBlock[] { return this.pending?.blocks ?? this.blocks(); }
  private selectedNow(): string | undefined { return this.pending ? this.pending.selectedId : this.selectedId(); }

  private withHtml(blocks: ArticleBlock[], id: string, html: string): ArticleBlock[] {
    const block = findBlock(blocks, id)?.block;
    return block && isTextual(block) && block.html !== html ? replaceBlock(blocks, { ...block, html }) : blocks;
  }

  private select(id: string | undefined): void {
    if (id === this.selectedNow()) return;
    this.remember({ blocks: this.blocksNow(), selectedId: id });
    this.frameOnly = undefined;
    this.clickCaret.set(undefined);
    this.selectBlock.emit(id);
  }

  /** `asFrame`: a text is not edited by it. */
  private emit(change: CanvasChange, asFrame = false): void {
    this.remember(change);
    this.frameOnly = asFrame ? change.selectedId : undefined;
    if (change.caret) this.clickCaret.set(undefined);
    this.change.emit(change);
  }

  private remember(pending: { blocks: ArticleBlock[]; selectedId?: string }): void {
    if (!this.pending) afterNextRender(() => { this.pending = undefined; }, { injector: this.injector });
    this.pending = { blocks: pending.blocks, selectedId: pending.selectedId };
    this.knownSelection = pending.selectedId;
  }

  private idOf(target: Element): string | undefined {
    return target.closest<HTMLElement>('[data-block-id]')?.dataset['blockId'];
  }

  private frameOf(id: string): HTMLElement | undefined {
    return this.element.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`) ?? undefined;
  }

  /** After the next rendering: a button of the frame when it is given and usable, else the text being edited, else the frame. */
  private focusFrame(id: string, button?: 'up' | 'down'): void {
    afterNextRender(() => this.focusNow(id, button), { injector: this.injector });
  }

  private focusNow(id: string, button?: 'up' | 'down'): void {
    const frame = this.frameOf(id);
    const action = button && frame?.querySelector<HTMLButtonElement>(`:scope > .rail [data-action="${button}"]:not(:disabled)`);
    const editing = !action && this.editingId() === id;
    // a text that is still loading takes the focus by itself
    const text = editing ? frame?.querySelector<HTMLElement>(EDITED_TEXT) : undefined;
    if (editing && !text) return;
    (action ?? text ?? frame)?.focus({ preventScroll: true });
    frame?.scrollIntoView({ block: 'nearest' });
  }
}

/** Where in a drawn text was clicked, as the html above that point; a click by the keyboard has no place. */
function clickedCaret(event: MouseEvent): RichTextCaret | undefined {
  const text = (event.target as Element).closest('okr-article-block .html');
  if (!text || event.detail === 0) return undefined;
  const at = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  const range = document.createRange();
  range.selectNodeContents(text);
  const end = at ? undefined : document.caretRangeFromPoint?.(event.clientX, event.clientY);
  const node = at?.offsetNode ?? end?.startContainer;
  if (!node || !text.contains(node)) return undefined;
  range.setEnd(node, at?.offset ?? end?.startOffset ?? 0);
  const above = document.createElement('div');
  above.append(range.cloneContents());
  return { afterHtml: above.innerHTML };
}

function newId(): string { return crypto.randomUUID(); }

function isTextual(block: ArticleBlock): block is Extract<ArticleBlock, { html: string }> {
  return block.type === 'text' || block.type === 'callout';
}

/** 'unknown': not of this app, or not in a column; readers do not see it. */
function kindOf(block: ArticleBlock, inColumn: boolean): CanvasItem['kind'] {
  if (!allowedTypesAt(inColumn ? { columnsId: '' } : {}).includes(block.type)) return 'unknown';
  return block.type === 'columns' ? 'columns' : 'block';
}
