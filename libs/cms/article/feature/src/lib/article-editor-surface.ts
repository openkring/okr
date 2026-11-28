import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, ElementRef, TemplateRef, ViewContainerRef, computed, contentChild, effect, inject, input, model, signal, viewChild, type Signal } from '@angular/core';
import { IonButton, IonIcon, IonLabel, IonSegment, IonSegmentButton } from '@ionic/angular';

import { ArticleBlockLibrary, ArticleBlockPanel } from '@okr/cms-section-ui';
import {
  ARTICLE_PROFILE, blockErrors, blockIdsWithErrors, canAddBlock, editorTexts, findBlock, outdatedLanguagesOf, record, replaceBlock, typingPath,
  type ArticleEditorI18n, type ArticlePreviewDevice, type ArticleUpload, type EditorHistory, type EditorProfile, type EditorState, type SectionErrors,
} from '@okr/cms-section-util';
import type { ImageConfig, MailBlock, MailBlockType, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { hasRole, type MailEventLine } from '@okr/shared-util-core';

import { ArticleCanvas, type CanvasCaret } from './article-canvas';
import type { ArticleHeaderChange } from './article-header-edit';
import { dropChange, type CanvasChange } from './article-canvas.util';
import {
  changeBlocks, changeSection, columnOfBlock, deviceFor, editorBlocks, historyKey, isTypedInto, selectIn, stateAfterChange, stepBack, stepForward, topOverlay, withColumnSize,
} from './article-editor-surface.util';

type History = EditorHistory<EditorState>;
/** What the template `#nothingSelected` is given: the tab of an article's panel, or 'all' (a mail). */
export type ArticlePanelTab = 'blocks' | 'article';
export type ArticlePanelPart = ArticlePanelTab | 'all';

/**
 * The editor of blocks without its window: toolbar row, canvas and panel, undo and redo, selection and caret (spec 1.175 §7). Two hosts: the
 * window of an article and the composer of a Versand mail (1.176 §10); `profile` is what differs.
 *
 * The contract of a host:
 * - It holds the history (`[(history)]`), so that it can outlive the surface; every change is told at once. While the surface is there the
 *   host makes its own changes with `change()` or `step()`, not on its signal: that reaches the surface only with the next rendering, and a
 *   change made here before it would lose it.
 * - `errors` are those of the one suite it runs, as `getErrors()` gives them (`blocks.<id>.<field>`).
 * - `onUpload` is a stable function, not an output: an upload may end when the surface is gone, and an output of it tells nothing then.
 *   The host puts the upload into the history: `surface.change(go) || history.update(go)` with `go = (history) => uploadInto(history, upload)`.
 * - What the panel shows while no block is selected stands in `<ng-template #nothingSelected let-part let-meta="meta" let-details="details">`; it is created anew each time. An article's
 *   panel has two tabs: «Blöcke» (the library, then the template with `part` 'blocks'; `meta` says whether
 *   the toggle beside «Blöcke» shows tags and notes; `details` is the signal of the toggle beside «Artikel») and «Artikel» (the template with `part` 'article').
 *   A mail's panel has none: the library, then the template with `part` 'all'.
 *   `[barEnd]` stands at the end of the toolbar row, `[belowBar]` between it and the canvas.
 * - Texts come as for an article; a mail's own are put in their place (`editorTexts`).
 *
 * Only reachable through lazily loaded hosts, as the canvas.
 */
@Component({
  selector: 'okr-article-editor-surface',
  standalone: true,
  imports: [
    ArticleBlockLibrary, ArticleBlockPanel, ArticleCanvas, NgTemplateOutlet, SvgIconPipe,
    IonButton, IonIcon, IonLabel, IonSegment, IonSegmentButton,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    :host { display: flex; flex-direction: column; height: 100%; }
    /* one line whatever is selected, so that the article never moves; the text tools scroll sideways when there is no room */
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    /* 100 px for each device */
    .bar ion-segment { flex: none; width: calc(var(--devices) * 100px); min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .text-tools { flex: 1; min-width: 0; }
    .text-tools ::ng-deep .rte-toolbar { border-bottom: 0; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; min-height: 0; }
    .tabs { position: sticky; top: 0; z-index: 2; padding: 8px; background: var(--ion-background-color, #fff); border-bottom: 1px solid var(--ion-color-light-shade); }
    .panel { flex: none; width: 360px; overflow: auto; overscroll-behavior: contain; padding-bottom: 24px; border-inline-start: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff); color: var(--ion-text-color, #000); }
    @media (width < 1024px) {
      .work { flex-direction: column; }
      .canvas { flex: 1 1 0; }
      .panel { flex: 0 1 auto; width: auto; max-height: 42%; border-inline-start: 0; border-top: 1px solid var(--ion-color-light-shade); }
    }
  `],
  template: `
    @let t = texts();
    <div class="bar">
      @if (!phone()) {
        <ion-segment [value]="device()" [style.--devices]="profile().devices.length" [attr.aria-label]="t.article_editor_device_label()" (ionChange)="chooseDevice($event.detail.value)">
          @for (name of profile().devices; track name) {
            <ion-segment-button [value]="name"><ion-label>{{ deviceLabels()[name] }}</ion-label></ion-segment-button>
          }
        </ion-segment>
      }
      <ion-button fill="clear" size="small" [disabled]="history().past.length === 0" [title]="t.article_editor_undo()" [attr.aria-label]="t.article_editor_undo()" (click)="undo()">
        <ion-icon slot="icon-only" src="{{ 'undo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
      <ion-button fill="clear" size="small" [disabled]="history().future.length === 0" [title]="t.article_editor_redo()" [attr.aria-label]="t.article_editor_redo()" (click)="redo()">
        <ion-icon slot="icon-only" src="{{ 'redo' | svgIcon }}" aria-hidden="true" />
      </ion-button>
      <div class="text-tools" role="group" [attr.aria-label]="t.article_editor_textTools()"><ng-container #textTools /></div>
      <ng-content select="[barEnd]" />
    </div>
    <ng-content select="[belowBar]" />
    <div class="work">
      <okr-article-canvas class="canvas" [profile]="profile()" [section]="section()" [selectedId]="selectedId()" [errorIds]="errorIds()" [device]="device()" [dragEnabled]="!phone()"
        [toolbarHost]="toolbarHost()" [caret]="caret()" [eventLines]="eventLines()" [mailTop]="mailTop()" [mailFoot]="mailFoot()" [i18n]="t" (selectBlock)="select($event)" (change)="onCanvasChange($event)" (headerChange)="onHeaderChange($event)" />
      <div class="panel" #panel>
        @if (selectedBlock(); as block) {
          <okr-article-block-panel [block]="block" [profile]="profile()" [column]="column()" [errors]="selectedErrors()" [outdated]="selectedOutdated()" [calendars]="calendars()"
            [articleImages]="articleImages()" [uploads]="uploads()" [onUpload]="onUpload()" [storagePath]="storagePath()" [currentUser]="currentUser()" [i18n]="t"
            (blockChange)="onBlockChange($event)" (columnSizeChange)="onColumnSize(block.id, $event)" />
        } @else if (hasTabs()) {
          <div class="tabs">
            <ion-segment [value]="tab()" [attr.aria-label]="t.article_editor_panel_tab_label()" (ionChange)="chooseTab($event.detail.value)">
              <ion-segment-button value="blocks"><ion-label>{{ t.article_editor_panel_tab_blocks() }}</ion-label></ion-segment-button>
              <ion-segment-button value="article"><ion-label>{{ t.article_editor_panel_tab_article() }}</ion-label></ion-segment-button>
            </ion-segment>
          </div>
          @if (tab() === 'blocks') {
            <ng-container [ngTemplateOutlet]="library" />
          }
          @if (nothingSelected(); as template) { <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="{ $implicit: tab(), meta: metaShown(), details: detailsShown }" /> }
        } @else {
          <ng-container [ngTemplateOutlet]="library" />
          @if (nothingSelected(); as template) { <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="{ $implicit: 'all', meta: metaShown(), details: detailsShown }" /> }
        }
      </div>
    </div>
    <ng-template #library>
      <okr-article-block-library [allowed]="profile().types" [disabled]="!canAdd()" [dragEnabled]="!phone()" [dropLists]="canvas().dropLists()" [i18n]="texts()" (add)="add($event)"
        [metaToggle]="hasMeta()" [(metaShown)]="metaShown" />
    </ng-template>
  `,
})
export class ArticleEditorSurface {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  // inputs
  public readonly profile = input<EditorProfile>(ARTICLE_PROFILE);
  /** the article, or the one of a mail (`mailArticle`), with what is selected */
  public readonly history = model.required<EditorHistory<EditorState>>();
  /** the ids of the blocks as opened: only a copy of another one has an origin (translations of an article; a mail has none) */
  public readonly openedIds = input<ReadonlySet<string>>(new Set<string>());
  public readonly errors = input<SectionErrors>({});
  /** path → languages whose translation is outdated (`outdatedPaths`) */
  public readonly outdated = input<Record<string, string[]>>({});
  /** «Aus diesem Artikel» / «Aus dieser E-Mail» */
  public readonly articleImages = input<ImageConfig[]>([]);
  /** false: no file can be uploaded */
  public readonly uploads = input(true);
  /** see above */
  public readonly onUpload = input.required<(upload: ArticleUpload) => void>();
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  /** of a mail: the upcoming events, by the key of their calendar (at least MAX_MAIL_EVENTS when there are); a missing key: not known yet */
  public readonly eventLines = input<Record<string, MailEventLine[]>>({});
  /** a mail: the head and the foot of its template (see `ArticleCanvas`) */
  public readonly mailTop = input<TemplateRef<unknown>>();
  public readonly mailFoot = input<TemplateRef<unknown>>();
  /** of a mail: the calendars that can be chosen */
  public readonly calendars = input<readonly { key: string; name: string }[]>([]);
  /** asked at a key press: false while the host is closing */
  public readonly active = input<() => boolean>(() => true);
  public readonly i18n = input.required<ArticleEditorI18n>();

  // children
  protected readonly canvas = viewChild.required(ArticleCanvas);
  protected readonly toolbarHost = viewChild('textTools', { read: ViewContainerRef });
  protected readonly nothingSelected = contentChild<TemplateRef<unknown>>('nothingSelected');
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  // blocks
  protected readonly section = computed(() => this.history().present.section);
  protected readonly selectedId = computed(() => this.history().present.selectedId);
  private readonly blocks = computed(() => editorBlocks(this.history().present));
  protected readonly selectedBlock = computed(() => {
    const id = this.selectedId();
    return id === undefined ? undefined : findBlock(this.blocks(), id)?.block;
  });
  protected readonly column = computed(() => {
    const id = this.selectedId();
    return id === undefined ? undefined : columnOfBlock(this.blocks(), id);
  });
  /** where the cursor goes; not part of the history */
  protected readonly caret = signal<CanvasCaret | undefined>(undefined);
  protected readonly canAdd = computed(() => canAddBlock(this.blocks()));
  protected readonly errorIds = computed(() => blockIdsWithErrors(this.errors(), this.blocks()));
  protected readonly selectedErrors = computed(() => blockErrors(this.errors(), this.selectedId() ?? '', this.blocks()));
  protected readonly selectedOutdated = computed(() => outdatedLanguagesOf(this.outdated(), this.selectedId() ?? ''));

  // window
  protected readonly texts = computed(() => editorTexts(this.i18n(), this.profile()));
  protected readonly deviceLabels = computed<Record<ArticlePreviewDevice, string>>(() => ({
    auto: '', mobile: this.texts().article_editor_device_mobile(), tablet: this.texts().article_editor_device_tablet(), desktop: this.texts().article_editor_device_desktop(),
  }));
  private readonly chosenDevice = signal<ArticlePreviewDevice>('desktop');
  /** an article's panel while no block is selected: its blocks (library, tags, notes) or the article itself (settings, look, teaser) */
  protected readonly hasTabs = computed(() => this.profile().kind === 'article' && !!this.nothingSelected());
  protected readonly tab = signal<ArticlePanelTab>('blocks');
  /** an article's tags and notes, below the library: only for those who may edit them; hidden until the toggle in «Blöcke» shows them */
  protected readonly hasMeta = computed(() => this.hasTabs() && hasRole('privileged', this.currentUser()));
  protected readonly metaShown = signal(false);
  /** the toggle beside «Artikel» (type, key, teaser picture); kept here, so that it outlives a change of tab */
  protected readonly detailsShown = signal(false);
  protected readonly phone = mediaSignal('(width < 768px)');
  protected readonly device = computed(() => deviceFor(this.chosenDevice(), this.phone(), this.profile()));

  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; });
    effect(() => {
      this.selectedId();
      this.panel().nativeElement.scrollTop = 0;
    });
  }

  // ----------------------------------------------------- for the host ----------------------------------------------------

  /** Selects a block, or nothing; a text is edited, with the cursor at its end. */
  public select(id: string | undefined): void {
    if (this.change((history) => selectIn(history, id))) this.caret.set(undefined);
  }

  /** Selects a block from outside the canvas: it gets the focus and comes into sight. */
  public open(id: string): void {
    this.select(id);
    if (!this.destroyed) this.canvas().focusSelected();
  }

  /** A change of the host (`changeSection`, `changeBlocks`, `uploadInto`). False when the surface is gone and nothing was changed. */
  public change(go: (history: History) => History): boolean {
    if (this.destroyed) return false;
    this.history.update(go);
    return true;
  }

  /** Undo, redo, or another step that is not made in the canvas (`restore`); what changes gets the focus. */
  public step(go: (history: History) => History): void {
    const before = this.history();
    if (!this.change(go) || this.history() === before) return;
    this.caret.set(undefined);
    this.canvas().focusSelected();
  }

  // ------------------------------------------------------- changes -------------------------------------------------------

  /** The canvas goes on from what it emitted: applied at once. */
  protected onCanvasChange(change: CanvasChange<MailBlock>): void {
    const ids = this.openedIds();
    this.history.update((history) => record(history, stateAfterChange(history.present, change, ids), { tag: change.tag }));
    // typing has none: the cursor stays where it is
    if (change.caret && change.selectedId !== undefined) this.caret.set({ id: change.selectedId, at: change.caret });
  }

  /** Title, subtitle or intro typed in the canvas; a run of typing in one field is one step. */
  protected onHeaderChange({ field, value }: ArticleHeaderChange): void {
    this.history.update((history) => {
      const section = history.present.section;
      return (section[field] ?? '') === value ? history : changeSection(history, { ...section, [field]: value }, `article:${field}`);
    });
  }

  protected add(newType: MailBlockType): void {
    const change = dropChange(this.blocks(), { newType }, { index: this.blocks().length }, newId, this.profile());
    if (!change) return;
    this.onCanvasChange(change);
    this.canvas().focusSelected();
  }

  protected onBlockChange(block: MailBlock): void {
    const before = findBlock(this.blocks(), block.id)?.block;
    if (!before) return;
    const path = typingPath(before, block, this.profile());
    this.setBlocks(replaceBlock(this.blocks(), block), path && `panel:${block.id}:${path}`);
  }

  protected onColumnSize(id: string, size: number): void {
    this.setBlocks(withColumnSize(this.blocks(), id, size));
  }

  private setBlocks(blocks: MailBlock[], tag?: string): void {
    this.history.update((history) => changeBlocks(history, blocks, tag));
  }

  // ----------------------------------------------------- undo and redo ---------------------------------------------------

  protected undo(): void { this.step(stepBack); }
  protected redo(): void { this.step(stepForward); }

  /** Also an event that the text editor prevented: it switches off its own undo that way. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = historyKey(event);
    if (!key || !this.active()() || !this.isOnTop()) return;
    const from = event.composedPath()[0];
    // in a field of the panel the browser's own undo works
    if (from instanceof Element && isTypedInto(from) && !from.closest('okr-article-canvas')) return;
    event.preventDefault();
    if (key === 'undo') this.undo();
    else this.redo();
  }

  /** Whether no picker, sheet or question is open above the window that the surface stands in. */
  private isOnTop(): boolean {
    return topOverlay()?.contains(this.element) ?? true;
  }

  // ------------------------------------------------------- window --------------------------------------------------------

  protected chooseTab(value: unknown): void {
    if (value === 'blocks' || value === 'article') this.tab.set(value);
  }

  protected chooseDevice(value: unknown): void {
    const device = this.profile().devices.find((name) => name === value);
    if (device) this.chosenDevice.set(device);
  }
}

function newId(): string { return crypto.randomUUID(); }

/** Whether the window matches `query`; in an injection context. */
function mediaSignal(query: string): Signal<boolean> {
  const media = window.matchMedia(query);
  const matches = signal(media.matches);
  const onChange = (event: MediaQueryListEvent): void => matches.set(event.matches);
  media.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
  return matches.asReadonly();
}
