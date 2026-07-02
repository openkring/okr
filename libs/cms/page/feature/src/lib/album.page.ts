import { Component, computed, inject, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';

import { Header, Spinner } from '@okr/shared-ui';
import { extractFirstPartOfOptionalTupel, getPartsOfTupel } from '@okr/shared-util-core';

import { AlbumSectionComponent } from '@okr/cms-section-feature';
import { createSection } from '@okr/cms-section-util';
import { ALBUM_CONFIG_SHAPE, AlbumSection, AlbumStyle } from '@okr/shared-models';

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
  public id = input.required<string>();     // typically the year of the album
  // id is passed to the album-section as well where it is used as the title
  // the id can be followed by @tenantId to specify the tenantId of the owner of the album
  // e.g. 2021@p13
  public showMenu = input(true);

  protected headerTitle = computed(() => extractFirstPartOfOptionalTupel(this.id(), '@'));
  private tenantId = computed(() => this.store.tenantId());

  protected section = computed(() => {
    const section = createSection('album', this.tenantId()) as AlbumSection;
    section.properties = ALBUM_CONFIG_SHAPE;
    section.properties.albumStyle = AlbumStyle.Pinterest;
    const id = this.id();
    if (id.indexOf('@') === -1) {   // show the default album of the current tenant
      section.properties.directory = `tenant/${this.tenantId()}/album/${id}`; // show default album
    } else {                         // show the album from a different tenant
      const [key, tenantId] = getPartsOfTupel(id, '@');
      section.properties.directory = `tenant/${tenantId}/album/${key}`;
    }
    return section;
  });
}
