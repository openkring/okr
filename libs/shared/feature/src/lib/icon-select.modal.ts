import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { from } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { getMetadata, listAll, ref } from 'firebase/storage';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonRow, IonThumbnail } from '@ionic/angular/standalone';
import { ModalController } from '@ionic/angular/standalone';

import { STORAGE } from '@bk2/shared-config';
import { FileSizePipe, PrettyDatePipe, SvgIconPipe } from '@bk2/shared-pipes';
import { EmptyListComponent, HeaderComponent, ListFilterComponent, SpinnerComponent } from '@bk2/shared-ui';
import { convertDateFormatToString, DateFormat } from '@bk2/shared-util-core';

export const ICON_SETS = ['filetypes', 'general', 'icons', 'ionic', 'models', 'section', 'sport', 'weather'];

export interface IconItem {
  name: string;      // filename without .svg, e.g. 'folder'
  fullPath: string;  // full storage path, e.g. 'logo/icons/folder.svg'
  dir: string;       // subdirectory (icon set), e.g. 'icons'
  size: number;      // bytes
  updated: string;   // stored date format (for prettyDate pipe)
}

@Component({
  selector: 'bk-icon-select-modal',
  standalone: true,
  imports: [
    HeaderComponent, ListFilterComponent, SpinnerComponent, EmptyListComponent,
    SvgIconPipe, FileSizePipe, PrettyDatePipe,
    IonContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonThumbnail
  ],
  styles: [`
    .icon-grid-bg { background: var(--ion-color-light); border-radius: 4px; }
    img.icon-grid { width: 70%; height: 70%; margin: 15%; object-fit: contain; }
  `],
  template: `
    <bk-header title="@icon.operation.select.label" [isModal]="true" />

    <bk-list-filter
      [compact]="true"
      (searchTermChanged)="searchTerm.set($event)"
      [strings]="iconSets" [selectedString]="selectedDir()" (stringsChanged)="selectedDir.set($event)"
      (viewToggleChanged)="isListView.set($event)"
    />

    <ion-content>
      @if(isLoading()) {
        <bk-spinner />
      } @else if(filteredIcons().length === 0) {
        <bk-empty-list message="@icon.empty" />
      } @else if(isListView()) {
        <!-- list view: thumbnail + name, size, lastUpdate -->
        <ion-grid>
          @for(icon of filteredIcons(); track icon.name) {
            <ion-row (click)="select(icon.name)">
              <ion-col size="8">
                <ion-item lines="none">
                  <ion-thumbnail slot="start">
                    <img [src]="icon.name | svgIcon:icon.dir" [alt]="icon.name" />
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
            @for(icon of filteredIcons(); track icon.name) {
              <ion-col size="6" size-md="4" size-xl="3" (click)="select(icon.name)">
                <div style="position: relative; width: 100%; padding-bottom: 80%; overflow: hidden; border-radius: 4px;" class="icon-grid-bg">
                  <ion-thumbnail style="position: absolute; inset: 0; --size: 100%; width: 100%; height: 100%;">
                    <img class="icon-grid" [src]="icon.name | svgIcon:icon.dir" [alt]="icon.name" />
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
export class IconSelectModalComponent {
  private readonly storage = inject(STORAGE);
  private readonly modalController = inject(ModalController);

  /** Initial icon set (subdirectory under logo/) to display */
  public readonly initialDir = input('icons');

  protected readonly iconSets = ICON_SETS;
  protected readonly selectedDir = linkedSignal(() => this.initialDir());
  protected readonly searchTerm = signal('');
  protected readonly isListView = signal(false); // default: grid

  protected readonly iconsResource = rxResource({
    params: () => ({ dir: this.selectedDir() }),
    stream: ({ params }) => from(this.loadIcons(params.dir))
  });

  protected readonly icons = computed(() => this.iconsResource.value() ?? []);
  protected readonly isLoading = computed(() => this.iconsResource.isLoading());

  protected readonly filteredIcons = computed(() => {
    const term = this.searchTerm().toLowerCase();
    return term
      ? this.icons().filter(i => i.name.toLowerCase().includes(term))
      : this.icons();
  });

  private async loadIcons(dir: string): Promise<IconItem[]> {
    const result = await listAll(ref(this.storage, `logo/${dir}`));
    const items = await Promise.all(
      result.items
        .filter(item => item.name.endsWith('.svg'))
        .map(async (item): Promise<IconItem> => {
          const metadata = await getMetadata(item);
          return {
            name: item.name.replace('.svg', ''),
            fullPath: item.fullPath,
            dir,
            size: metadata.size,
            updated: convertDateFormatToString(
              metadata.updated.substring(0, 10), DateFormat.IsoDate, DateFormat.StoreDate
            ),
          };
        })
    );
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }

  public select(iconName: string): Promise<boolean> {
    return this.modalController.dismiss(iconName, 'confirm');
  }
}
