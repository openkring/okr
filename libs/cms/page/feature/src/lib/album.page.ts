import { Component, computed, inject, input } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonMenuButton, IonToolbar } from '@ionic/angular/standalone';

import { HeaderComponent, SpinnerComponent } from '@bk2/shared/ui';
import { ENV } from '@bk2/shared/config';
import { AlbumSectionComponent } from '@bk2/cms/section/feature';
import { createSection, newAlbumConfig } from '@bk2/cms/section/util';
import { SectionType } from '@bk2/shared/models';
import { extractFirstPartOfOptionalTupel, getPartsOfTupel } from '@bk2/shared/util';

@Component({
  selector: 'bk-album-page',
  imports: [
    HeaderComponent, SpinnerComponent, AlbumSectionComponent,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonContent
  ],
  styles: [`
  bk-section { width: 100%; }
`],
  template: `
    @if(id(); as id) {
      <bk-header title="{{ title() }}" [isRoot]="true" />
      <ion-content>
        <bk-album-section [section]="section()" />
      </ion-content>
    } @else {
      <ion-header>
        <ion-toolbar color="secondary" id="bkheader">
          <ion-buttons slot="start"><ion-menu-button /></ion-buttons>      
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <bk-spinner />
      </ion-content>
    }
  `
})
export class AlbumPageComponent {
  private readonly env = inject(ENV);

  public id = input.required<string>();     // typically the year of the album, it is passed to the album-section as well as used as the title
  // the id can be followed by @tenantId to specify the tenantId of the owner of the album
  // e.g. 2021@p13

  protected title = computed(() => extractFirstPartOfOptionalTupel(this.id(), '@'));

  protected section = computed(() => {
    const _section = createSection(SectionType.Album, this.env.tenantId);
    const _id = this.id();
    if (_id.indexOf('@') === -1) {   // show the default album of the current tenant
      _section.properties.album = newAlbumConfig(this.env.tenantId, _id);
    } else {                         // show the album from a different tenant
      const [_key, _tenantId] = getPartsOfTupel(_id, '@');
      _section.properties.album = newAlbumConfig(_tenantId, _key);
    }
    return _section;
  });
}
