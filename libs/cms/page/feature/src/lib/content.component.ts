import { AsyncPipe } from '@angular/common';
import { Component, effect, inject, input } from '@angular/core';
import { IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared-i18n';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { debugMessage, replaceSubstring } from '@bk2/shared-util-core';

import { SectionComponent, SectionStore } from '@bk2/cms-section-feature';
import { PageStore } from './page.store';

@Component({
  selector: 'bk-content',
  standalone: true,
  imports: [
    SectionComponent,
    TranslatePipe, AsyncPipe, SvgIconPipe,
    IonButton, IonIcon,
    IonContent, IonList, IonItem, IonLabel
  ],
  providers: [PageStore, SectionStore],
  styles: [`bk-section { width: 100%; }`],
  template: `
    <ion-content>
      @if(pageStore.isEmptyPage()) {
        <ion-item lines="none">
          <ion-label class="ion-text-wrap">{{ '@content.section.error.emptyPage' | translate | async }}</ion-label>
        </ion-item>
        @if(!readOnly()) {
          <ion-item lines="none">
            <ion-button (click)="addSection()">
              <ion-icon slot="start" src="{{'add-circle' | svgIcon }}" />
              {{ '@content.section.operation.add.label' | translate | async }}
            </ion-button>
          </ion-item>
        }
      } @else {     <!-- page contains sections -->
        <ion-list>
          @for(section of pageStore.sections(); track $index) {
            <ion-item lines="none">
              <bk-section id="{{ section }}" [readOnly]="readOnly()" />
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `
})
export class ContentComponent {
  protected pageStore = inject(PageStore);
  protected sectionStore = inject(SectionStore);

  public id = input.required<string>();     // pageId (can contain @TID@ placeholder)
  public readOnly = input(true);

  constructor() {
    effect(() => {
      const id = replaceSubstring(this.id(), '@TID@', this.pageStore.tenantId());
      debugMessage(`ContentComponent: pageId=${this.id()} -> ${id}`, this.pageStore.currentUser());
      this.pageStore.setPageId(id);
    });
  }

  protected async addSection(): Promise<void> {
    const sectionId = await this.sectionStore.add(false);
    if (sectionId) {
      this.pageStore.addSectionById(sectionId);
    }
  }
}
