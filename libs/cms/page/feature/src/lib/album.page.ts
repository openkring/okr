import { Component, computed, inject, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';

import { HeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { extractFirstPartOfOptionalTupel, getPartsOfTupel } from '@bk2/shared-util-core';

import { AlbumSectionComponent } from '@bk2/cms-section-feature';
import { createSection } from '@bk2/cms-section-util';
import { ALBUM_CONFIG_SHAPE, AlbumSection, AlbumStyle } from '@bk2/shared-models';

import { PageStore } from './page.store';

@Component({
  selector: 'bk-album-page',
  standalone: true,
  imports: [
    HeaderComponent, SpinnerComponent, AlbumSectionComponent,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonContent
  ],
  styles: [`
  bk-section { width: 100%; }
`],
  template: `
    @if(id(); as id) {
      @if(showMainMenu()) {
        <bk-header [title]="headerTitle()" [isRoot]="true" />
      }
      <ion-content>
        <bk-album-section [section]="section()" />
      </ion-content>
    } @else {
      @if(showMainMenu()) {
        <ion-header>
          <ion-toolbar color="secondary" id="bkheader">
            <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
          </ion-toolbar>
        </ion-header>
      }
      <ion-content>
        <bk-spinner />
      </ion-content>
    }
  `
})
export class AlbumPage {
  private readonly pageStore = inject(PageStore);

  // inputs
  public contextMenuName = input<string>();
  public color = input('secondary');
  public id = input.required<string>();     // typically the year of the album
  // id is passed to the album-section as well where it is used as the title
  // the id can be followed by @tenantId to specify the tenantId of the owner of the album
  // e.g. 2021@p13
  public showMainMenu = input(true);

  protected headerTitle = computed(() => extractFirstPartOfOptionalTupel(this.id(), '@'));
  private tenantId = computed(() => this.pageStore.tenantId());

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
