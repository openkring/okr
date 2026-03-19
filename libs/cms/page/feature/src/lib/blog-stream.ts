import { AsyncPipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { IonChip, IonInfiniteScroll, IonInfiniteScrollContent, IonLabel, IonSearchbar, IonToolbar } from '@ionic/angular/standalone';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { TranslatePipe } from '@bk2/shared-i18n';

import { SectionDispatcher } from '@bk2/cms-section-feature';

const PAGE_SIZE = 10;

/**
 * Infinite Scroll + Filters layout.
 * Sticky filter bar (search + category chips) + endless loading of articles.
 */
@Component({
  selector: 'bk-blog-stream',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe,
    SectionDispatcher,
    IonToolbar, IonChip, IonLabel, IonSearchbar, IonInfiniteScroll, IonInfiniteScrollContent,
  ],
  styles: [`
    .filter-bar { position: sticky; top: 0; z-index: 10; background: var(--ion-background-color); }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 8px; }
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
          [placeholder]="'@cms.blog.search' | translate | async"
          debounce="300"
        />
      </ion-toolbar>
      @if (allTags().length > 0) {
        <div class="chips">
          <ion-chip [color]="selectedTag() === '' ? 'primary' : 'medium'" (click)="selectTag('')">
            <ion-label>{{ '@cms.blog.filter.all' | translate | async }}</ion-label>
          </ion-chip>
          @for (tag of allTags(); track tag) {
            <ion-chip [color]="selectedTag() === tag ? 'primary' : 'medium'" (click)="selectTag(tag)">
              <ion-label>{{ tag }}</ion-label>
            </ion-chip>
          }
        </div>
      }
    </div>

    <!-- Article list -->
    <div class="article-list">
      @for (section of visibleSections(); track section.bkey) {
        <div [id]="section.bkey" (click)="sectionClick.emit(section.bkey)">
          @if (editMode()) {
            <div class="section-wrapper editable">
              <bk-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
            </div>
          } @else {
            <bk-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
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
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();

  protected searchTerm = signal('');
  protected selectedTag = signal('');
  protected pageLimit = signal(PAGE_SIZE);

  protected allTags = computed(() => {
    const tagSet = new Set<string>();
    this.sections().forEach(s => {
      if (s.tags) s.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
    });
    return [...tagSet].sort();
  });

  protected filteredSections = computed(() => {
    let result = this.sections();
    const term = this.searchTerm().toLowerCase();
    const tag = this.selectedTag();
    if (term) {
      result = result.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.title?.toLowerCase().includes(term) ||
        s.content?.htmlContent?.toLowerCase().includes(term)
      );
    }
    if (tag) {
      result = result.filter(s => s.tags?.split(',').map(t => t.trim()).includes(tag));
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

  protected selectTag(tag: string): void {
    this.selectedTag.set(tag);
    this.pageLimit.set(PAGE_SIZE);
  }

  protected loadMore(event: Event): void {
    this.pageLimit.update(n => n + PAGE_SIZE);
    (event as CustomEvent & { target: { complete(): void } }).target.complete();
  }
}
