import { Component, effect, inject, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { debugMessage, hasRole, replaceSubstring } from '@bk2/shared/util';
import { SvgIconPipe } from '@bk2/shared/pipes';
import { TranslatePipe } from '@bk2/shared/i18n';
import { RoleName } from '@bk2/shared/config';

import { SectionComponent } from '@bk2/cms/section/feature';
import { PageDetailStore } from './page-detail.store';

@Component({
  selector: 'bk-content',
  imports: [
    SectionComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel
  ],
  styles: [`
  bk-section { width: 100%; }
`],
  providers: [PageDetailStore],
  template: `
    <ion-content>
      @if(pageStore.isEmptyPage()) {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPage' | translate | async }}</ion-label>
        </ion-item>
        @if(hasRole('contentAdmin')) {
          <ion-item lines="none">
            <ion-button (click)="pageStore.addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ '@content.section.operation.add.label' | translate | async }}
            </ion-button>
          </ion-item>
        }
      } @else {     <!-- page contains sections -->
        <ion-list>
          @for(section of pageStore.sections(); track $index) {
            <ion-item lines="none">
              <bk-section id="{{ section }}" />
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class ContentComponent {
  protected pageStore = inject(PageDetailStore);

  public id = input.required<string>();     // pageId (can contain @TID@ placeholder)

  protected tenantId = this.pageStore.appStore.env.tenantId;

  constructor() {
    effect(() => {
      const _id = replaceSubstring(this.id(), '@TID@', this.pageStore.appStore.env.tenantId);
      debugMessage(`ContentComponent: pageId=${this.id()} -> ${_id}`, this.pageStore.currentUser());
      this.pageStore.setPageId(_id);
    });
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.pageStore.currentUser());
  }
}
