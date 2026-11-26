import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, TemplateRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import { IonButton, IonIcon, ModalController, ToastController } from '@ionic/angular';

import {
  ARTICLE_BLOCKS_MAX, ARTICLE_EDITOR_I18N_KEYS, MAIL_PROFILE, SECTION_I18N_KEYS, articleImageChoices, findBlock, firstTextId, mailBlocksFromArticle, teaserBlocks,
  type ArticleEditorI18n, type ArticleUpload, type EditorHistory, type EditorState, type MailEditorContext, type MailEditorDraft,
} from '@okr/cms-section-util';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import type { MailBlock, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { showToast } from '@okr/shared-util-angular';
import { fill, type MailEventLine } from '@okr/shared-util-core';

import { ArticleEditorSurface } from './article-editor-surface';
import { editorBlocks, insertedInto, uploadInto } from './article-editor-surface.util';
import type { MailArticleChoice } from './mail-article-pick.modal';

type History = EditorHistory<EditorState>;

/**
 * The editor of a Versand mail in the composer (spec 1.176 §8.1, §10): the head line of the composer, then the editor surface with
 * `MAIL_PROFILE`; with nothing selected the panel shows the block library and below it what the composer puts there.
 *
 * The composer does not know this class: it gets `loadMailEditor` from `bulk-email.ts`, creates the host with `createComponent` and sets
 * its inputs by name. The draft (`MailEditorDraft`) holds the history, so that it outlives the host; the host's own changes (an upload
 * that ends late) go through the surface while it is there, else straight to the draft.
 *
 * Only reachable through `loadMailEditor`: no chunk that loads at first holds it.
 */
@Component({
  selector: 'okr-mail-editor-host',
  standalone: true,
  imports: [ArticleEditorSurface, IonButton, IonIcon, NgTemplateOutlet, SvgIconPipe],
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; min-height: 0; height: 100%; }
    .head { flex: none; border-bottom: 1px solid var(--ion-color-light-shade); }
    okr-article-editor-surface { flex: 1; min-height: 0; }
  `],
  template: `
    @if (head(); as head) {
      <div class="head"><ng-container [ngTemplateOutlet]="head" /></div>
    }
    <okr-article-editor-surface [profile]="profile" [history]="draft().history()" (historyChange)="onHistory($event)" [errors]="draft().errors()"
      [articleImages]="articleImages()" [onUpload]="onUpload()" [storagePath]="storagePath()" [currentUser]="currentUser()"
      [eventLines]="eventLines()" [calendars]="calendars()" [active]="active()" [i18n]="i18n">
      <ion-button barEnd fill="clear" size="small" [title]="i18n.article_editor_mail_insert_button()" (click)="insertArticle()">
        <ion-icon slot="start" src="{{ 'add' | svgIcon }}" aria-hidden="true" />
        {{ i18n.article_editor_mail_insert_button() }}
      </ion-button>
      <ng-template #nothingSelected>
        @if (panel(); as panel) { <ng-container [ngTemplateOutlet]="panel" /> }
      </ng-template>
    </okr-article-editor-surface>
  `,
})
export class MailEditorHost {
  // inputs, set by name by the composer
  public readonly draft = input.required<MailEditorDraft>();
  public readonly context = input.required<MailEditorContext>();
  /** the composer's head line: subject, template, web version */
  public readonly head = input<TemplateRef<unknown>>();
  /** what the panel shows below the block library while nothing is selected: answer-link events and attachments */
  public readonly panel = input<TemplateRef<unknown>>();
  public readonly storagePath = input.required<string>();
  public readonly currentUser = input<UserModel | undefined>();
  /** asked at a key press: false while the composer closes or sends */
  public readonly active = input<() => boolean>(() => true);

  protected readonly profile = MAIL_PROFILE;
  protected readonly i18n = inject(I18nService).translateAll({ ...SECTION_I18N_KEYS, ...ARTICLE_EDITOR_I18N_KEYS }) as ArticleEditorI18n;
  private readonly surface = viewChild(ArticleEditorSurface);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);

  private readonly blocks = computed<MailBlock[]>(() => editorBlocks(this.draft().history().present));
  protected readonly articleImages = computed(() => articleImageChoices(this.draft().history().present.section));

  // events: read once per calendar while the host is there, as the server lists them when it sends
  protected readonly calendars = signal<{ key: string; name: string }[]>([]);
  protected readonly eventLines = signal<Record<string, MailEventLine[]>>({});
  private readonly requested = new Set<string>();
  private readonly calendarKeys = computed(() => [...new Set(this.blocks()
    .filter((block) => block?.type === 'events' && typeof block.calendarKey === 'string' && block.calendarKey !== '')
    .map((block) => (block as Extract<MailBlock, { type: 'events' }>).calendarKey))], { equal: (a, b) => a.join('\n') === b.join('\n') });
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; });
    effect(() => {
      const context = this.context();
      untracked(() => void context.calendars().then((calendars) => { if (!this.destroyed) this.calendars.set(calendars); }, () => undefined));
    });
    effect(() => {
      const keys = this.calendarKeys();
      const context = this.context();
      untracked(() => {
        for (const key of keys.filter((k) => !this.requested.has(k))) {
          this.requested.add(key);
          void context.eventLines(key).catch(() => [] as MailEventLine[]).then((lines) => {
            if (!this.destroyed) this.eventLines.update((all) => ({ ...all, [key]: lines }));
          });
        }
      });
    });
  }

  /** The cursor into the first text (from the subject, or when the composer opens with a subject). False without a text. */
  public focusFirstText(): boolean {
    const id = firstTextId(this.blocks());
    const surface = this.surface();
    if (!id || !surface || this.destroyed) return false;
    surface.open(id);
    return true;
  }

  /**
   * Selects a block from outside (a block the server refused, spec 1.176 §13): it gets the focus and comes into sight, a text with the
   * cursor. False when the editor is not there or the mail has no such block.
   */
  public open(id: string): boolean {
    const surface = this.surface();
    if (!surface || this.destroyed || !findBlock(this.blocks(), id)) return false;
    surface.open(id);
    return true;
  }

  /**
   * «Artikel einfügen» (§8.3): the picker is loaded when it is asked for; what it answers becomes blocks (placeholders replaced, new ids) and
   * goes in as one step. A mail of more than 50 blocks is refused with the library's note. Errors of the new blocks show as any other.
   */
  protected async insertArticle(): Promise<void> {
    const pageKey = this.draft().pageKey();
    const { MailArticlePickModal } = await import('./mail-article-pick.modal');
    const modal = await this.modalController.create({
      component: MailArticlePickModal, componentProps: { i18n: this.i18n, context: this.context() }, cssClass: ['modal-wide', 'modal-fixed-height'],
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<MailArticleChoice>();
    // the composer may have moved on (closed, another draft) while the picker was open
    if (role !== 'confirm' || !data || this.destroyed || this.draft().pageKey() !== pageKey) return;
    const replace = (html: string): string => this.appStore.replacePlaceholders(html);
    const blocks = data.mode === 'teaser' && data.url
      ? teaserBlocks(data.article, data.url, { more: this.i18n.article_editor_mail_insert_more() }, newId)
          .map((block) => (block.type === 'text' ? { ...block, html: replace(block.html) } : block))
      : mailBlocksFromArticle(data.article, replace, newId);
    const next = insertedInto(this.draft().history(), blocks);
    if (next === 'full') {
      void showToast(this.toastController, fill(this.i18n.article_editor_mail_full(), { max: ARTICLE_BLOCKS_MAX }));
      return;
    }
    if (!this.surface()?.change(() => next)) this.draft().setHistory(next);
    // the last new block is selected; a text also takes the cursor, any other only stays selected
    const last = blocks[blocks.length - 1];
    if (last?.type === 'text') this.surface()?.open(last.id);
  }

  protected onHistory(history: History): void {
    this.draft().setHistory(history);
  }

  /**
   * What an upload calls when it ends; the panels take it when they offer an upload, so each upload holds the one of the page it was
   * started for (a new function only when the page changes). It may end when the host is gone: the picture then goes straight into the
   * draft. One that ends after the composer moved on to another page («Zurücksetzen», a continued or copied draft) is dropped: it
   * belongs to a page that is no longer edited.
   */
  protected readonly onUpload = computed(() => {
    const pageKey = this.draft().pageKey();
    return (upload: ArticleUpload): void => {
      if (untracked(() => this.draft().pageKey()) !== pageKey) return;
      const go = (history: History): History => uploadInto(history, upload);
      if (this.destroyed || !this.surface()?.change(go)) this.draft().setHistory(go(this.draft().history()));
    };
  });
}

function newId(): string { return crypto.randomUUID(); }
