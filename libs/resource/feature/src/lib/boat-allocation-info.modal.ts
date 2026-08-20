import { AsyncPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { Header } from '@okr/shared-ui';
import { SvgIconPipe } from '@okr/shared-pipes';
import { getCategoryIcon, getItemDescription, getItemLabel } from '@okr/shared-util-core';

import { RESOURCE_I18N_KEYS, ResourceI18n } from '@okr/resource-util';

/**
 * The legend of the Bootseinteilung grid, as a sheet — triggered by the info icon in the
 * header. Same layout as the Logbuch explainer (TripInfoModal): a token in the left gutter,
 * its meaning on the right.
 *
 * The rboat_usage rows are read from the category itself, so a tenant that renames a column
 * or rewrites its description gets the legend for free.
 */
@Component({
  selector: 'okr-boat-allocation-info-modal',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe,
    Header,
    IonContent, IonIcon,
  ],
  styles: [`
    .sheet { max-width: 620px; margin: 0 auto; padding: 24px 24px 24px; }
    .intro { margin: 0 0 22px; font-size: 16px; line-height: 1.5; }
    .topics { display: grid; gap: 18px; }
    .topic { display: grid; grid-template-columns: 64px 1fr; gap: 16px; align-items: start; }
    .token {
      height: 40px;
      border-radius: 8px;
      background: var(--ion-color-light);
      color: var(--ion-color-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    .token ion-icon { font-size: 24px; }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--ion-color-medium);
      margin-bottom: 5px;
    }
    .topic p { margin: 0; font-size: 15px; line-height: 1.5; }

    /* the phone gets a single column: a 64px gutter next to wrapped text wastes half the width */
    @media (width <= 480px) {
      .sheet { padding-inline: 16px; }
      .topic { grid-template-columns: 1fr; gap: 8px; }
      .token { width: 64px; }
    }
  `],
  template: `
    <okr-header [i18n]="{ title: i18n.alloc_legend_title() }" [isModal]="true" />
    <ion-content>
      <div class="sheet">
        <p class="intro">{{ i18n.alloc_title() }}</p>

        <div class="topics">
          <div class="topic">
            <div class="token">3</div>
            <div>
              <div class="eyebrow">{{ i18n.alloc_legend_numbers() }}</div>
              <p>{{ i18n.alloc_legend_numbersText() }}</p>
            </div>
          </div>

          @for (usage of usages(); track usage) {
            <div class="topic">
              <div class="token">
                @if (usageIcon(usage); as icon) {
                  <ion-icon src="{{ icon | svgIcon }}" />
                } @else {
                  {{ usage }}
                }
              </div>
              <div>
                <div class="eyebrow">{{ usageLabel(usage) | translate | async }}</div>
                <p>{{ usageDescription(usage) | translate | async }}</p>
              </div>
            </div>
          }

          <div class="topic">
            <div class="token">l</div>
            <div>
              <div class="eyebrow">{{ i18n.alloc_legend_l() }}</div>
              <p>{{ i18n.alloc_legend_lText() }}</p>
            </div>
          </div>
          <div class="topic">
            <div class="token">s</div>
            <div>
              <div class="eyebrow">{{ i18n.alloc_legend_s() }}</div>
              <p>{{ i18n.alloc_legend_sText() }}</p>
            </div>
          </div>
          <div class="topic">
            <div class="token">p</div>
            <div>
              <div class="eyebrow">{{ i18n.alloc_legend_p() }}</div>
              <p>{{ i18n.alloc_legend_pText() }}</p>
            </div>
          </div>

          <div class="topic">
            <div class="token" style="background: var(--ion-color-success)"></div>
            <div><div class="eyebrow">{{ i18n.alloc_legend_success() }}</div></div>
          </div>
          <div class="topic">
            <div class="token" style="background: var(--ion-color-danger)"></div>
            <div><div class="eyebrow">{{ i18n.alloc_legend_danger() }}</div></div>
          </div>
        </div>
      </div>
    </ion-content>
  `,
})
export class BoatAllocationInfoModal {
  protected readonly i18n = inject(I18nService).translateAll(RESOURCE_I18N_KEYS) as ResourceI18n;
  private readonly appStore = inject(AppStore);

  private readonly usageCategory = computed(() => this.appStore.getCategory('rboat_usage'));
  /** every column of the grid — private boats get no column, so they are no legend row either */
  protected readonly usages = computed(() => (this.usageCategory()?.items ?? [])
    .filter(item => item.name !== 'private').map(item => item.name));

  protected usageLabel(name: string): string {
    const category = this.usageCategory();
    return category ? getItemLabel(category, name) : name;
  }

  /** the rboat_usage item's own icon; the item name stands in where a category has none */
  protected usageIcon(name: string): string {
    return getCategoryIcon(this.usageCategory(), name);
  }

  protected usageDescription(name: string): string {
    const category = this.usageCategory();
    return category ? getItemDescription(category, name) : '';
  }
}
