import { Component, input, output } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { SectionDispatcher } from '@bk2/cms-section-feature';

/**
 * Minimal / Single-column Stream layout.
 * One centered column, vertical whitespace, focus on reading (Substack / Ghost style).
 */
@Component({
  selector: 'bk-blog-minimal',
  standalone: true,
  imports: [SectionDispatcher, IonGrid, IonRow, IonCol],
  styles: [`
    .blog-minimal { max-width: 740px; margin: 0 auto; }
    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      margin: 8px 0;
      padding: 4px;
      cursor: pointer;
    }
  `],
  template: `
    <div class="blog-minimal">
      <ion-grid>
        @for (section of sections(); track section.bkey) {
          <ion-row>
            <ion-col size="12" (click)="sectionClick.emit(section.bkey)">
              @if (editMode()) {
                <div class="section-wrapper editable">
                  <bk-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
                </div>
              } @else {
                <bk-section-dispatcher [section]="section" [currentUser]="currentUser()" [editMode]="editMode()" />
              }
            </ion-col>
          </ion-row>
        }
      </ion-grid>
    </div>
  `
})
export class BlogMinimal {
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();
}
