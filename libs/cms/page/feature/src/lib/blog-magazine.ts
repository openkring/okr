import { Component, computed, input, output } from '@angular/core';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { SectionDispatcher } from '@bk2/cms-section-feature';

/**
 * Magazine / Editorial layout.
 * First section = large hero (full width).
 * Remaining sections in a responsive multi-column grid below.
 */
@Component({
  selector: 'bk-blog-magazine',
  standalone: true,
  imports: [SectionDispatcher],
  styles: [`
    .hero { width: 100%; margin-bottom: 16px; }
    .article-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      padding: 0 16px 16px;
    }
    .article-item { min-width: 0; }
    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      padding: 4px;
      cursor: pointer;
    }
  `],
  template: `
    @if (hero(); as hero) {
      <div class="hero" [id]="hero.bkey" (click)="sectionClick.emit(hero.bkey)">
        @if (editMode()) {
          <div class="section-wrapper editable">
            <bk-section-dispatcher [section]="hero" [currentUser]="currentUser()" [editMode]="editMode()" />
          </div>
        } @else {
          <bk-section-dispatcher [section]="hero" [currentUser]="currentUser()" [editMode]="editMode()" />
        }
      </div>
    }
    <div class="article-grid">
      @for (section of restSections(); track section.bkey) {
        <div class="article-item" [id]="section.bkey" (click)="sectionClick.emit(section.bkey)">
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
  `
})
export class BlogMagazine {
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();

  protected hero = computed(() => this.sections()[0] ?? null);
  protected restSections = computed(() => this.sections().slice(1));
}
