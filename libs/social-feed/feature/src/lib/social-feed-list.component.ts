import { Component, inject, linkedSignal, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';
import { IonContent, IonInfiniteScroll, IonInfiniteScrollContent, IonItem, IonList } from '@ionic/angular/standalone';

import { SocialPostComponent } from '@bk2/social-feed/ui';
import { SocialPostModel } from '@bk2/shared/models';
import { SocialFeedService } from '@bk2/social-feed/data-access';


@Component({
  selector: 'bk-social-feed-feature',
  imports: [ 
    IonContent, IonInfiniteScroll, IonInfiniteScrollContent, IonList, IonItem,
    SocialPostComponent
  ],
  styles: `
  ion-item { --padding-start: 0px; --inner-padding-end: 0px;}
  `,
  template: `
    <ion-content>
      <ion-list>
        @for(post of posts(); track post.id) {
          <ion-item>
            <bk-social-post [post]="post" />
          </ion-item>
        }
      </ion-list>
      <ion-infinite-scroll (ionInfinite)="loadPosts()">
        <ion-infinite-scroll-content loadingSpinner="bubbles" loadingText="Loading more data..." />
      </ion-infinite-scroll>
    </ion-content>
  `
})
export default class SocialFeedFeatureComponent {
  private readonly socialFeedService = inject(SocialFeedService);
  private readonly IonInfiniteScroll = viewChild.required(IonInfiniteScroll);

  private readonly socialFeeds$ = this.socialFeedService.getFeed();
  private readonly postsResource = rxResource({
    stream: () =>
      this.socialFeeds$.pipe(tap(() => this.IonInfiniteScroll().complete())),
  });

  readonly posts = linkedSignal<SocialPostModel[], SocialPostModel[]>({
    source: () => this.postsResource.value() ?? [],
    computation: (newPosts, posts) => [...(posts?.value ?? []), ...newPosts],
  });

  loadPosts(): void {
    this.postsResource.reload();
  }}