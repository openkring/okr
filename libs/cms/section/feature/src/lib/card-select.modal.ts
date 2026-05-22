import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonImg, IonRow, ModalController } from '@ionic/angular/standalone';
import { switchMap } from 'rxjs/operators';

import { CategoryItemModel, CategoryListModel } from '@bk2/shared-models';
import { ENV } from '@bk2/shared-config';
import { SvgIconPipe } from '@bk2/shared-pipes';
import { I18nService } from '@bk2/shared-i18n';
import { Header } from '@bk2/shared-ui';
import { signalStore, withProps } from '@ngrx/signals';

import { PFX } from './scope';

const CardSelectStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
);

@Component({
  selector: 'bk-card-select-modal',
  standalone: true,
  providers: [CardSelectStore],
  imports: [
    SvgIconPipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonImg
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; }
  `],
  template: `
    @if(slug()) {
      <bk-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
      <ion-content>
        <ion-grid>
          <ion-row>
            @for(item of items(); track $index) {
              <ion-col size="6" size-md="3">
                <ion-card (click)="select(item)">
                  <ion-card-header>
                    <ion-card-title>{{ '@' + i18nBase() + '.' + item.name + '.label' }}</ion-card-title>
                    <ion-card-subtitle>{{ item.name }}</ion-card-subtitle>
                  </ion-card-header>
                  <ion-card-content>
                    <ion-img src="{{ item.name | svgIcon:'section' }}" alt="{{ item.name }}" />
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
export class CardSelectModal {
  protected readonly store = inject(CardSelectStore);
  private readonly env = inject(ENV);
  private readonly modalController = inject(ModalController);

  // inputs
  public category = input.required<CategoryListModel>();
  public slug = input.required<string>();

  // computed
  protected i18nBase = computed(() => this.category().i18nBase);
  protected items = computed(() => this.category().items);
  protected path = computed(() => `${this.env.services.imgixBaseUrl}/logo/${this.slug()}/`);

  private readonly headerKey = computed(() => PFX + 'select.' + this.slug());
  protected readonly headerTitle = toSignal(
    toObservable(this.headerKey).pipe(switchMap(key => this.store.i18nService.translate(key))),
    { initialValue: '' }
  );

  public async select(item: CategoryItemModel): Promise<boolean> {
    return await this.modalController.dismiss(item, 'confirm');
  }
}
