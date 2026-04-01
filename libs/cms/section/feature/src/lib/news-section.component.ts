import { isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ActionSheetOptions, IonCard, IonCardContent, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { EmptyListComponent, MoreButton, OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { debugMessage, hasRole } from '@bk2/shared-util-core';
import { createActionSheetButton, createActionSheetOptions, navigateByUrl } from '@bk2/shared-util-angular';
import { ArticleSection, IMAGE_STYLE_SHAPE, NewsConfig, SectionModel } from '@bk2/shared-models';

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
    OptionalCardHeaderComponent, SpinnerComponent, EmptyListComponent,
    IonCard, IonCardContent, MoreButton, IonList, IonItem, IonLabel
  ],
  template: `
    @if (isLoading()) {
      <bk-spinner />
    } @else {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          @if (news().length === 0) {
            <bk-empty-list message="@cms.news.empty" />
          } @else {
            <ion-list lines="inset">
              @for (article of news(); track article.bkey) {
                <ion-item (click)="navigateToArticle(article)">
                  <ion-label>
                    @if (article.subTitle) {
                      <p class="subtitle">{{ article.subTitle }}</p>
                    }
                    <p class="title">{{ article.title }}</p>
                    <div class="excerpt" [innerHTML]="articleExcerpt(article)"></div>
                  </ion-label>
                </ion-item>
              }
              @if(showMoreButton() && !editMode()) {
                <bk-more-button [url]="moreUrl()" />
              }
            </ion-list>
          }
        </ion-card-content>
      </ion-card>
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

  /** Strip HTML tags and return plain-text excerpt of the first 30 words. */
  protected articleExcerpt(article: ArticleSection): string {
    const text = (article.content?.htmlContent ?? '').replace(/<[^>]*>/g, '').trim();
    return text.split(/\s+/).slice(0, 30).join(' ') + '...';
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
      actionSheetOptions.buttons.push(createActionSheetButton('news.edit', this.imgixBaseUrl, 'edit'));
    }
    actionSheetOptions.buttons.push(createActionSheetButton('cancel', this.imgixBaseUrl, 'cancel'));
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

  protected navigateToArticle(article: ArticleSection): void {
    if (this.editMode()) return;
    const url = this.moreUrl();
    if (!url) return;
    this.router.navigate([url], { fragment: article.bkey });
  }
}
