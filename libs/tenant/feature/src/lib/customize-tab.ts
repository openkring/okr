import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonItemDivider, IonItemGroup, IonLabel, IonList, IonNote } from '@ionic/angular';

import { combineLatest, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { PageService } from '@okr/cms-page-data-access';
import { SectionService } from '@okr/cms-section-data-access';
import { AppConfigService } from '@okr/shared-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Checkbox } from '@okr/shared-ui';
import type { CheckboxI18n } from '@okr/shared-ui';
import { AlertService, resourceParams } from '@okr/shared-util-angular';
import { LIST_COPY_I18N_KEYS, MODEL_FIELDS, belongsToTenant, copyStatus, fill, hiddenFieldsOf, listCopyTextKey, resourceFieldKey, string2stringArray, withFieldVisibility, withoutModel } from '@okr/shared-util-core';
import type { ModelFieldMap } from '@okr/shared-util-core';
import { CUSTOMIZE_I18N_KEYS, FEATURE_BLOCKS, customizeFieldKey, customizeGroupKey, withWidgetVisibility } from '@okr/tenant-util';

import { buildWidgetRows } from './dashboard-widget-rows.util';
import type { WidgetEntry } from './dashboard-widget-rows.util';
import { FeatureStore } from './feature.store';
import { createSerialQueue } from './serial-queue.util';

interface CustomizeLink { labelKey: string; url: string; }

/** One row under «Listen»: a category by its name, or the tag definitions a predicate picks. */
interface CustomizeList { labelKey: string; category?: string; tags?: (tagModel: string) => boolean; }

/** Per model: the lists whose values are not edited here, and where they are edited. */
interface CustomizeListInfo { lists: CustomizeList[]; links: CustomizeLink[]; }

const LIST_INFO: Record<string, CustomizeListInfo> = {
  person: {
    lists: [
      { labelKey: 'list_gender', category: 'gender' },
      { labelKey: 'list_address_channel', category: 'address_channel' },
      { labelKey: 'list_address_usage', category: 'address_usage' },
      { labelKey: 'list_tags_person', tags: (tagModel) => tagModel === 'person' },
    ],
    links: [
      { labelKey: 'link_categories', url: '/category/all/c-category' },
      { labelKey: 'link_tags', url: '/aoc/tag' },
    ],
  },
  org: {
    lists: [
      { labelKey: 'list_org_type', category: 'org_type' },
      { labelKey: 'list_tags_org', tags: (tagModel) => tagModel === 'org' },
    ],
    links: [
      { labelKey: 'link_categories', url: '/category/all/c-category' },
      { labelKey: 'link_tags', url: '/aoc/tag' },
    ],
  },
};

/** The lists shared by all resource types; shown once, under the first resource group. */
const RESOURCE_LIST_INFO: CustomizeListInfo = {
  lists: [
    { labelKey: 'list_resource_type', category: 'resource_type' },
    { labelKey: 'list_tags_resource', tags: (tagModel) => tagModel === 'resource' || tagModel.startsWith('resource.') },
  ],
  links: [
    { labelKey: 'link_categories', url: '/category/all/c-category' },
    { labelKey: 'link_tags', url: '/aoc/tag' },
  ],
};

/** The fixed groups, in order; one group per resource field list of the tenant's types follows. */
const FIXED_GROUP_MODELS = ['person', 'org'];

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
            @if (isConfigLoaded()) {
              <ion-button slot="end" fill="clear" size="small" (click)="onReset(group.modelKey)">
                {{ text('reset') }}
              </ion-button>
            }
          </ion-item-divider>
          @if (group.note) {
            <ion-item lines="none">
              <ion-note class="ion-text-wrap">{{ group.note }}</ion-note>
            </ion-item>
          }
          @if (isConfigLoaded()) {
            @for (field of group.fields; track field.field + '/' + epoch()) {
              <okr-checkbox
                [i18n]="field.i18n"
                [checked]="field.visible"
                [readOnly]="false"
                (checkedChange)="onToggle(group.modelKey, field.field, $event)" />
            }
          }
          @if (group.lists.length > 0) {
            <ion-item-divider>
              <ion-label>{{ text('lists_title') }}</ion-label>
            </ion-item-divider>
            <ion-item lines="none">
              <ion-note class="ion-text-wrap">{{ text('lists_note') }}</ion-note>
            </ion-item>
            @for (list of group.lists; track list.key) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ list.label }}</h3>
                  @if (list.state) {
                    <p>{{ list.state }}</p>
                  }
                </ion-label>
              </ion-item>
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

    @if (isConfigLoaded() && featureStore.settled() && widgets().length > 0) {
      <ion-list>
        <ion-item-group>
          <ion-item-divider>
            <ion-icon slot="start" src="{{ 'home' | svgIcon }}" />
            <ion-label>{{ text('group_dashboard') }}</ion-label>
          </ion-item-divider>
          <ion-item lines="none">
            <ion-note class="ion-text-wrap">{{ text('dashboard_intro') }}</ion-note>
          </ion-item>
          @for (widget of widgets(); track widget.key + '/' + epoch()) {
            @if (widget.blockOn) {
              <okr-checkbox
                [i18n]="widget.i18n"
                [checked]="widget.visible"
                [readOnly]="false"
                (checkedChange)="onToggleWidget(widget.key, $event)" />
              @if (widget.onlyHere) {
                <ion-item lines="none">
                  <ion-note class="ion-text-wrap">{{ text('widget_only_here') }}</ion-note>
                </ion-item>
              }
            } @else {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h3>{{ widget.title }}</h3>
                  <p>{{ widget.offText }}</p>
                </ion-label>
                <ion-button slot="end" fill="clear" size="small" (click)="showBlocks.emit()">
                  {{ text('widget_off_button') }}
                </ion-button>
              </ion-item>
            }
          }
          <ion-item lines="none">
            <ion-note class="ion-text-wrap">{{ text('dashboard_badges') }}</ion-note>
          </ion-item>
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
  private readonly pageService = inject(PageService);
  private readonly sectionService = inject(SectionService);
  protected readonly featureStore = inject(FeatureStore);

  /** The user wants to switch the picker to its segment of blocks. */
  public readonly showBlocks = output<void>();

  protected readonly i18n = this.i18nService.translateAll(CUSTOMIZE_I18N_KEYS);

  private readonly copyI18n = this.i18nService.translateAll(LIST_COPY_I18N_KEYS);

  private readonly enqueue = createSerialQueue();

  /** Bumped after a failed write: the checkboxes are drawn anew from the stored state. */
  protected readonly epoch = signal(0);

  /** Until the stored config is here, `appConfig()` is the class default: writing from it would replace the tenant's settings. */
  protected readonly isConfigLoaded = computed(() => this.appStore.isAppConfigSettled() && this.appStore.appConfigResource.hasValue());

  protected readonly groups = computed(() => {
    const stored = this.isConfigLoaded() ? this.appStore.appConfig().modelFields : undefined;
    const isResourceOn = this.isConfigLoaded() && this.featureStore.settled() && this.featureStore.isEnabled()('resource');
    const resourceTypes = isResourceOn ? this.appStore.tryGetCategory('resource_type')?.items ?? [] : [];
    const resourceKeys = [...new Set(resourceTypes.map((item) => resourceFieldKey(item.name)))];
    const models = [...FIXED_GROUP_MODELS, ...resourceKeys];
    return models.map((modelKey, index) => {
      const hidden = hiddenFieldsOf(modelKey, stored);
      const info = LIST_INFO[modelKey] ?? (index === FIXED_GROUP_MODELS.length ? RESOURCE_LIST_INFO : { lists: [], links: [] });
      return {
        modelKey,
        note: modelKey === 'resource.other' ? this.text('resource_other_note') : '',
        title: this.text(customizeGroupKey(modelKey)),
        fields: (MODEL_FIELDS[modelKey] ?? []).map((spec) => ({
          field: spec.field,
          visible: !hidden.has(spec.field),
          i18n: { name: `${modelKey}-${spec.field}`, label: this.text(customizeFieldKey(modelKey, spec.field)), helper: '' } as CheckboxI18n,
        })),
        lists: info.lists.map((list) => ({ key: list.labelKey, label: this.text(list.labelKey), state: this.listState(list) })),
        links: info.links.map((link) => ({ url: link.url, label: this.text(link.labelKey) })),
      };
    });
  });

  /** The tenant's dashboard page and its sections, in page order; live, like the page itself. */
  private readonly dashboard = rxResource({
    params: resourceParams(() => ({ tenantId: this.appStore.tenantId() })),
    stream: ({ params }) => {
      const tenantId = params.tenantId;
      if (!tenantId) return of([] as WidgetEntry[]);
      return this.pageService.read('dashboard').pipe(
        switchMap((page) => {
          if (!page || !belongsToTenant(page, tenantId) || !page.sections?.length) return of([] as WidgetEntry[]);
          return combineLatest(page.sections.map((pageKey) =>
            this.sectionService.read(pageKey.replace('@TID@', tenantId)).pipe(
              map((section): WidgetEntry | undefined => (section && belongsToTenant(section, tenantId) ? { pageKey, section } : undefined)),
              // one section that cannot be read must not hide the others
              catchError(() => of(undefined)),
            ))).pipe(map((entries) => entries.filter((e): e is WidgetEntry => !!e)));
        }),
        catchError(() => of([] as WidgetEntry[])),
      );
    },
  });

  protected readonly widgets = computed(() => {
    const tenantId = this.appStore.tenantId();
    const entries = this.dashboard.hasValue() ? this.dashboard.value() : [];
    const isEnabled = this.featureStore.settled() ? this.featureStore.isEnabled() : () => true;
    return buildWidgetRows(entries, tenantId, this.appStore.appConfig()?.hiddenWidgets, isEnabled).map((row) => {
      const typeLabel = this.text(`type_${row.type}`) || row.type;
      const title = row.title || typeLabel;
      const block = FEATURE_BLOCKS.find((b) => b.id === row.block);
      const blockName = block ? this.blockLabels[block.id]?.() || block.id : (row.block ?? '');
      return {
        ...row,
        title,
        offText: fill(this.text('widget_off'), { block: blockName }),
        i18n: { name: `dashboard-${row.key}`, label: title, helper: row.isDraft ? this.text('widget_draft') : '' } as CheckboxI18n,
      };
    });
  });

  private readonly blockLabels = this.i18nService.translateAll(
    Object.fromEntries(FEATURE_BLOCKS.map((block) => [block.id, block.label])));

  protected onToggleWidget(key: string, visible: boolean): void {
    void this.enqueue(async () => {
      let saved = false;
      try {
        const tenantId = this.appStore.tenantId();
        if (!tenantId || !this.isConfigLoaded()) return;
        const next = withWidgetVisibility(this.appStore.appConfig()?.hiddenWidgets, key, visible, tenantId);
        saved = !!await this.appConfigService.setHiddenWidgets(tenantId, next);
      } catch (error) {
        this.alertService.error(`CustomizeTab.onToggleWidget(${key}): ${error}`);
      } finally {
        if (!saved) this.epoch.update((n) => n + 1);
      }
    });
  }

  /** «gemeinsame Liste», «eigene Liste» …; empty when the lists behind one row differ (tags per resource type). */
  private listState(list: CustomizeList): string {
    const tenantId = this.appStore.tenantId();
    const stateOf = <T extends { tenants?: string[] }>(docs: T[], namesOf: (doc: T) => string[]): string => {
      const status = copyStatus(docs, tenantId, namesOf);
      return fill(this.copyI18n[listCopyTextKey(status)](), { n: status.missing.length });
    };
    if (list.category) {
      const docs = this.appStore.allCategories().filter((cat) => cat.name === list.category);
      return docs.length === 0 ? '' : stateOf(docs, (cat) => (cat.items ?? []).map((item) => item.name));
    }
    const tags = this.appStore.allTags().filter((tag) => list.tags?.(tag.tagModel));
    const states = new Set([...new Set(tags.map((tag) => tag.tagModel))].map((tagModel) =>
      stateOf(tags.filter((tag) => tag.tagModel === tagModel), (tag) => string2stringArray(tag.tags ?? ''))));
    return states.size === 1 ? [...states][0] : '';
  }

  protected text(name: string): string {
    return this.i18n[name]?.() ?? '';
  }

  protected onToggle(modelKey: string, field: string, visible: boolean): void {
    this.write((stored) => withFieldVisibility(stored, modelKey, field, visible), `onToggle(${modelKey}.${field})`);
  }

  protected async onReset(modelKey: string): Promise<void> {
    if (!await this.alertService.confirm(this.text('reset_confirm'), true)) return;
    this.write((stored) => withoutModel(stored, modelKey), `onReset(${modelKey})`);
  }

  protected onNavigate(url: string): void {
    void this.router.navigateByUrl(url);
  }

  /**
   * `updateObject` reports a failure by returning undefined (after showing its own error toast),
   * and shows the one confirmation toast on success — so this adds no toast of its own.
   */
  private write(next: (stored: ModelFieldMap | undefined) => ModelFieldMap, where: string): void {
    void this.enqueue(async () => {
      let saved = false;
      try {
        const tenantId = this.appStore.tenantId();
        if (!tenantId || !this.isConfigLoaded()) return;
        saved = !!await this.appConfigService.setModelFields(tenantId, next(this.appStore.appConfig()?.modelFields));
      } catch (error) {
        this.alertService.error(`CustomizeTab.${where}: ${error}`);
      } finally {
        if (!saved) this.epoch.update((n) => n + 1);
      }
    });
  }
}
