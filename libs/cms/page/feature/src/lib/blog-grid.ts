import { Component, input, output } from '@angular/core';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { SectionDispatcher } from '@bk2/cms-section-feature';

/**
 * Full-width Card Grid layout.
 * Responsive 2–4 column grid (Pinterest / Medium style) using CSS Grid.
 */
@Component({
  selector: 'bk-blog-grid',
  standalone: true,
  imports: [SectionDispatcher],
  styles: [`
    .blog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
      padding: 16px;
    }
    .grid-item { min-width: 0; }
    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      padding: 4px;
      cursor: pointer;
    }
  `],
  template: `
    <div class="blog-grid">
      @for (section of sections(); track section.bkey) {
        <div class="grid-item" [id]="section.bkey" (click)="sectionClick.emit(section.bkey)">
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
export class BlogGrid {
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();
}
