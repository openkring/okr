import { Component, computed, effect, inject, input, untracked } from "@angular/core";
import { Router } from "@angular/router";
import { ViewWillEnter } from '@ionic/angular';

import { debugMessage, replaceSubstring } from "@bk2/shared-util-core";
import { SpinnerComponent } from "@bk2/shared-ui";

import { ContentPage } from "./content.page";
import { PageStore } from "./page.store";
import { DashboardPage } from "./dashboard.page";
import { BlogPage } from "./blog.page";
import { LandingPage } from "./landing.page";
import { ErrorPage } from "./error.page";
import { ChatPage } from "./chat.page";
import { FilesPage } from "./files.page";
import { AlbumPage } from "./album.page";

/**
 * PageDispatcher is a routable component that dispatches to the correct page component based 
 * on the pageType of the page. It receives the page id as an input, reads the page from the 
 * PageStore, and then renders the correct page component based on the pageType of the page.
 * The page components (ContentPage, DashboardPage, BlogPage) are responsible for rendering 
 * the content of the page based on the page data.
 * The reason for having a PageDispatcher is to have a single routable component for all pages, 
 * and to keep the routing simple (e.g. /page/:id) without having to define separate routes 
 * for each page type.
 * 
 * Benefits of this approach:
 * - Separation of Concerns - Each page type has its own component, template, and styles
 * - Maintainability - Adding/modifying a page type doesn't affect others
 * - Consistency - Same pattern as the Section architecture
 * - Type Safety - Each page component can have specific inputs/outputs for its type
 * - Scalability - Easy to add new page types (LandingPage, BlogPage, FormPage, etc.)
 */
@Component({
  selector: 'bk-page-dispatcher',
  standalone: true,
  imports: [
    ContentPage, DashboardPage, BlogPage, LandingPage, ErrorPage, FilesPage, AlbumPage,
    SpinnerComponent, ChatPage
],
  template: `
    @if(pageStore.isLoading()) {
          <bk-spinner />
    } @else { <!-- not loading anymore -->
        @if(page(); as page) {
            @switch (page.type) {
                @case ('landing') {
                    <bk-landing-page  />
                }
                @case ('chat') {
                    @defer (on idle) {
                        <bk-chat-page [color]="color()" [selectedRoom]="effectiveRoomId()" [isGroupView]="isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('content') {
                    @defer (on idle) {
                        <bk-content-page [contextMenuName]="contextMenuName()" [color]="color()" [showMainMenu]="!isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('dashboard') {
                    @defer (on idle) {
                        <bk-dashboard-page [contextMenuName]="contextMenuName()" [color]="color()" [showMainMenu]="!isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('blog') {
                    @defer (on idle) {
                        <bk-blog-page [contextMenuName]="contextMenuName()" [color]="color()" [showMainMenu]="!isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('files') {
                    @defer (on idle) {
                        <bk-files-page [contextMenuName]="contextMenuName()" [color]="color()" [showMainMenu]="!isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('album') {
                    @defer (on idle) {
                        <bk-album-page [id]="id()" [contextMenuName]="contextMenuName()" [color]="color()" [showMainMenu]="!isGroupView()" />
                    } @placeholder {
                        <bk-spinner />
                    }
                }
                @case ('error') {
                    <bk-error-page [errorName]="page.bkey" />
                }
                @default {
                    <bk-error-page errorName="unknownPageType" />
                }
            }
        } @else {
            <bk-error-page errorName="pageNotFound" />
        }
    }
  `
})
export class PageDispatcher implements ViewWillEnter {
  protected pageStore = inject(PageStore);
  private readonly router = inject(Router);

  // inputs
  public id = input.required<string>();
  public contextMenuName = input<string>();
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();

  // computed
  protected page = computed(() => this.pageStore.page());
  protected effectiveRoomId = computed(() => {
    // Query-param selectedRoom (e.g. for direct chat navigation) takes precedence.
    // Falls back to the page-ID convention: 'groupId_chat' → 'groupId'.
    const explicit = this.selectedRoom();
    if (explicit) return explicit;
    const pageId = this.id();
    if (pageId && pageId.endsWith('_chat')) {
      return pageId.substring(0, pageId.length - 5);
    }
    return undefined;
  });

  constructor() {
    effect(() => {
      const id = this.id(); // only reactive dependency — effect re-runs only when route id changes
      if (id) {
        untracked(() => {
          this.loadPage();
        });
      }
    });
    effect(() => {
      const page = this.pageStore.page();
      if (page && page.isPrivate) {
        const currentUrl = this.router.url;
        if (currentUrl.includes('/public/')) {
          console.warn(`PageDispatcher: page ${page.name} is private but accessed via /public/, redirecting to login`);
          this.router.navigateByUrl('/auth/login');
        }
      }
    });
  }

  // Fires before entering animation for both new and Ionic-cached pages (back navigation)
  ionViewWillEnter(): void {
    this.loadPage();
  }

  private loadPage(): void {
    const id = this.id();
    if (id) {
      const resolvedId = replaceSubstring(id, '@TID@', this.pageStore.tenantId());
      debugMessage(`PageDispatcher: pageId=${id} -> ${resolvedId}`, this.pageStore.currentUser());
      this.pageStore.setPageId(resolvedId);
    }
  }
}