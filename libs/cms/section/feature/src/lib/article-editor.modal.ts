import { Component, DestroyRef, ElementRef, ViewContainerRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild, type Signal } from '@angular/core';
import { AlertController, IonButton, IonContent, IonIcon, IonLabel, IonModalToken, IonSegment, IonSegmentButton, IonSpinner, ToastController } from '@ionic/angular';

import { ArticleBlocksGate, ArticleSaveService, type ArticleSaveResult } from '@okr/cms-section-data-access';
import { ArticleBlockLibrary, ArticleBlockPanel, ArticlePanel } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, SECTION_I18N_KEYS, articleImageChoices, articleOwnErrors, articleSectionValidations, blockErrors, blockIdsWithErrors,
  blockTypeLabel, blocksInOrder, canAddBlock, createHistory, findBlock, isArticleChanged, newArticleForEditor, openArticle, outdatedLanguagesOf,
  outdatedPaths, prepareArticleForSave, record, replaceBlock, typingPath, withUpload,
  type ArticleEditorI18n, type ArticlePreviewDevice, type ArticleUpload, type EditorHistory,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import type { ArticleBlock, ArticleBlockType, ArticleSection, CategoryListModel, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { confirm, showToast } from '@okr/shared-util-angular';

import { ArticleCanvas, type CanvasCaret, type CanvasChange } from './article-canvas';
import { dropChange } from './article-canvas.util';
import {
  changeSection, closeDecision, columnOfBlock, deviceFor, historyKey, isTypedInto, restore, selectIn, stateAfterChange, stepBack, stepForward, withBlocks, withColumnSize,
  withFieldDefaults, withUploadDetails, type EditorState,
} from './article-editor-modal.util';

const DEVICES = ['mobile', 'tablet', 'desktop'] as const satisfies readonly ArticlePreviewDevice[];
/** what Ionic counts as an overlay that takes the keys, see its `trapKeyboardFocus` */
const OVERLAYS = 'ion-alert, ion-action-sheet, ion-loading, ion-modal, ion-popover';
/** a second press on the close icon waits in Ionic until the question of the first one was answered */
const CLOSE_AGAIN_MS = 300;

/**
 * The article editor (spec 1.175): toolbar, canvas and panel, and the only place that holds the article being edited, its undo
 * history and its saving. It stays open until a save succeeded; `onSaved` tells the key each time, however it is closed then.
 *
 * Open it with `openArticleEditor` only: it is in no chunk that readers load and not exported from the lib.
 */
@Component({
  selector: 'okr-article-editor-modal',
  standalone: true,
  imports: [
    ArticleBlockLibrary, ArticleBlockPanel, ArticleCanvas, ArticlePanel, ChangeConfirmation, Header, SvgIconPipe,
    IonButton, IonContent, IonIcon, IonLabel, IonSegment, IonSegmentButton, IonSpinner,
  ],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styles: [`
    .editor { display: flex; flex-direction: column; height: 100%; }
    /* one line whatever is selected, so that the article never moves; the text tools scroll sideways when there is no room */
    .bar { flex: none; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 8px; border-bottom: 1px solid var(--ion-color-light-shade); }
    .bar ion-segment { flex: none; width: 300px; min-height: 36px; }
    .bar ion-segment-button { min-height: 34px; min-width: 0; --padding-start: 4px; --padding-end: 4px; }
    .bar ion-button { flex: none; margin: 0; }
    .text-tools { flex: 1; min-width: 0; }
    .text-tools ::ng-deep .rte-toolbar { border-bottom: 0; }
    .running { flex: none; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
    .running ion-spinner { width: 20px; height: 20px; }
    .notice { flex: none; display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 16px; font-size: 0.9rem; background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .notice span { flex: 1; }
    .notice ion-button { flex: none; margin: 0; --color: currentColor; }
    .work { flex: 1; min-height: 0; display: flex; }
    .canvas { flex: 1; min-width: 0; min-height: 0; }
    .panel { flex: none; width: 360px; overflow: auto; overscroll-behavior: contain; padding-bottom: 24px; border-inline-start: 1px solid var(--ion-color-light-shade); background: var(--ion-background-color, #fff); color: var(--ion-text-color, #000); }
    @media (width < 1024px) {
      .work { flex-direction: column; }
      .canvas { flex: 1 1 0; }
      .panel { flex: 0 1 auto; width: auto; max-height: 42%; border-inline-start: 0; border-top: 1px solid var(--ion-color-light-shade); }
    }
    @media (width < 768px) {
      .running span { display: none; }
    }
  `],
  template: `
    @let t = i18n;
    <okr-header [i18n]="{ title: isNew() ? t.article_editor_title_new() : t.article_editor_title_edit() }" [isModal]="true" />
    @if (valid() && changed()) {
      <okr-change-confirmation [i18n]="{ cancel: t.cancel(), save: t.save() }" (cancelClicked)="reset()" (saveClicked)="save()" />
    }
    <ion-content [scrollY]="false" class="ion-no-padding">
      <div class="editor">
        <div class="bar">
          @if (!phone()) {
            <ion-segment [value]="chosenDevice()" [attr.aria-label]="t.article_editor_device_label()" (ionChange)="chooseDevice($event.detail.value)">
              @for (name of devices; track name) {
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
          <div class="running" role="status">
            @if (saving()) { <ion-spinner name="crescent" aria-hidden="true" /><span>{{ t.article_editor_save_running() }}</span> }
          </div>
        </div>
        @for (notice of notices(); track notice) {
          <div class="notice" role="status">
            <span>{{ noticeText(notice) }}</span>
            <ion-button fill="clear" size="small" [title]="t.article_editor_notice_close()" [attr.aria-label]="t.article_editor_notice_close()" (click)="closeNotice(notice)">
              <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" aria-hidden="true" />
            </ion-button>
          </div>
        }
        <div class="work">
          <okr-article-canvas class="canvas" [section]="article()" [selectedId]="selectedId()" [errorIds]="errorIds()" [device]="device()" [dragEnabled]="!phone()"
            [toolbarHost]="toolbarHost()" [caret]="caret()" [i18n]="t" (selectBlock)="select($event)" (change)="onCanvasChange($event)" />
          <div class="panel" #panel>
            @if (selectedBlock(); as block) {
              <okr-article-block-panel [block]="block" [column]="column()" [errors]="selectedErrors()" [outdated]="selectedOutdated()" [articleImages]="articleImages()"
                [uploads]="uploads" [onUpload]="onUpload" [storagePath]="storagePath()" [currentUser]="currentUser()" [i18n]="t"
                (blockChange)="onBlockChange($event)" (columnSizeChange)="onColumnSize(block.id, $event)" />
            } @else {
              <okr-article-block-library [disabled]="!canAdd()" [dragEnabled]="!phone()" [dropLists]="canvas().dropLists()" [i18n]="t" (add)="add($event)" />
              <okr-article-panel [section]="article()" (sectionChange)="onSectionChange($event)" [errors]="ownErrors()" [errorBlocks]="errorBlocks()" [outdated]="outdated()"
                [articleImages]="articleImages()" [uploads]="uploads" [onUpload]="onUpload" [roles]="roles()" [states]="states()" [allTags]="allTags()"
                [currentUser]="currentUser()" [storagePath]="storagePath()" [i18n]="t" (selectBlock)="selectFromPanel($event)" />
            }
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class ArticleEditorModal {
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);
  private readonly gate = inject(ArticleBlocksGate);
  private readonly saveService = inject(ArticleSaveService);
  /** not named `modal`: Ionic sets a property of that name */
  private readonly overlay = inject(IonModalToken);
  private readonly i18nService = inject(I18nService);

  // inputs
  /** as it was read (the save compares with it); a new one with the key it will get */
  public readonly section = input.required<ArticleSection>();
  public readonly isNew = input.required<boolean>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly tagModel = input.required<string>();
  /** called after each save with the key of the document; never in trial mode */
  public readonly onSaved = input.required<(key: string) => void>();

  protected readonly i18n = this.i18nService.translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS }) as ArticleEditorI18n;
  /** a fork is the only save without a message of the section service; it gets the one of an update */
  private readonly saved = this.i18nService.translateAll({ message: '@cms/section/data-access.update.conf' });

  protected readonly canvas = viewChild.required(ArticleCanvas);
  protected readonly toolbarHost = viewChild('textTools', { read: ViewContainerRef });
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  // the article
  /** once: the inputs of the modal do not change */
  private readonly opened = computed(() => untracked(() => {
    const section = withFieldDefaults(this.section());
    const { section: article, notice } = openArticle(this.isNew() ? newArticleForEditor(section, section.okey, newId) : section, newId);
    const ids = blocksInOrder(article.properties.blocks ?? []).map((block) => block.id);
    const state: EditorState = { section: article, copiedFrom: {} };
    return { state, notice, ids: new Set(ids) as ReadonlySet<string> };
  }));
  protected readonly history = linkedSignal<EditorHistory<EditorState>>(() => createHistory(this.opened().state));
  /** what is stored: as opened, later as saved */
  private readonly baseline = linkedSignal<EditorState>(() => this.opened().state);
  protected readonly article = computed(() => this.history().present.section);
  protected readonly selectedId = computed(() => this.history().present.selectedId);
  private readonly blocks = computed<ArticleBlock[]>(() => this.article().properties.blocks ?? []);
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
  protected readonly changed = computed(() => isArticleChanged(this.baseline().section, this.article()));
  protected readonly canAdd = computed(() => canAddBlock(this.blocks()));
  protected readonly articleImages = computed(() => articleImageChoices(this.article()));

  // errors: one run of the suite for canvas, panels and banner
  private readonly result = computed(() => articleSectionValidations(this.article()));
  private readonly errors = computed(() => this.result().getErrors());
  protected readonly valid = computed(() => this.result().isValid());
  protected readonly errorIds = computed(() => blockIdsWithErrors(this.errors(), this.blocks()));
  protected readonly errorBlocks = computed(() => this.errorIds().map((id) => ({ id, label: blockTypeLabel(this.i18n, findBlock(this.blocks(), id)?.block.type ?? '') })));
  protected readonly ownErrors = computed(() => articleOwnErrors(this.errors(), this.blocks()));
  protected readonly selectedErrors = computed(() => blockErrors(this.errors(), this.selectedId() ?? '', this.blocks()));

  // translations
  protected readonly outdated = signal<Record<string, string[]>>({});
  protected readonly selectedOutdated = computed(() => outdatedLanguagesOf(this.outdated(), this.selectedId() ?? ''));

  // window
  protected readonly devices = DEVICES;
  protected readonly deviceLabels = computed(() => ({
    mobile: this.i18n.article_editor_device_mobile(), tablet: this.i18n.article_editor_device_tablet(), desktop: this.i18n.article_editor_device_desktop(),
  }));
  protected readonly chosenDevice = signal<ArticlePreviewDevice>('desktop');
  protected readonly phone = mediaSignal('(width < 768px)');
  protected readonly device = computed(() => deviceFor(this.chosenDevice(), this.phone()));
  protected readonly notices = linkedSignal<EditorNotice[]>(() => {
    const { notice } = this.opened();
    return [...(this.gate.trial ? ['trial' as const] : []), ...(notice ? [notice] : [])];
  });

  // pictures and tags
  /** nothing is written in trial mode */
  protected readonly uploads = !this.gate.trial;
  protected readonly storagePath = computed(() => `tenant/${this.appStore.tenantId()}/section/${this.section().okey}`);
  /** «Werte bearbeiten» of the tags saves at once: without values it is not offered */
  protected readonly allTags = computed(() => this.gate.trial ? '' : this.appStore.getTags(this.tagModel()));

  // saving
  protected readonly saving = signal(false);
  /** what is written next: the document, who owns it, and what it is compared with; after a save what was written */
  private target: { key: string; tenants?: string[]; isNew: boolean; loaded: SectionModel } | undefined;
  /** saved, closes by itself */
  private done = false;
  private leaving = false;
  /** the question is being asked, or was answered just now */
  private asking = false;

  constructor() {
    this.overlay.canDismiss = () => this.mayClose();
    effect(() => this.markOutdated(this.article()));
    effect(() => {
      this.selectedId();
      this.panel().nativeElement.scrollTop = 0;
    });
  }

  /** Ionic. A new article opens with the cursor in its empty text: not before, nothing takes the focus while the modal is hidden. */
  public ionViewDidEnter(): void {
    if (this.isNew() && this.history().past.length === 0 && this.selectedId() === undefined) this.select(this.blocks()[0]?.id);
  }

  /** Ionic: closed by now, only its animation goes on. */
  public ionViewWillLeave(): void { this.leaving = true; }

  // ------------------------------------------------------- changes -------------------------------------------------------

  protected select(id: string | undefined): void {
    this.history.update((history) => selectIn(history, id));
    this.caret.set(undefined);
  }

  /** The canvas goes on from what it emitted: applied at once. */
  protected onCanvasChange(change: CanvasChange): void {
    const { ids } = this.opened();
    this.history.update((history) => record(history, stateAfterChange(history.present, change, ids), { tag: change.tag }));
    // typing has none: the cursor stays where it is
    if (change.caret && change.selectedId !== undefined) this.caret.set({ id: change.selectedId, at: change.caret });
  }

  protected add(newType: ArticleBlockType): void {
    const change = dropChange(this.blocks(), { newType }, { index: this.blocks().length }, newId);
    if (!change) return;
    this.onCanvasChange(change);
    this.canvas().focusSelected();
  }

  protected selectFromPanel(id: string): void {
    this.select(id);
    this.canvas().focusSelected();
  }

  protected onBlockChange(block: ArticleBlock): void {
    const before = findBlock(this.blocks(), block.id)?.block;
    if (!before) return;
    const path = typingPath(before, block);
    this.setBlocks(replaceBlock(this.blocks(), block), path && `panel:${block.id}:${path}`);
  }

  protected onColumnSize(id: string, size: number): void {
    this.setBlocks(withColumnSize(this.blocks(), id, size));
  }

  protected onSectionChange(section: ArticleSection): void {
    const path = typingPath(this.article(), section);
    this.setSection(section, path && `article:${path}`);
  }

  private setBlocks(blocks: ArticleBlock[], tag?: string): void {
    if (blocks !== this.blocks()) this.setSection(withBlocks(this.article(), blocks), tag);
  }

  private setSection(section: ArticleSection, tag?: string): void {
    this.history.update((history) => changeSection(history, section, tag));
  }

  /** A stable function: it is called when the panel may show another block, or the editor is closed. */
  protected readonly onUpload = (upload: ArticleUpload): void => {
    if (!this.uploads) return;
    if (upload.kind === 'details') this.history.update((history) => withUploadDetails(history, upload));
    else this.setSection(withUpload(this.article(), upload));
  };

  // ----------------------------------------------------- undo and redo ---------------------------------------------------

  protected undo(): void { this.step(stepBack); }
  protected redo(): void { this.step(stepForward); }

  private step(go: (history: EditorHistory<EditorState>) => EditorHistory<EditorState>): void {
    const next = go(this.history());
    if (next === this.history()) return;
    this.history.set(next);
    this.caret.set(undefined);
    this.canvas().focusSelected();
  }

  /** «Abbrechen»: the article as it is stored, as a step that can be undone. */
  protected reset(): void {
    this.step((history) => restore(history, this.baseline()));
  }

  /** Also an event that the text editor prevented: it switches off its own undo that way. */
  protected onKeydown(event: KeyboardEvent): void {
    const key = historyKey(event);
    if (!key || this.leaving || this.done || !this.isOnTop()) return;
    const from = event.composedPath()[0];
    // in a field of the panel the browser's own undo works
    if (from instanceof Element && isTypedInto(from) && !from.closest('okr-article-canvas')) return;
    event.preventDefault();
    if (key === 'undo') this.undo();
    else this.redo();
  }

  /** Whether no picker, sheet or question is open above this modal. */
  private isOnTop(): boolean {
    const open = [...document.querySelectorAll<HTMLElement & { overlayIndex?: number }>(OVERLAYS)]
      .filter((element) => (element.overlayIndex ?? 0) > 0 && !element.classList.contains('overlay-hidden'));
    return open[open.length - 1] === this.overlay;
  }

  // ------------------------------------------------------- saving -------------------------------------------------------

  /** A second press while a save runs is ignored; what is changed meanwhile stays and can be saved next. */
  protected async save(force = false): Promise<void> {
    if (this.saving() || this.done || !this.valid() || !this.changed()) return;
    this.saving.set(true);
    const state = this.history().present;
    const target = this.target ?? { key: this.section().okey, isNew: this.isNew(), loaded: this.section() };
    let sent: ArticleSection;
    let result: ArticleSaveResult;
    try {
      const prepared = await prepareArticleForSave(this.opened().state.section, state.section, state.copiedFrom, new Date().toISOString());
      sent = { ...prepared, okey: target.key, ...(target.tenants ? { tenants: target.tenants } : {}) };
      result = await this.saveService.save(sent, target.loaded, { isNew: target.isNew, force, currentUser: this.currentUser() });
    } catch (error) {
      // before anything was sent: the service never rejects
      console.error('ArticleEditorModal: the article could not be prepared', error);
      void showToast(this.toastController, this.i18n.article_editor_save_failed());
      return;
    } finally {
      this.saving.set(false);
    }
    switch (result.status) {
      case 'saved': return this.afterSave(result, state, sent, target.key);
      case 'conflict':
        if (await this.ask(this.i18n.article_editor_save_conflict(), this.i18n.article_editor_save_force(), this.i18n.article_editor_save_back())) return this.save(true);
        return;
      case 'gone': return this.tell(this.i18n.article_editor_save_gone());
      case 'offline': return this.tell(this.i18n.article_editor_save_offline());
      // it already showed its message
      case 'failed': return;
    }
  }

  private async afterSave(result: Extract<ArticleSaveResult, { status: 'saved' }>, state: EditorState, sent: ArticleSection, key: string): Promise<void> {
    if (result.trial) {
      void showToast(this.toastController, this.i18n.article_editor_save_trial());
      if (this.article() === state.section && this.isOnTop()) await this.close();
      return;
    }
    const forked = result.key !== key;
    if (forked) void showToast(this.toastController, this.saved.message());
    this.target = {
      key: result.key, isNew: false, loaded: { ...sent, okey: result.key },
      ...(forked ? { tenants: [this.appStore.tenantId()] } : { tenants: this.target?.tenants }),
    };
    this.onSaved()(result.key);
    this.baseline.set(state);
    // changed meanwhile, or at work in a picker: stays open, with the banner if there is something to save
    if (!this.changed() && this.isOnTop()) await this.close(result.key);
  }

  /** Answered when the question is gone: until then it is an overlay above the editor. */
  private async ask(message: string, yes: string, no: string): Promise<boolean> {
    const alert = await this.alertController.create({ message, buttons: [{ text: no, role: 'cancel' }, { text: yes, role: 'confirm' }] });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  private async tell(message: string): Promise<void> {
    await confirm(this.alertController, message, this.i18n.ok(), '');
  }

  // ------------------------------------------------------- closing -------------------------------------------------------

  private async close(key?: string): Promise<void> {
    this.done = true;
    await this.overlay.dismiss(key, 'confirm');
  }

  /** Close icon, Escape, hardware back and everything else that closes a modal. */
  private async mayClose(): Promise<boolean> {
    switch (closeDecision({ done: this.done, saving: this.saving(), changed: this.changed() })) {
      case 'allow': return true;
      case 'refuse':
        void showToast(this.toastController, this.i18n.article_editor_save_running());
        return false;
      case 'ask': {
        if (this.asking) return false;
        this.asking = true;
        try {
          return await this.ask(this.i18n.article_editor_discard_message(), this.i18n.article_editor_discard_confirm(), this.i18n.article_editor_discard_keep());
        } finally {
          setTimeout(() => { this.asking = false; }, CLOSE_AGAIN_MS);
        }
      }
    }
  }

  // ------------------------------------------------------- window --------------------------------------------------------

  protected chooseDevice(value: unknown): void {
    const device = DEVICES.find((name) => name === value);
    if (device) this.chosenDevice.set(device);
  }

  protected noticeText(notice: EditorNotice): string {
    switch (notice) {
      case 'trial': return this.i18n.article_editor_notice_trial();
      case 'noPicture': return this.i18n.article_editor_notice_noPicture();
      case 'look': return this.i18n.article_editor_notice_look();
    }
  }

  protected closeNotice(notice: EditorNotice): void {
    this.notices.update((notices) => notices.filter((other) => other !== notice));
  }

  private marking = 0;
  /** hashing is asynchronous: only the last result counts */
  private markOutdated(article: ArticleSection): void {
    const run = ++this.marking;
    outdatedPaths(untracked(this.opened).state.section, article).then(
      (paths) => { if (run === this.marking) this.outdated.set(paths); },
      (error: unknown) => console.warn('ArticleEditorModal: outdated translations are not marked', error),
    );
  }
}

type EditorNotice = 'trial' | 'noPicture' | 'look';

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
