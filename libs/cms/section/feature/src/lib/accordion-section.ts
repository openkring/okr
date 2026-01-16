import { Component, computed, forwardRef, input } from '@angular/core';
import { IonAccordion, IonAccordionGroup, IonCard, IonCardContent, IonItem, IonLabel } from '@ionic/angular/standalone';
import { AsyncPipe } from '@angular/common';
import { OptionalCardHeaderComponent, SpinnerComponent } from '@bk2/shared-ui';
import { AccordionConfig, AccordionSection, ColorIonic } from '@bk2/shared-models';
import { ColorsIonic } from '@bk2/shared-categories';
import { CategoryPlainNamePipe } from '@bk2/shared-pipes';
import { TranslatePipe } from '@bk2/shared-i18n';

import { SectionComponent } from './section.component';

@Component({
  selector: 'bk-accordion-section',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, CategoryPlainNamePipe,
    IonLabel, IonCard, IonCardContent, OptionalCardHeaderComponent,
    IonAccordionGroup, IonAccordion, IonItem, IonLabel,
    SpinnerComponent,
    forwardRef(() => SectionComponent)
  ],
  styles: [`
    ion-card-content { padding: 5px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section()) {
      <ion-card>
        <bk-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <ion-accordion-group [value]="section.name">
            @for(item of items(); track item) {
            <ion-accordion [value]="item.value" toggle-icon-slot="start" >
                <ion-item slot="header" [color]="color() | categoryPlainName:colorsIonic">
                <ion-label>{{item.label | translate | async}}</ion-label>
                </ion-item>
                <div slot="content">
                <bk-section [id]="item.key" [readOnly]="readonly()"/>
                </div>
            </ion-accordion>
            }
          </ion-accordion-group>
        </ion-card-content>
      </ion-card>
    } @else {
      <bk-spinner />
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