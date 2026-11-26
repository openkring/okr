import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, TemplateRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';

import {
  ARTICLE_EDITOR_I18N_KEYS, MAIL_PROFILE, SECTION_I18N_KEYS, articleImageChoices, firstTextId,
  type ArticleEditorI18n, type ArticleUpload, type EditorHistory, type EditorState, type MailEditorContext, type MailEditorDraft,
} from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import type { MailBlock, UserModel } from '@okr/shared-models';
import type { MailEventLine } from '@okr/shared-util-core';

import { ArticleEditorSurface } from './article-editor-surface';
import { editorBlocks, uploadInto } from './article-editor-surface.util';

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
  imports: [ArticleEditorSurface, NgTemplateOutlet],
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
      [articleImages]="articleImages()" [onUpload]="onUpload" [storagePath]="storagePath()" [currentUser]="currentUser()"
      [eventLines]="eventLines()" [calendars]="calendars()" [active]="active()" [i18n]="i18n">
      <ng-template #nothingSelected>
        @if (panel(); as panel) { <ng-container [ngTemplateOutlet]="panel" /> }
      </ng-template>
    </okr-article-editor-surface>
  `,
})
export class MailEditorHost implements OnInit {
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
  /** The draft page this host was made for; set before its first change detection. */
  private pageKey: string | undefined;

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

  public ngOnInit(): void {
    this.pageKey = this.draft().pageKey();
  }

  /** The cursor into the first text (from the subject, or when the composer opens with a subject). False without a text. */
  public focusFirstText(): boolean {
    const id = firstTextId(this.blocks());
    const surface = this.surface();
    if (!id || !surface || this.destroyed) return false;
    surface.open(id);
    return true;
  }

  protected onHistory(history: History): void {
    this.draft().setHistory(history);
  }

  /**
   * Stable: an upload may end when the host is gone, the picture then goes straight into the draft. One that ends after the composer
   * moved on to another page («Zurücksetzen», a continued or copied draft) is dropped: it belongs to a page that is no longer edited.
   */
  protected readonly onUpload = (upload: ArticleUpload): void => {
    if (this.draft().pageKey() !== this.pageKey) return;
    const go = (history: History): History => uploadInto(history, upload);
    if (this.destroyed || !this.surface()?.change(go)) this.draft().setHistory(go(this.draft().history()));
  };
}
