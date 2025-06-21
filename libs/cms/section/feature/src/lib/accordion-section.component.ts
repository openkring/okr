import { Component, computed, input } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonAccordion, IonAccordionGroup, IonItem, IonLabel } from '@ionic/angular/standalone';

import { SectionModel } from '@bk2/shared/models';
import { CategoryPlainNamePipe } from '@bk2/shared/pipes';
import { ColorsIonic } from '@bk2/shared/categories';
import { TranslatePipe } from '@bk2/shared/i18n';
import { SectionComponent } from './section.component';

@Component({
  selector: 'bk-accordion-section',
  imports: [
    AsyncPipe, TranslatePipe, CategoryPlainNamePipe, 
    IonLabel, IonAccordionGroup, IonAccordion, IonItem, IonLabel,
    SectionComponent
  ],
  template: `
    @if(section(); as section) {
      <ion-accordion-group [value]="section.name">
        @for(sectionDesc of sections(); track sectionDesc) {
          @if(sectionDesc.key) {
            <ion-accordion [value]="sectionDesc.value" toggle-icon-slot="start" >
              <ion-item slot="header" [color]="section.color | categoryPlainName:colorsIonic">
                <ion-label>{{sectionDesc.label | translate | async}}</ion-label>
              </ion-item>
              <div slot="content">
                <bk-section [id]="sectionDesc.key" [readOnly]="readOnly()"/>
              </div>
            </ion-accordion>
          }
        }
      </ion-accordion-group>
    }
  `
})
export class AccordionSectionComponent {
  public section = input<SectionModel>();
  public readOnly = input(true);
  protected sections = computed(() => this.section()?.properties.accordion?.sections ?? []);

  colorsIonic = ColorsIonic;
}