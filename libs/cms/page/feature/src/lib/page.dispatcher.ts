import { Component, computed, effect, inject, input, untracked, viewChild } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { ViewWillEnter } from '@ionic/angular';

import { coerceBoolean, debugMessage, replaceSubstring } from "@okr/shared-util-core";
import { DeferError, Spinner } from "@okr/shared-ui";

import { ContentPage } from "./content.page";
import { PageStore } from "./page.store";
import { DashboardPage } from "./dashboard.page";
import { BlogPage } from "./blog.page";
import { LandingPage } from "./landing.page";
import { ErrorPage } from "./error.page";
import { ChatPage } from "./chat.page";
import { FilesPage } from "./files.page";
import { AlbumPage } from "./album.page";
import { GraphPage } from "./graph.page";

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
  selector: 'okr-page-dispatcher',
  standalone: true,
  imports: [
    ContentPage, DashboardPage, BlogPage, LandingPage, ErrorPage, FilesPage, AlbumPage, GraphPage,
    Spinner, DeferError, ChatPage
],
  template: `
    @if(pageStore.isLoading()) {
          <okr-spinner />
    } @else { <!-- not loading anymore -->
        @if(page(); as page) {
            @switch (page.type) {
                @case ('landing') {
                    <okr-landing-page  />
                }
                @case ('chat') {
                    @defer (on idle) {
                        <okr-chat-page [color]="color()" [selectedRoom]="effectiveRoomId()" [isGroupView]="isGroupView()" [contextMenuName]="contextMenuName() ?? 'contextMenuChat'" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('content') {
                    @defer (on idle) {
                        <okr-content-page [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu() && !isGroupView()" [groupAdmin]="groupAdmin()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('dashboard') {
                    @defer (on idle) {
                        <okr-dashboard-page [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('blog') {
                    @defer (on idle) {
                        <okr-blog-page [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('files') {
                    @defer (on idle) {
                        <okr-files-page [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('album') {
                    @defer (on idle) {
                        <okr-album-page [id]="id()" [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('graph') {
                    @defer (on idle) {
                        <okr-graph-page [contextMenuName]="contextMenuName()" [color]="color()" [showMenu]="showMenu()" />
                    } @placeholder {
                        <okr-spinner />
                    } @error {
                        <okr-defer-error />
                    }
                }
                @case ('error') {
                    <okr-error-page [errorName]="page.okey" />
                }
                @default {
                    <okr-error-page errorName="unknownPageType" />
                }
            }
        } @else {
            <okr-error-page errorName="pageNotFound" />
        }
    }
  `
})
export class PageDispatcher implements ViewWillEnter {
  protected pageStore = inject(PageStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // inputs
  public id = input.required<string>();
  public contextMenuName = input<string>();
  public color = input('secondary');
  public isGroupView = input(false);
  public selectedRoom = input<string | undefined>();
  public groupAdmin = input(false);

  // ?showMenu=false hides the toolbar and main menu (for embedding in external sites)
  private readonly queryParamMap = toSignal(this.route.queryParamMap);
  protected showMenu = computed(() => {
    const qp = this.queryParamMap()?.get('showMenu');
    if (qp != null) return coerceBoolean(qp);
    return coerceBoolean(this.route.snapshot.data['showMenu'] ?? 'true');
  });

  /* ---- hoist facade (group view) ----
   * When embedded in the group view, content/chat suppress their own toolbar and the group toolbar
   * hosts a single context menu (+ chat info icon). The group can't viewChild the page directly (it
   * lives in this dispatcher's template), so the dispatcher exposes this facade and delegates to the
   * active page component. */
  private readonly contentPage = viewChild(ContentPage);
  private readonly chatPage = viewChild(ChatPage);

  public readonly hoistMenuName = computed<string | undefined>(() => {
    switch (this.page()?.type) {
      case 'content': return this.contextMenuName() ?? 'c-contentpage';
      case 'chat': return this.contextMenuName() ?? 'contextMenuChat';
      default: return undefined;
    }
  });

  public readonly showHoistMenu = computed(() => {
    switch (this.page()?.type) {
      // group content menu is for group admins only (not global contentAdmins), matching the
      // menu's forceVisible=isGroupAdmin. Also require the ContentPage to be resolved: this defers
      // the hoisted button until the content view has settled (so Ionic's one-shot popover-trigger
      // wiring binds to a stable DOM) and guarantees a delegate exists for onHoistMenuDismiss.
      case 'content': return this.contentPage() != null && this.groupAdmin();
      // every signed-in member may pin a room, so this is NOT the admin gate — the two
      // room-management rows stay admin-only inside <okr-menu>
      case 'chat': return this.chatPage()?.canOpenRoomMenu() ?? false;
      default: return false;
    }
  });

  public readonly showHoistInfo = computed(() =>
    this.page()?.type === 'chat' && (this.chatPage()?.hasRoom() ?? false)
  );

  // toggle state for the hoisted content menu's 'toggleEditMode' item
  public readonly contentEditActive = computed(() => this.contentPage()?.isEditModeActive() ?? false);

  // toggle state for the hoisted chat menu's 'chat-room-pin' item (keyed by its url, 'togglePin')
  public readonly chatMenuToggleStates = computed<Record<string, boolean>>(() => this.chatPage()?.roomMenuToggleStates() ?? {});

  public async onHoistMenuDismiss($event: CustomEvent): Promise<void> {
    switch (this.page()?.type) {
      case 'content': await this.contentPage()?.onPopoverDismiss($event); break;
      case 'chat': await this.chatPage()?.onContextMenuDismiss($event); break;
    }
  }

  public async openHoistInfo(): Promise<void> {
    await this.chatPage()?.openInfo();
  }

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