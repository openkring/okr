import { AsyncPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonImg, IonRow, ModalController } from '@ionic/angular/standalone';

import { TranslatePipe } from '@bk2/shared/i18n';
import { CategoryModel } from '@bk2/shared/models';

import { HeaderComponent } from './header.component';
import { ENV } from '@bk2/shared/config';

@Component({
  selector: 'bk-card-select-modal',
  imports: [
    TranslatePipe, AsyncPipe, 
    HeaderComponent,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonImg
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; }
  `],
  template: `
    @if(slug()) {
      <bk-header title="{{ '@general.operation.select.' + slug() | translate | async }}" [isModal]="true" />
      <ion-content>
        <ion-grid>
          <ion-row>
            @for(cat of categories(); track cat; let i = $index) {
              <ion-col size="6" size-md="3">
                <ion-card (click)="select(i)">
                  <ion-card-header>
                    <ion-card-title>{{ '@' + cat.i18nBase + '.label' | translate | async }}</ion-card-title>
                    <ion-card-subtitle>{{ cat.name }}</ion-card-subtitle>
                  </ion-card-header>
                  <ion-card-content>
                    <ion-img src="{{ path() + cat.name + '.svg'}}" alt="{{ cat.name }}" />
                  </ion-card-content>
                </ion-card>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      </ion-content>
    }
  `,
})
export class CardSelectModalComponent {
  private readonly env = inject(ENV);
  private readonly modalController = inject(ModalController);

  public categories = input.required<CategoryModel[]>();
  public slug = input.required<string>();
  protected path = computed(() => `${this.env.services.imgixBaseUrl}/logo/${this.slug()}/`);
  
  public async select(index: number): Promise<boolean> {
    return await this.modalController.dismiss(index, 'confirm');
  }
}
