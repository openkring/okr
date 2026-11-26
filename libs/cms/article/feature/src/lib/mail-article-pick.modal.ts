import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { AlertController, IonButton, IonContent, IonItem, IonLabel, IonList, IonSearchbar, IonSpinner, IonThumbnail, ModalController } from '@ionic/angular';

import { articleIsPublic, articlesMatching, newsArticleUrl, type ArticleEditorI18n, type MailEditorContext } from '@okr/cms-section-util';
import { articleCover, type ArticleSection, type WebsiteModel } from '@okr/shared-models';
import { PrettyDatePipe, ThumbnailUrlPipe } from '@okr/shared-pipes';
import { Header, ImgDirective } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';

/** What the picker answers (role `confirm`): the article and how it goes in; `url` is the page of a teaser. */
export interface MailArticleChoice {
  article: ArticleSection;
  mode: 'whole' | 'teaser';
  url?: string;
}

/**
 * «Artikel einfügen» (spec 1.176 §8.3): the articles the sender may insert, newest first, with a search, and per article «Ganz einfügen» and,
 * only when the news page of the website can show it to everybody, «Als Vorschau mit Link». A picker, not a form: nothing is stored here;
 * the host turns the choice into blocks. Articles and site are read when it opens.
 *
 * Only reachable through a relative dynamic import of the mail host.
 */
@Component({
  selector: 'okr-mail-article-pick-modal',
  standalone: true,
  imports: [Header, IonContent, IonSearchbar, IonList, IonItem, IonLabel, IonThumbnail, IonButton, IonSpinner, ImgDirective, PrettyDatePipe, ThumbnailUrlPipe],
  styles: [`
    ion-thumbnail { --size: 56px; --border-radius: 6px; }
    .none { width: 56px; height: 56px; border-radius: 6px; background: var(--ion-color-light-shade); }
    .title { white-space: normal; font-weight: 600; }
    .date { font-size: 0.85rem; color: var(--ion-color-medium); }
    .choices { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .choices ion-button { margin: 0; }
    .state { display: flex; justify-content: center; padding: 32px 16px; text-align: center; color: var(--ion-color-medium); }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n().article_editor_mail_insert_button() }" [isModal]="true" />
    <ion-content>
      @switch (state()) {
        @case ('loading') {
          <div class="state"><ion-spinner name="bubbles" [attr.aria-label]="i18n().article_editor_mail_insert_button()" /></div>
        }
        @case ('failed') {
          <div class="state" role="alert">{{ i18n().article_editor_mail_insert_failed() }}</div>
        }
        @default {
          @if (articles().length > 0) {
            <ion-searchbar [debounce]="150" [placeholder]="i18n().article_editor_mail_insert_search()" (ionInput)="query.set($any($event).detail.value ?? '')" />
          }
          @if (rows().length === 0) {
            <div class="state">{{ articles().length === 0 ? i18n().article_editor_mail_insert_empty() : i18n().article_editor_mail_insert_noMatch() }}</div>
          } @else {
            <ion-list lines="full">
              @for (row of rows(); track row.article.okey) {
                <ion-item>
                  @if (row.cover; as cover) {
                    <ion-thumbnail slot="start"><img okrImg [src]="cover | thumbnailUrl" alt="" /></ion-thumbnail>
                  } @else {
                    <div slot="start" class="none"></div>
                  }
                  <ion-label>
                    <div class="title">{{ row.title }}</div>
                    @if (row.date) { <div class="date">{{ row.date | prettyDate }}</div> }
                    <div class="choices">
                      <ion-button size="small" fill="outline" (click)="choose(row.article, 'whole')">{{ i18n().article_editor_mail_insert_whole() }}</ion-button>
                      @if (row.url; as url) {
                        <ion-button size="small" fill="outline" (click)="choose(row.article, 'teaser', url)">{{ i18n().article_editor_mail_insert_teaser() }}</ion-button>
                      }
                    </div>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          }
        }
      }
    </ion-content>
  `,
})
export class MailArticlePickModal implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly alertController = inject(AlertController);

  public readonly i18n = input.required<ArticleEditorI18n>();
  public readonly context = input.required<MailEditorContext>();

  protected readonly state = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly articles = signal<ArticleSection[]>([]);
  private readonly site = signal<WebsiteModel | undefined>(undefined);
  protected readonly query = signal('');

  protected readonly rows = computed(() => articlesMatching(this.articles(), this.query()).map((article) => {
    const cover = articleCover(article)?.url;
    return {
      article,
      title: article.title?.trim() || this.i18n().article_editor_mail_insert_untitled(),
      date: article.properties?.datePublished,
      cover: cover || undefined,
      url: newsArticleUrl(this.site(), article),
    };
  }));

  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; });
  }

  /** The inputs are set by now (not in the constructor). */
  public ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const context = this.context();
      const [articles, site] = await Promise.all([context.articles(), context.site()]);
      if (this.destroyed) return;
      this.articles.set(articles);
      this.site.set(site);
      this.state.set('ready');
    } catch (err) {
      console.warn('MailArticlePickModal: reading the articles failed', err);
      if (!this.destroyed) this.state.set('failed');
    }
  }

  protected async choose(article: ArticleSection, mode: 'whole' | 'teaser', url?: string): Promise<void> {
    // a mail leaves the app: say so before an article that not everybody may read goes in (a teaser has a public page by definition)
    if (mode === 'whole' && !articleIsPublic(article)) {
      const t = this.i18n();
      const alert = await this.alertController.create({
        header: t.article_editor_mail_insert_notPublic(),
        message: t.article_editor_mail_insert_notPublicMore(),
        buttons: [{ text: t.article_editor_mail_insert_cancel(), role: 'cancel' }, { text: t.article_editor_mail_insert_confirm(), role: 'confirm' }],
      });
      await alert.present();
      const go = (await alert.onWillDismiss()).role === 'confirm';
      if (!go) return;
    }
    const choice: MailArticleChoice = { article, mode, ...(url === undefined ? {} : { url }) };
    await dismissOverlay(this.modalController, choice, 'confirm');
  }
}
