import { Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonImg, IonRow, ModalController } from '@ionic/angular/standalone';
import { filter, switchMap } from 'rxjs/operators';

import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { ENV } from '@okr/shared-config';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

import { AsyncPipe } from '@angular/common';

const PFX = '@cms/section/feature.';

const CardSelectStore = signalStore(
  withState({ 
    slug: '' 
  }),
  withProps(() => ({ 
    i18nService: inject(I18nService) 
  })),
  withProps(store => ({
    headerTitle: toSignal(
      toObservable(store.slug).pipe(
        // Skip the initial empty slug: translating '@cms/section/feature.select.'
        // (empty suffix) reports a spurious i18n missing-key to Sentry (SCS-1K).
        filter(slug => !!slug),
        switchMap(slug => store.i18nService.translate(PFX + 'select.' + slug))
      ),
      { initialValue: '' }
    )
  })),
  withMethods(store => ({
    setSlug(slug: string): void { patchState(store, { slug }); },
  })),
);

@Component({
  selector: 'okr-card-select-modal',
  standalone: true,
  providers: [CardSelectStore],
  imports: [
    SvgIconPipe, TranslatePipe, AsyncPipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonImg
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; }
  `],
  template: `
    @if(slug()) {
      <okr-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />
      <ion-content>
        <ion-grid>
          <ion-row>
            @for(item of items(); track $index) {
              <ion-col size="6" size-md="3">
                <ion-card (click)="select(item)">
                  <ion-card-header>
                    <ion-card-title>{{ getName(item) | translate | async }}</ion-card-title>
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
  protected items = computed(() => this.category().items);
  protected path = computed(() => `${this.env.services.imgixBaseUrl}/logo/${this.slug()}/`);

  constructor() {
    effect(() => this.store.setSlug(this.slug()));
  }

  protected getName(item: CategoryItemModel): string {
    return this.category().i18n + '.' + item.name + '.label';
  }

  public async select(item: CategoryItemModel): Promise<boolean> {
    return await dismissOverlay(this.modalController, item, 'confirm');
  }
}
