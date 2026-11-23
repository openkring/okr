import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonNote } from '@ionic/angular';

import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox } from '@okr/shared-ui';
import type { CheckboxI18n } from '@okr/shared-ui';
import { AlertService } from '@okr/shared-util-angular';
import { MODEL_FIELDS, hiddenFieldsOf, withFieldVisibility, withoutModel } from '@okr/shared-util-core';
import type { ModelFieldMap } from '@okr/shared-util-core';
import { CUSTOMIZE_I18N_KEYS, customizeFieldKey, customizeGroupKey } from '@okr/tenant-util';

interface CustomizeLink { labelKey: string; url: string; }

/** Per model: the lists whose values are not edited here, and where they are edited. */
interface CustomizeListInfo { listKeys: string[]; links: CustomizeLink[]; }

const LIST_INFO: Record<string, CustomizeListInfo> = {
  person: {
    listKeys: ['list_gender', 'list_address_channel', 'list_address_usage', 'list_tags_person'],
    links: [
      { labelKey: 'link_categories', url: '/category/all/c-category' },
      { labelKey: 'link_tags', url: '/aoc/tag' },
    ],
  },
};

/** The models shown as groups, in order. Later tasks add organization and the resource types. */
const GROUP_MODELS = ['person'];

/**
 * Third tab of `/tenant/features`: which optional model fields the forms of this tenant show.
 * Each toggle writes the whole `modelFields` map at once. Writes are queued, one after the other,
 * and every one builds its map from the live `appConfig()` when it runs — so two quick toggles
 * cannot overwrite each other with a stale map.
 */
@Component({
  selector: 'okr-customize-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconPipe, Checkbox, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonNote, IonButton, IonIcon],
  template: `
    <ion-list>
      <ion-item lines="none">
        <ion-note class="ion-text-wrap">{{ text('intro') }}</ion-note>
      </ion-item>
    </ion-list>

    @for (group of groups(); track group.modelKey) {
      <ion-list>
        <ion-item-group>
          <ion-item-divider>
            <ion-icon slot="start" src="{{ 'category' | svgIcon }}" />
            <ion-label>{{ group.title }}</ion-label>
            <ion-button slot="end" fill="clear" size="small" (click)="onReset(group.modelKey)">
              {{ text('reset') }}
            </ion-button>
          </ion-item-divider>
          @for (field of group.fields; track field.field) {
            <okr-checkbox
              [i18n]="field.i18n"
              [checked]="field.visible"
              [readOnly]="false"
              (checkedChange)="onToggle(group.modelKey, field.field, $event)" />
          }
          @if (group.lists.length > 0) {
            <ion-item-divider>
              <ion-label>{{ text('lists_title') }}</ion-label>
            </ion-item-divider>
            <ion-item lines="none">
              <ion-note class="ion-text-wrap">{{ text('lists_note') }}</ion-note>
            </ion-item>
            @for (list of group.lists; track list) {
              <ion-item lines="none"><ion-label class="ion-text-wrap">{{ list }}</ion-label></ion-item>
            }
            @for (link of group.links; track link.url) {
              <ion-item button [detail]="true" (click)="onNavigate(link.url)">
                <ion-label>{{ link.label }}</ion-label>
              </ion-item>
            }
          }
        </ion-item-group>
      </ion-list>
    }
  `,
})
export class CustomizeTab {
  private readonly appStore = inject(AppStore);
  private readonly appConfigService = inject(AppConfigService);
  private readonly alertService = inject(AlertService);
  private readonly i18nService = inject(I18nService);
  private readonly router = inject(Router);

  protected readonly i18n = this.i18nService.translateAll(CUSTOMIZE_I18N_KEYS);

  /** The tail of the write queue. */
  private queue: Promise<void> = Promise.resolve();

  protected readonly groups = computed(() => {
    const stored = this.appStore.appConfig()?.modelFields;
    return GROUP_MODELS.map((modelKey) => {
      const hidden = hiddenFieldsOf(modelKey, stored);
      const info = LIST_INFO[modelKey] ?? { listKeys: [], links: [] };
      return {
        modelKey,
        title: this.text(customizeGroupKey(modelKey)),
        fields: (MODEL_FIELDS[modelKey] ?? []).map((spec) => ({
          field: spec.field,
          visible: !hidden.has(spec.field),
          i18n: { name: `${modelKey}-${spec.field}`, label: this.text(customizeFieldKey(modelKey, spec.field)), helper: '' } as CheckboxI18n,
        })),
        lists: info.listKeys.map((key) => this.text(key)),
        links: info.links.map((link) => ({ url: link.url, label: this.text(link.labelKey) })),
      };
    });
  });

  protected text(name: string): string {
    return this.i18n[name]?.() ?? '';
  }

  protected onToggle(modelKey: string, field: string, visible: boolean): void {
    this.write((stored) => withFieldVisibility(stored, modelKey, field, visible), this.text('saved_toast'), `onToggle(${modelKey}.${field})`);
  }

  protected async onReset(modelKey: string): Promise<void> {
    if (!await this.alertService.confirm(this.text('reset_confirm'), true)) return;
    this.write((stored) => withoutModel(stored, modelKey), this.text('reset_toast'), `onReset(${modelKey})`);
  }

  protected onNavigate(url: string): void {
    void this.router.navigateByUrl(url);
  }

  private write(next: (stored: ModelFieldMap | undefined) => ModelFieldMap, toast: string, where: string): void {
    this.queue = this.queue.then(async () => {
      const tenantId = this.appStore.tenantId();
      if (!tenantId) return;
      try {
        await this.appConfigService.setModelFields(tenantId, next(this.appStore.appConfig()?.modelFields));
        await this.alertService.showToast(toast);
      } catch (error) {
        this.alertService.error(`CustomizeTab.${where}: ${error}`);
      }
    });
  }
}
