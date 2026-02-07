import { Component, computed, effect, inject, input } from "@angular/core";
import { ContentPage } from "./content.page";
import { PageStore } from "./page.store";
import { debugMessage, replaceSubstring } from "@bk2/shared-util-core";
import { Router } from "@angular/router";
import { DashboardPage } from "./dashboard.page";
import { BlogPage } from "./blog.page";
import { LandingPage } from "./landing.page";
import { ErrorPage } from "./error.page";
import { SpinnerComponent } from "@bk2/shared-ui";
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
    ContentPage, DashboardPage, BlogPage, LandingPage, ErrorPage,
    SpinnerComponent
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
                @case ('content') {
                    <bk-content-page [contextMenuName]="contextMenuName()" [color]="color()" />
                }
                @case ('dashboard') {
                    <bk-dashboard-page [contextMenuName]="contextMenuName()" [color]="color()" />
                }
                @case ('blog') {
                    <bk-blog-page [contextMenuName]="contextMenuName()" [color]="color()" />
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
export class PageDispatcher {
  protected pageStore = inject(PageStore);
  private readonly router = inject(Router);

  // inputs
  public id = input.required<string>();
  public contextMenuName = input<string>();
  public color = input('secondary');

  protected page = computed(() => this.pageStore.page());

  constructor() {
    effect(() => {
      if (this.id()) {
        const id = replaceSubstring(this.id(), '@TID@', this.pageStore.tenantId());
        debugMessage(`PageDispatcher: pageId=${this.id()} -> ${id}`, this.pageStore.currentUser());
        this.pageStore.setPageId(id);
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
}