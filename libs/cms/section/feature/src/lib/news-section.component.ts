import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle } from '@ionic/angular/standalone';

import { EmptyListComponent, ImageComponent, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, navigateByUrl } from '@bk2/shared-util-angular';
import { ArticleSection, IMAGE_STYLE_SHAPE, NewsConfig, SectionModel } from '@bk2/shared-models';

import { NewsStore } from './news-section.store';

@Component({
  selector: 'bk-news-section',
  standalone: true,
  styles: [`
    .news-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
      padding: 8px;
    }
    ion-card { margin: 0; height: 100%; cursor: pointer; }
    ion-card-title { font-size: 1rem; font-weight: 600; }
    ion-card-subtitle { font-size: 0.85rem; }
    .article-excerpt {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      font-size: 0.9rem;
      color: var(--ion-color-medium);
      margin-top: 4px;
    }
    .more-btn { display: flex; justify-content: flex-end; padding: 4px 8px 8px; }
  `],
  providers: [NewsStore],
  imports: [
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent, ImageComponent,
    IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle,
    IonButton,
  ],
  template: `
    @if (isLoading()) {
      <bk-spinner />
    } @else {
      <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
      @if (news().length === 0) {
        <bk-empty-list message="@cms.news.empty" />
      } @else {
        <div class="news-grid">
          @for (article of news(); track article.bkey) {
            <ion-card (click)="showActions(article)">
              @if (article.properties.image.url) {
                <bk-img [image]="article.properties.image" [imageStyle]="imageStyle" />
              }
              <ion-card-header>
                <ion-card-title>{{ article.title }}</ion-card-title>
                @if (article.subTitle) {
                  <ion-card-subtitle>{{ article.subTitle }}</ion-card-subtitle>
                }
              </ion-card-header>
              @if (articleExcerpt(article)) {
                <ion-card-content>
                  <div class="article-excerpt" [innerHTML]="articleExcerpt(article)"></div>
                </ion-card-content>
              }
            </ion-card>
          }
        </div>
        @if (showMoreButton()) {
          <div class="more-btn">
            <ion-button fill="clear" (click)="openMoreUrl()">Mehr...</ion-button>
          </div>
        }
      }
    }
  `,
})
export class NewsSectionComponent implements OnInit {
  protected newsStore = inject(NewsStore);
  private readonly platformId = inject(PLATFORM_ID);
  private router = inject(Router);
  private actionSheetController = inject(ActionSheetController);

  public section = input<SectionModel>();
  public editMode = input<boolean>(false);

  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);
  protected readonly config = computed(() => this.section()?.properties as NewsConfig | undefined);
  protected readonly moreUrl = computed(() => this.config()?.moreUrl ?? '');
  protected readonly showMoreButton = computed(() => this.moreUrl().length > 0);
  protected readonly maxItems = computed(() => this.config()?.maxItems);
  protected readonly blogPageKey = computed(() => this.config()?.blogPageKey);
  protected readonly news = computed(() => this.newsStore.news());
  protected currentUser = computed(() => this.newsStore.currentUser());
  protected isLoading = computed(() => this.newsStore.isLoading());

  protected readonly imageStyle = IMAGE_STYLE_SHAPE;

  private imgixBaseUrl = this.newsStore.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.newsStore.setConfig(this.blogPageKey(), this.maxItems());
      debugMessage(`NewsSection: blogPageKey=${this.blogPageKey()}, maxItems=${this.maxItems()}`, this.currentUser());
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        if (isPlatformBrowser(this.platformId)) window.dispatchEvent(new Event('resize'));
      }, 1);
    }
  }

  /** Strip HTML tags and return plain-text excerpt. */
  protected articleExcerpt(article: ArticleSection): string {
    const html = article.content?.htmlContent ?? '';
    return html.replace(/<[^>]*>/g, '').trim().substring(0, 200);
  }

  protected async showActions(article: ArticleSection): Promise<void> {
    if (this.editMode()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, article);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('news.view', this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('eventAdmin', this.currentUser()) || hasRole('privileged', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('news.edit', this.imgixBaseUrl, 'create_edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'close_cancel'));
    if (actionSheetOptions.buttons.length === 1) actionSheetOptions.buttons = [];
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, article: ArticleSection): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'news.view': await this.newsStore.edit(article, true); break;
        case 'news.edit': await this.newsStore.edit(article, false); break;
      }
    }
  }

  protected openMoreUrl(): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, this.moreUrl());
  }
}
