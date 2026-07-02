import { Component, computed, input } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';

import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { AccordionConfig, AccordionSection, ColorIonic } from '@okr/shared-models';
import { ColorsIonic } from '@okr/shared-categories';
import { CategoryPlainNamePipe } from '@okr/shared-pipes';
import { TranslatePipe } from '@okr/shared-i18n';

import { AccordionItemContentComponent } from './accordion-item';

@Component({
  selector: 'okr-accordion-section',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, CategoryPlainNamePipe,
    IonLabel, IonCard, IonCardContent, OptionalCardHeader,
    IonAccordionGroup, IonAccordion, IonItem, IonLabel,
    Spinner, AccordionItemContentComponent
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section()) {
      <ion-card>
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-accordion-group [value]="value()">
            @for(item of items(); track item.value; let idx = $index) {
              <ion-accordion [value]="item.value" toggle-icon-slot="start">
                <ion-item slot="header" [color]="color() | categoryPlainName:colorsIonic">
                  <ion-label>{{item.label | translate | async}}</ion-label>
                </ion-item>
                <div class="ion-padding" slot="content">
                  <okr-accordion-item-content [sectionId]="item.key" />
                </div>
              </ion-accordion>
            }
          </ion-accordion-group>
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class AccordionSectionComponent {
  // inputs
  public section = input<AccordionSection>();

  // computed
  protected title = computed(() => this.section()?.title ?? '');
  protected subTitle = computed(() => this.section()?.subTitle ?? '');
  protected color = computed(() => this.section()?.color ?? ColorIonic.Primary);

  protected config = computed(() => this.section()?.properties as AccordionConfig);
  protected multiple = computed(() => this.config().multiple ?? false);
  protected readonly = computed(() => this.config().readonly ?? true);
  protected value = computed(() => this.config().value ?? '');
  protected items = computed(() => this.config().items ?? []);
  protected colorsIonic = ColorsIonic;
}