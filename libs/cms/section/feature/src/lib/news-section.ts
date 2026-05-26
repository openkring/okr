
import { Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonItem, IonLabel, IonList, IonThumbnail } from '@ionic/angular/standalone';

import { EmptyList, MoreButton, OptionalCardHeader, Spinner } from '@bk2/shared-ui';
import { debugMessage, hasRole, shortenText } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, isBrowser, navigateByUrl } from '@bk2/shared-util-angular';
import { ArticleSection, IMAGE_STYLE_SHAPE, NewsConfig, SectionModel } from '@bk2/shared-models';
import { ThumbnailUrlPipe } from '@bk2/shared-pipes';

import { NewsStore } from './news-section.store';

@Component({
  selector: 'bk-news-section',
  standalone: true,
  styles: [`
    .title { font-size: 1rem; font-weight: 600; }
    .subtitle { font-size: 0.8rem }
    .excerpt { font-size: 0.9rem }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important; }
  `],
  providers: [NewsStore],
  imports: [
    OptionalCardHeader, Spinner, EmptyList,
    IonCard, IonCardContent, MoreButton, IonList, IonItem, IonLabel, IonThumbnail,
    ThumbnailUrlPipe,
  ],
  template: `
    @if (isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (news().length === 0) {
            <bk-empty-list [message]="store.i18n.empty()" />
          } @else {
            <ion-list lines="none">
              @for (article of news(); track article.bkey) {
                <ion-item (click)="navigateToArticle(article)">
                  @if (article.properties.images.length > 0 && article.properties.images[0].url) {
                    <ion-thumbnail slot="start">
                      <img [src]="article.properties.images[0].url | thumbnailUrl"
                           [alt]="article.properties.images[0].altText || article.title" />
                    </ion-thumbnail>
                  }
                  <ion-label>
                    @if (article.subTitle) {
                      <p class="subtitle">{{ article.subTitle }}</p>
                    }
                    <p class="title">{{ article.title }}</p>
                  </ion-label>
                </ion-item>
                <ion-item lines="inset">
                  <ion-label>
                    <div class="excerpt" [innerHTML]="articleExcerpt(article)"></div>
                  </ion-label>
                </ion-item>
              }
              @if(showMoreButton() && !editMode()) {
                <bk-more-button [url]="moreUrl()" [label]="store.i18n.more()" />
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class NewsSectionComponent implements OnInit {
  protected store = inject(NewsStore);
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
  protected readonly news = computed(() => this.store.news());
  protected currentUser = computed(() => this.store.currentUser());
  protected isLoading = computed(() => this.store.isLoading());

  protected readonly imageStyle = IMAGE_STYLE_SHAPE;

  private imgixBaseUrl = this.store.appStore.env.services.imgixBaseUrl;

  constructor() {
    effect(() => {
      this.store.setConfig(this.blogPageKey(), this.maxItems());
      debugMessage(`NewsSection: blogPageKey=${this.blogPageKey()}, maxItems=${this.maxItems()}`, this.currentUser());
    });
  }

  ngOnInit(): void {
    if (isBrowser(this.platformId)) {
      setTimeout(() => {
        if (isBrowser(this.platformId)) window.dispatchEvent(new Event('resize'));
      }, 1);
    }
  }

  protected articleExcerpt(article: ArticleSection): string {
    return shortenText(article.content?.htmlContent ?? '', 30, true);
  }

  protected async showActions(article: ArticleSection): Promise<void> {
    if (this.editMode()) return;
    const actionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    this.addActionSheetButtons(actionSheetOptions);
    await this.executeActions(actionSheetOptions, article);
  }

  private addActionSheetButtons(actionSheetOptions: ActionSheetOptions): void {
    if (hasRole('registered', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('news.view', this.store.i18n.view(), this.imgixBaseUrl, 'eye-on'));
    }
    if (hasRole('eventAdmin', this.currentUser()) || hasRole('privileged', this.currentUser())) {
      actionSheetOptions.buttons.push(createActionSheetButton('news.edit', this.store.i18n.edit(), this.imgixBaseUrl, 'edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), this.imgixBaseUrl, 'cancel'));
    if (actionSheetOptions.buttons.length === 1) actionSheetOptions.buttons = [];
  }

  private async executeActions(actionSheetOptions: ActionSheetOptions, article: ArticleSection): Promise<void> {
    if (actionSheetOptions.buttons.length > 0) {
      const actionSheet = await this.actionSheetController.create(actionSheetOptions);
      await actionSheet.present();
      const { data } = await actionSheet.onDidDismiss();
      if (!data) return;
      switch (data.action) {
        case 'news.view': await this.store.edit(article, true); break;
        case 'news.edit': await this.store.edit(article, false); break;
      }
    }
  }

  protected openMoreUrl(): void {
    if (this.editMode()) return;
    navigateByUrl(this.router, this.moreUrl());
  }

  protected navigateToArticle(article: ArticleSection): void {
    if (this.editMode()) return;
    const url = this.moreUrl();
    if (!url) return;
    this.router.navigate([url], { fragment: article.bkey });
  }
}
