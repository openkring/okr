import { Component, computed, input, output } from '@angular/core';
import { IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { SectionModel, UserModel } from '@bk2/shared-models';
import { SectionDispatcher } from '@bk2/cms-section-feature';

/**
 * Classic Blog + Sidebar layout.
 * Main content column (≈70%) + right sidebar (≈30%).
 * Sections whose colSize starts with "4" or "3" are placed in the sidebar;
 * all others go into the main column.
 */
@Component({
  selector: 'bk-blog-classic',
  standalone: true,
  imports: [SectionDispatcher, IonGrid, IonRow, IonCol],
  styles: [`
    .section-wrapper.editable {
      border: 3px solid yellow;
      border-radius: 8px;
      margin: 4px 0;
      padding: 4px;
      cursor: pointer;
    }
    ion-col { padding: 4px; }
  `],
  template: `
    <ion-grid>
      <ion-row>
        <!-- Main content column -->
        <ion-col size="12" size-md="8">
          @for (section of mainSections(); track section.bkey) {
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
        </ion-col>
        <!-- Sidebar column -->
        <ion-col size="12" size-md="4">
          @for (section of sidebarSections(); track section.bkey) {
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
        </ion-col>
      </ion-row>
    </ion-grid>
  `
})
export class BlogClassic {
  public sections = input<SectionModel[]>([]);
  public currentUser = input<UserModel | undefined>();
  public editMode = input(false);
  public sectionClick = output<string>();

  // Sections with colSize starting with '3' or '4' go to the sidebar
  protected sidebarSections = computed(() =>
    this.sections().filter(s => s.colSize?.startsWith('3') || s.colSize?.startsWith('4'))
  );
  protected mainSections = computed(() =>
    this.sections().filter(s => !s.colSize?.startsWith('3') && !s.colSize?.startsWith('4'))
  );
}
