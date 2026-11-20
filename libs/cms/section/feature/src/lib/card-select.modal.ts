import { Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of } from 'rxjs';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonCol, IonContent, IonGrid, IonNote, IonRow, ModalController } from '@ionic/angular';
import { filter, map, switchMap } from 'rxjs/operators';

import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';
import { ENV } from '@okr/shared-config';
import { SvgIconPipe } from '@okr/shared-pipes';
import { I18nService } from '@okr/shared-i18n';
import { Header, ImgDirective } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import { sortByLabel } from '@okr/cms-section-util';
import { patchState, signalStore, withMethods, withProps, withState } from '@ngrx/signals';

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
    ImgDirective, SvgIconPipe,
    Header,
    IonContent, IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCardSubtitle, IonNote
  ],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; }
    ion-card.disabled { opacity: 0.45; cursor: not-allowed; }
    .hint { display: block; padding: 0px 16px 8px 16px; font-size: 0.8rem; }
  `],
  template: `
    @if(slug()) {
      <okr-header [i18n]="{ title: store.headerTitle() }" [isModal]="true" />
      <ion-content>
        <ion-grid>
          <ion-row>
            @for(entry of sortedItems(); track entry.item.name) {
              @let item = entry.item;
              <ion-col size="6" size-md="3">
                <ion-card (click)="select(item)" [class.disabled]="isDisabled(item)" [attr.aria-disabled]="isDisabled(item)">
                  <ion-card-header>
                    <ion-card-title>{{ entry.label }}</ion-card-title>
                    <ion-card-subtitle>{{ item.name }}</ion-card-subtitle>
                  </ion-card-header>
                  @if (isDisabled(item)) { <ion-note class="hint">{{ notOnWebsite() }}</ion-note> }
                  <ion-card-content>
                    <img okrImg src="{{ item.name | svgIcon:'section' }}" alt="{{ item.name }}" />
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
  /** item names shown but not selectable, e.g. section types a website page cannot show (spec 1.165 §7.5) */
  public disabledNames = input<string[]>([]);

  // computed
  protected items = computed(() => this.category()?.items ?? []);
  /** item name → translated label; follows the active language */
  private readonly labels = toSignal(
    toObservable(this.items).pipe(
      switchMap(items => items.length === 0
        ? of({} as Record<string, string>)
        : combineLatest(items.map(item => this.store.i18nService.translate(this.getName(item)).pipe(map(label => [item.name, label] as const))))
            .pipe(map(pairs => Object.fromEntries(pairs) as Record<string, string>))
      )
    ),
    { initialValue: {} as Record<string, string> }
  );
  /** the entries sorted by their translated name */
  protected readonly sortedItems = computed(() => sortByLabel(this.items(), this.labels(), this.store.i18nService.getActiveLang()));
  protected readonly notOnWebsite = toSignal(this.store.i18nService.translate(PFX + 'select.notOnWebsite'), { initialValue: '' });
  protected path = computed(() => `${this.env.services.imgixBaseUrl}/logo/${this.slug()}/`);

  constructor() {
    effect(() => this.store.setSlug(this.slug()));
  }

  protected getName(item: CategoryItemModel): string {
    return this.category().i18n + '.' + item.name + '.label';
  }

  protected isDisabled(item: CategoryItemModel): boolean {
    return this.disabledNames().includes(item.name);
  }

  public async select(item: CategoryItemModel): Promise<boolean> {
    if (this.isDisabled(item)) return false;
    return await dismissOverlay(this.modalController, item, 'confirm');
  }
}
