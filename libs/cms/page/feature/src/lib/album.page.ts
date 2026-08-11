import { Component, computed, inject, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';

import { Header, Spinner } from '@okr/shared-ui';
import { extractFirstPartOfOptionalTupel } from '@okr/shared-util-core';

import { AlbumSectionComponent } from '@okr/cms-section-feature';
import { createSection } from '@okr/cms-section-util';
import { ALBUM_CONFIG_SHAPE, AlbumSection } from '@okr/shared-models';

import { PageStore } from './page.store';

@Component({
  selector: 'okr-album-page',
  standalone: true,
  imports: [
    Header, Spinner, AlbumSectionComponent,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonContent
  ],
  styles: [`
  okr-section { width: 100%; }
`],
  template: `
    @if(id(); as id) {
      @if(showMenu()) {
        <okr-header [i18n]="{ title: headerTitle() }" [isRoot]="true" />
      }
      <ion-content>
        <okr-album-section [section]="section()" />
      </ion-content>
    } @else {
      @if(showMenu()) {
        <ion-header>
          <ion-toolbar color="secondary" id="bkheader">
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          </ion-toolbar>
        </ion-header>
      }
      <ion-content>
        <okr-spinner />
      </ion-content>
    }
  `
})
export class AlbumPage {
  private readonly store = inject(PageStore);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public id = input.required<string>();     // the okey of the FolderModel the album starts at
  // id is passed to the album-section as well where it is used as the title
  // the id can be followed by @tenantId to specify the tenantId of the owner of the album
  // e.g. 2021@p13
  public showMenu = input(true);

  protected headerTitle = computed(() => extractFirstPartOfOptionalTupel(this.id(), '@'));
  private tenantId = computed(() => this.store.tenantId());

  protected section = computed(() => {
    const section = createSection('album', this.tenantId()) as AlbumSection;
    section.properties = { ...ALBUM_CONFIG_SHAPE, folder: extractFirstPartOfOptionalTupel(this.id(), '@') };
    return section;
  });
}
