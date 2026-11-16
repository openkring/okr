import { Component, computed, inject, input, output, signal } from '@angular/core';
import { IonInfiniteScroll, IonInfiniteScrollContent, IonSearchbar, IonToolbar } from '@ionic/angular';

import { SectionModel, UserModel } from '@okr/shared-models';

import { SectionDispatcher } from '@okr/cms-section-feature';
import { PageStore } from './page.store';

const PAGE_SIZE = 10;

/**
 * Infinite Scroll + Filters layout.
 * Sticky search bar + endless loading of articles. The tag chips live in BlogPage (all layouts).
 */
@Component({
  selector: 'okr-blog-stream',
  standalone: true,
  providers: [PageStore],
  imports: [
    SectionDispatcher,
    IonToolbar, IonSearchbar, IonInfiniteScroll, IonInfiniteScrollContent,
  ],
  styles: [`
    .filter-bar { position: sticky; top: 0; z-index: 10; background: var(--ion-background-color); }
    .article-list { padding: 8px; }
    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      padding: 4px;
      cursor: pointer;
    }
  `],
  template: `
    <!-- Filter bar -->
    <div class="filter-bar">
      <ion-toolbar>
        <ion-searchbar
          [value]="searchTerm()"
          (ionInput)="onSearch($event)"
          [placeholder]="store.i18n.blog_search()"
          debounce="300"
        />
      </ion-toolbar>
    </div>

    <!-- Article list -->
    <div class="article-list">
      @for (section of visibleSections(); track section.okey) {
        <div [id]="section.okey" (click)="sectionClick.emit(section.okey)">
          @if (editMode()) {
            <div class="section-wrapper editable">
              <okr-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
            </div>
          } @else {
            <okr-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
          }
        </div>
      }
    </div>

    <!-- Infinite scroll trigger -->
    @if (hasMore()) {
      <ion-infinite-scroll (ionInfinite)="loadMore($event)">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
    }
  `
})
export class BlogStream {
  protected readonly store = inject(PageStore);

  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();

  protected searchTerm = signal('');
  protected pageLimit = signal(PAGE_SIZE);

  protected filteredSections = computed(() => {
    let result = this.sections();
    const term = this.searchTerm().toLowerCase();
    if (term) {
      result = result.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.title?.toLowerCase().includes(term) ||
        s.content?.htmlContent?.toLowerCase().includes(term)
      );
    }
    return result;
  });

  protected visibleSections = computed(() => this.filteredSections().slice(0, this.pageLimit()));
  protected hasMore = computed(() => this.visibleSections().length < this.filteredSections().length);

  protected onSearch(event: Event): void {
    const value = (event as CustomEvent).detail.value ?? '';
    this.searchTerm.set(value);
    this.pageLimit.set(PAGE_SIZE); // reset pagination on new search
  }

  protected loadMore(event: Event): void {
    this.pageLimit.update(n => n + PAGE_SIZE);
    (event as CustomEvent & { target: { complete(): void } }).target.complete();
  }
}
