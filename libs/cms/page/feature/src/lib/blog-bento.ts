import { Component, computed, input, output } from '@angular/core';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { SectionDispatcher } from '@bk2/cms-section-feature';

/**
 * Bento Box / Modular Grid layout.
 * Asymmetric CSS Grid: first section spans 2 columns (featured), rest fill naturally.
 * Premium / startup-brand feeling.
 */
@Component({
  selector: 'bk-blog-bento',
  standalone: true,
  imports: [SectionDispatcher],
  styles: [`
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      padding: 16px;
    }
    .bento-item { min-width: 0; }
    .bento-item.featured { grid-column: span 2; }

    @media (max-width: 600px) {
      .bento-grid { grid-template-columns: 1fr; }
      .bento-item.featured { grid-column: span 1; }
    }

    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      padding: 4px;
      cursor: pointer;
    }
  `],
  template: `
    <div class="bento-grid">
      @for (section of sections(); track section.bkey; let i = $index) {
        <div class="bento-item" [id]="section.bkey" [class.featured]="i === 0" (click)="sectionClick.emit(section.bkey)">
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
export class BlogBento {
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();

  protected featured = computed(() => this.sections()[0] ?? null);
  protected restSections = computed(() => this.sections().slice(1));
}
