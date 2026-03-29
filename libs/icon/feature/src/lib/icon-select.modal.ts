import { Component, inject, input, OnInit, signal } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonRow, IonThumbnail, ModalController } from '@ionic/angular/standalone';

import { FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, HeaderComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';

import { ICON_SETS, IconStore } from './icon.store';

@Component({
  selector: 'bk-icon-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, ListFilterComponent, SpinnerComponent, EmptyListComponent,
    SvgIconPipe, FileSizePipe, PrettyDatePipe,
    IonContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonThumbnail
  ],
  providers: [IconStore],
  styles: [`
    .icon-grid-bg { background: var(--ion-color-light); border-radius: 4px; }
    img.icon-grid { width: 70%; height: 70%; margin: 15%; object-fit: contain; }
  `],
  template: `
    <bk-header title="@icon.operation.select.label" [isModal]="true" />

    <bk-list-filter
      [compact]="true"
      (searchTermChanged)="store.setSearchTerm($event)"
      [strings]="iconSet" [selectedString]="store.selectedDir()" (stringsChanged)="store.setSelectedDir($event)"
      (viewToggleChanged)="isListView.set($event)"
    />

    <ion-content>
      @if(store.isLoading()) {
        <bk-spinner />
      } @else if(store.filteredIcons().length === 0) {
        <bk-empty-list message="@icon.empty" />
      } @else if(isListView()) {
        <!-- list view: thumbnail + name, size, lastUpdate -->
        <ion-grid>
          @for(icon of store.filteredIcons(); track icon.name) {
            <ion-row (click)="select(icon.name)">
              <ion-col size="8">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    <img [src]="icon.name | svgIcon:icon.type" [alt]="icon.name" />
                  </ion-thumbnail>
                  <ion-label>{{ icon.name }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="2">
                <ion-item lines="none">
                  <ion-label>{{ icon.size | fileSize }}</ion-label>
                </ion-item>
              </ion-col>
              <ion-col size="2">
                <ion-item lines="none">
                  <ion-label>{{ icon.updated | prettyDate }}</ion-label>
                </ion-item>
              </ion-col>
            </ion-row>
          }
        </ion-grid>
      } @else {
        <!-- grid view: bigger thumbnail + name -->
        <ion-grid>
          <ion-row>
            @for(icon of store.filteredIcons(); track icon.name) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="select(icon.name)">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px;" class="icon-grid-bg">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    <img class="icon-grid" [src]="icon.name | svgIcon:icon.type" [alt]="icon.name" />
                  </ion-thumbnail>
                </div>
                <p style="font-size: 0.75rem; margin: 4px 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;">{{ icon.name }}</p>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `
})
export class IconSelectModalComponent implements OnInit {
  protected readonly store = inject(IconStore);
  private readonly modalController = inject(ModalController);

  /** Initial icon set (type) to pre-select */
  public readonly initialDir = input('icons');

  protected readonly isListView = signal(false); // default: grid
  protected readonly iconSet = ICON_SETS;

  public ngOnInit(): void {
    this.store.setSelectedDir(this.initialDir());
  }

  public select(iconName: string): Promise<boolean> {
    return this.modalController.dismiss(iconName, 'confirm');
  }
}
