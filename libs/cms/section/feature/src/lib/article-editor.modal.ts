import { Component, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { AlertController, IonButton, IonContent, IonIcon, IonModalToken, IonSpinner, ToastController } from '@ionic/angular';

import { ArticleEditorSurface, changeSection, restore, topOverlay, uploadInto } from '@okr/cms-article-feature';
import { ArticleBlocksGate, ArticleSaveService, type ArticleSaveResult } from '@okr/cms-section-data-access';
import { ArticlePanel } from '@okr/cms-section-ui';
import {
  ARTICLE_EDITOR_I18N_KEYS, ARTICLE_PROFILE, SECTION_I18N_KEYS, articleImageChoices, articleOwnErrors, articleSectionValidations, blockIdsWithErrors,
  blockTypeLabel, blocksInOrder, createHistory, findBlock, isArticleChanged, newArticleForEditor, openArticle, outdatedPaths, prepareArticleForSave, typingPath,
  type ArticleEditorI18n, type ArticleUpload, type EditorHistory, type EditorState,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import type { ArticleBlock, ArticleSection, CategoryListModel, SectionModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { showToast } from '@okr/shared-util-angular';

import { closeDecision, withFieldDefaults } from './article-editor-modal.util';

/** a second press on the close icon waits in Ionic until the question of the first one was answered */
const CLOSE_AGAIN_MS = 300;

/**
 * The article editor (spec 1.175): the window of the editor surface, and the only place that holds the article being edited, its undo
 * history and its saving. It stays open until a save succeeded; `onSaved` tells the key each time, however it is closed then.
 *
 * Open it with `openArticleEditor` only: it is in no chunk that readers load and not exported from the lib.
 */
@Component({
  selector: 'okr-article-editor-modal',
  standalone: true,
  imports: [
    ArticleEditorSurface, ArticlePanel, ChangeConfirmation, Header, SvgIconPipe,
    IonButton, IonContent, IonIcon, IonSpinner,
  ],
  styles: [`
    .running { flex: none; display: flex; align-items: center; gap: 8px; font-size: 0.85rem; }
    .running ion-spinner { width: 20px; height: 20px; }
    .notices { flex: none; }
    .notice { display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 16px; font-size: 0.9rem; background: var(--ion-color-warning); color: var(--ion-color-warning-contrast); }
    .notice span { flex: 1; }
    .notice ion-button { flex: none; margin: 0; --color: currentColor; }
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
      <okr-article-editor-surface [profile]="profile" [(history)]="history" [openedIds]="opened().ids" [errors]="errors()" [outdated]="outdated()" [articleImages]="articleImages()"
        [uploads]="uploads" [onUpload]="onUpload" [storagePath]="storagePath()" [currentUser]="currentUser()" [active]="mayStep" [i18n]="t">
        <div barEnd class="running" role="status">
          @if (saving()) { <ion-spinner name="crescent" aria-hidden="true" /><span>{{ t.article_editor_save_running() }}</span> }
        </div>
        <div belowBar class="notices">
          @for (notice of notices(); track notice) {
            <div class="notice" role="status">
              <span>{{ noticeText(notice) }}</span>
              <ion-button fill="clear" size="small" [title]="t.article_editor_notice_close()" [attr.aria-label]="t.article_editor_notice_close()" (click)="closeNotice(notice)">
                <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" aria-hidden="true" />
              </ion-button>
            </div>
          }
        </div>
        <ng-template #nothingSelected>
          <okr-article-panel [section]="article()" (sectionChange)="onSectionChange($event)" [errors]="ownErrors()" [errorBlocks]="errorBlocks()" [outdated]="outdated()"
            [articleImages]="articleImages()" [uploads]="uploads" [onUpload]="onUpload" [roles]="roles()" [states]="states()" [allTags]="allTags()"
            [currentUser]="currentUser()" [storagePath]="storagePath()" [i18n]="t" (selectBlock)="surface().open($event)" />
        </ng-template>
      </okr-article-editor-surface>
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

  protected readonly surface = viewChild.required(ArticleEditorSurface);
  protected readonly profile = ARTICLE_PROFILE;

  // the article
  /** once: the inputs of the modal do not change */
  protected readonly opened = computed(() => untracked(() => {
    const section = withFieldDefaults(this.section(), this.isNew());
    const { section: article, notice } = openArticle(this.isNew() ? newArticleForEditor(section, section.okey, newId) : section, newId);
    const ids = blocksInOrder(article.properties.blocks ?? []).map((block) => block.id);
    const state: EditorState = { section: article, copiedFrom: {} };
    return { state, notice, ids: new Set(ids) as ReadonlySet<string> };
  }));
  protected readonly history = linkedSignal<EditorHistory<EditorState>>(() => createHistory(this.opened().state));
  /** what is stored: as opened, later as saved */
  private readonly baseline = linkedSignal<EditorState>(() => this.opened().state);
  protected readonly article = computed(() => this.history().present.section);
  private readonly blocks = computed<ArticleBlock[]>(() => this.article().properties.blocks ?? []);
  protected readonly changed = computed(() => isArticleChanged(this.baseline().section, this.article()));
  protected readonly articleImages = computed(() => articleImageChoices(this.article()));

  // errors: one run of the suite for surface, panel and banner
  private readonly result = computed(() => articleSectionValidations(this.article()));
  protected readonly errors = computed(() => this.result().getErrors());
  protected readonly valid = computed(() => this.result().isValid());
  private readonly errorIds = computed(() => blockIdsWithErrors(this.errors(), this.blocks()));
  protected readonly errorBlocks = computed(() => this.errorIds().map((id) => ({ id, label: blockTypeLabel(this.i18n, findBlock(this.blocks(), id)?.block.type ?? '') })));
  protected readonly ownErrors = computed(() => articleOwnErrors(this.errors(), this.blocks()));

  // translations
  protected readonly outdated = signal<Record<string, string[]>>({});

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
  /** what is written next: the document, whether it is new, and what it is compared with; after a save what was written */
  private target: { key: string; isNew: boolean; loaded: SectionModel } | undefined;
  /** saved, closes by itself */
  private done = false;
  private leaving = false;
  /** a question or a message stands above the editor, or was answered just now: no save, and it does not close */
  private asking = false;
  private askingOver: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.overlay.canDismiss = () => this.mayClose();
    effect(() => this.markOutdated(this.article()));
  }

  /** Ionic. A new article opens with the cursor in its empty text: not before, nothing takes the focus while the modal is hidden. */
  public ionViewDidEnter(): void {
    if (this.isNew() && this.history().past.length === 0 && this.history().present.selectedId === undefined) this.surface().select(this.blocks()[0]?.id);
  }

  /** Ionic: closed by now, only its animation goes on. */
  public ionViewWillLeave(): void { this.leaving = true; }

  // ------------------------------------------------------- changes -------------------------------------------------------

  protected onSectionChange(section: ArticleSection): void {
    const path = typingPath(this.article(), section);
    this.surface().change((history) => changeSection(history, section, path && `article:${path}`));
  }

  /** A stable function: it is called when the panel may show another block, or the editor is closed. */
  protected readonly onUpload = (upload: ArticleUpload): void => {
    if (this.uploads) this.surface().change((history) => uploadInto(history, upload));
  };

  /** undo and redo by key */
  protected readonly mayStep = (): boolean => !this.leaving && !this.done;

  /** «Abbrechen»: the article as it is stored, as a step that can be undone. */
  protected reset(): void {
    this.surface().step((history) => restore(history, this.baseline()));
  }

  /** Whether no picker, sheet or question is open above this modal. */
  private isOnTop(): boolean {
    return topOverlay() === this.overlay;
  }

  // ------------------------------------------------------- saving -------------------------------------------------------

  /** A second press while a save runs is ignored; what is changed meanwhile stays and can be saved next. */
  protected async save(force = false): Promise<void> {
    if (this.saving() || this.asking || this.done || this.leaving || !this.valid() || !this.changed()) return;
    this.saving.set(true);
    const state = this.history().present;
    const target = this.target ?? { key: this.section().okey, isNew: this.isNew(), loaded: this.section() };
    let result: ArticleSaveResult;
    try {
      const prepared = await prepareArticleForSave(this.opened().state.section, state.section, state.copiedFrom, new Date().toISOString());
      const sent = { ...prepared, okey: target.key, tenants: target.loaded.tenants };
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
      case 'saved': return this.afterSave(result, state);
      case 'conflict':
        if (await this.ask(this.i18n.article_editor_save_conflict(), this.i18n.article_editor_save_force(), this.i18n.article_editor_save_back())) {
          this.asking = false;
          return this.save(true);
        }
        return;
      case 'gone': return this.tell(this.i18n.article_editor_save_gone());
      case 'offline': return this.tell(this.i18n.article_editor_save_offline());
      // it already showed its message
      case 'failed': return;
    }
  }

  private async afterSave(result: Extract<ArticleSaveResult, { status: 'saved' }>, state: EditorState): Promise<void> {
    if (result.trial) {
      void showToast(this.toastController, this.i18n.article_editor_save_trial());
      if (this.article() === state.section && this.isOnTop()) await this.close();
      return;
    }
    if (result.forked) void showToast(this.toastController, this.saved.message());
    this.target = { key: result.key, isNew: false, loaded: result.written };
    this.onSaved()(result.key);
    this.baseline.set(state);
    // changed meanwhile, or at work in a picker: stays open, with the banner if there is something to save
    if (!this.changed() && this.isOnTop()) await this.close(result.key);
  }

  /** Answered when the question is gone: until then it is an overlay above the editor. `no` empty: a message with one button. */
  private async ask(message: string, yes: string, no = ''): Promise<boolean> {
    // before anything is awaited: the press that follows at once finds it set
    clearTimeout(this.askingOver);
    this.asking = true;
    try {
      const buttons = [...(no ? [{ text: no, role: 'cancel' }] : []), { text: yes, role: 'confirm' }];
      const alert = await this.alertController.create({ message, buttons });
      await alert.present();
      return (await alert.onDidDismiss()).role === 'confirm';
    } finally {
      // a press on the close icon may have waited in Ionic for this answer
      this.askingOver = setTimeout(() => { this.asking = false; }, CLOSE_AGAIN_MS);
    }
  }

  private async tell(message: string): Promise<void> {
    await this.ask(message, this.i18n.ok());
  }

  // ------------------------------------------------------- closing -------------------------------------------------------

  private async close(key?: string): Promise<void> {
    this.done = true;
    await this.overlay.dismiss(key, 'confirm');
  }

  /** Close icon, Escape, hardware back and everything else that closes a modal. */
  private async mayClose(): Promise<boolean> {
    if (this.asking && !this.done) return false;
    switch (closeDecision({ done: this.done, saving: this.saving(), changed: this.changed() })) {
      case 'allow': return true;
      case 'refuse':
        void showToast(this.toastController, this.i18n.article_editor_save_running());
        return false;
      case 'ask': return this.ask(this.i18n.article_editor_discard_message(), this.i18n.article_editor_discard_confirm(), this.i18n.article_editor_discard_keep());
    }
  }

  // ------------------------------------------------------ notices --------------------------------------------------------

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
